import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

/**
 * audit-a P2-7: 订单公开路由不泄露 hidden/管理员画师
 */

describe('audit-a P2-7 公开订单路由可见性', () => {
  let app: FastifyInstance
  let ipCounter = 0

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function uniqueIp(): string {
    return `10.9.${++ipCounter}.${ipCounter * 3}`
  }

  it('TC-P27-01: hidden 画师 my/lookup 退役 410；track 令牌正确仍 404（不泄露画师）', async () => {
    const artist = seedArtist({ qq_number: '77001', subdomain: 'hidden-a', status: 'hidden' })
    const order = seedOrder(artist.id, { order_no: 'HID-A-001', client_qq: '66001', queue_position: 1 })
    seedOrder(artist.id, { order_no: 'HID-A-002', client_qq: '66002', queue_position: 2 })

    // F1 围剿：my/lookup 已整体退役（410），与画师可见性无关
    expect((await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=hidden-a&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(410)
    expect((await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=hidden-a&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(410)
    // track 令牌门禁通过后仍受画师可见性门禁约束
    expect((await app.inject({ method: 'GET', url: `/api/orders/track/HID-A-001?token=${order.customerToken}`, remoteAddress: uniqueIp() })).statusCode).toBe(404)
  })

  it('TC-P27-02: 管理员账号 status=open 时 my/lookup 退役 410；track 凭令牌 200', async () => {
    db.prepare("UPDATE platform_config SET value = '77009' WHERE key = 'admin_qq'").run()
    const artist = seedArtist({ qq_number: '77009', subdomain: 'admin-artist', status: 'open' })
    const order = seedOrder(artist.id, { order_no: 'ADM-001', client_qq: '66001', queue_position: 1 })

    const my = await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=admin-artist&qq=66001', remoteAddress: uniqueIp() })
    expect(my.statusCode).toBe(410)
    expect(my.json().code).toBe('MY_ORDERS_RETIRED')

    const lookup = await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=admin-artist&qq=66001', remoteAddress: uniqueIp() })
    expect(lookup.statusCode).toBe(410)
    expect(lookup.json().code).toBe('LOOKUP_RETIRED')

    const track = await app.inject({ method: 'GET', url: `/api/orders/track/ADM-001?token=${order.customerToken}`, remoteAddress: uniqueIp() })
    expect(track.statusCode).toBe(200)
    expect(track.json().orderNo).toBe('ADM-001')
  })

  it('TC-P27-02b: 管理员账号 hidden 时 my/lookup 退役 410；track 凭令牌仍 404（回归）', async () => {
    db.prepare("UPDATE platform_config SET value = '77009' WHERE key = 'admin_qq'").run()
    const artist = seedArtist({ qq_number: '77009', subdomain: 'admin-artist', status: 'hidden' })
    const order = seedOrder(artist.id, { order_no: 'ADM-002', client_qq: '66001', queue_position: 1 })

    expect((await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=admin-artist&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(410)
    expect((await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=admin-artist&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(410)
    expect((await app.inject({ method: 'GET', url: `/api/orders/track/ADM-002?token=${order.customerToken}`, remoteAddress: uniqueIp() })).statusCode).toBe(404)
  })

  it('TC-P27-06: 管理员账号 status=open 时目录/公开主页可见，hidden 时目录排除、主页 UI-8 最小信息', async () => {
    db.prepare("UPDATE platform_config SET value = '77013' WHERE key = 'admin_qq'").run()
    const admin = seedArtist({ qq_number: '77013', subdomain: 'admin-profile', status: 'open' })
    // 方案 A（2026-08-21）：目录新增开业就绪门槛——补齐作品+启用画风尺寸，
    // 确保本用例验证的是「管理员账号与普通画师同权可见」而非被就绪门槛误伤
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/adm/a.webp', '作品')").run(admin.id)
    const styleRow = db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(admin.id, '日系')
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)').run(Number(styleRow.lastInsertRowid), '头像', 50)

    const dir = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(dir.statusCode).toBe(200)
    expect(dir.json().some((a: { subdomain: string }) => a.subdomain === 'admin-profile')).toBe(true)

    const profile = await app.inject({ method: 'GET', url: '/api/artists/admin-profile' })
    expect(profile.statusCode).toBe(200)
    expect(profile.json().status).toBe('open')

    db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(admin.id)

    const dirHidden = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(dirHidden.statusCode).toBe(200)
    expect(dirHidden.json().some((a: { subdomain: string }) => a.subdomain === 'admin-profile')).toBe(false)

    // UI-8 既有语义保留：hidden 公开主页返回 200 + 最小信息（不暴露 bio/pricing/artworks），店主可见隐藏态提示
    const profileHidden = await app.inject({ method: 'GET', url: '/api/artists/admin-profile' })
    expect(profileHidden.statusCode).toBe(200)
    expect(profileHidden.json()).toEqual({ id: admin.id, name: admin.name, subdomain: 'admin-profile', status: 'hidden' })
  })

  it('TC-P27-03: 可见画师 my/lookup 退役 410；track 凭令牌回归正常', async () => {
    const artist = seedArtist({ qq_number: '77010', subdomain: 'visible-a' })
    const vis1 = seedOrder(artist.id, { order_no: 'VIS-001', client_qq: '66001', queue_position: 1 })
    seedOrder(artist.id, { order_no: 'VIS-002', client_qq: '66001', queue_position: 2 })

    const my = await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=visible-a&qq=66001', remoteAddress: uniqueIp() })
    expect(my.statusCode).toBe(410)
    expect(my.json().code).toBe('MY_ORDERS_RETIRED')

    const lookup = await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=visible-a&qq=66001', remoteAddress: uniqueIp() })
    expect(lookup.statusCode).toBe(410)
    expect(lookup.json().code).toBe('LOOKUP_RETIRED')

    const track = await app.inject({ method: 'GET', url: `/api/orders/track/VIS-001?token=${vis1.customerToken}`, remoteAddress: uniqueIp() })
    expect(track.statusCode).toBe(200)
    expect(track.json().orderNo).toBe('VIS-001')
  })

  it('TC-P27-04: 下单接口 hidden 画师 → 404 ARTIST_NOT_FOUND（不泄露存在性）', async () => {
    seedArtist({ qq_number: '77011', subdomain: 'hidden-b', status: 'hidden' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      remoteAddress: uniqueIp(),
      payload: { subdomain: 'hidden-b', clientQq: '66001', agreeRules: true }
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('ARTIST_NOT_FOUND')
  })

  it('TC-P27-05: 可见但非 open 画师下单仍为 ARTIST_NOT_OPEN（行为不变）', async () => {
    seedArtist({ qq_number: '77012', subdomain: 'closed-a', status: 'full' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      remoteAddress: uniqueIp(),
      payload: { subdomain: 'closed-a', clientQq: '66001', agreeRules: true }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ARTIST_NOT_OPEN')
  })
})

/**
 * audit-a P3-16: 公开读接口限流口径对齐（30次/分钟/IP）
 */
describe('audit-a P3-16 公开读接口限流', () => {
  let app: FastifyInstance
  let ipCounter = 100

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function uniqueIp(): string {
    return `10.20.${++ipCounter}.${ipCounter}`
  }

  async function assertLimited(url: string) {
    const ip = uniqueIp()
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({ method: 'GET', url, remoteAddress: ip })
      expect(res.statusCode).toBeLessThan(500)
    }
    const blocked = await app.inject({ method: 'GET', url, remoteAddress: ip })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().code).toBe('RATE_LIMITED')
  }

  it('TC-P316-01: GET /api/artists/:subdomain 超限返回 429', async () => {
    seedArtist({ qq_number: '77101', subdomain: 'rl-artist' })
    await assertLimited('/api/artists/rl-artist')
  })

  it('TC-P316-02: GET /api/artists/:subdomain/workflow 超限返回 429', async () => {
    seedArtist({ qq_number: '77102', subdomain: 'rl-workflow' })
    await assertLimited('/api/artists/rl-workflow/workflow')
  })

  it('TC-P316-03: GET /api/public/artist/:subdomain/messages 超限返回 429', async () => {
    seedArtist({ qq_number: '77103', subdomain: 'rl-guest' })
    await assertLimited('/api/public/artist/rl-guest/messages')
  })
})
