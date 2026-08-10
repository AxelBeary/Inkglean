import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { buildApp } from '../src/app.js'

/**
 * audit-a P2-7: 订单公开路由不泄露 hidden/管理员画师
 */

describe('audit-a P2-7 公开订单路由可见性', () => {
  let app
  let ipCounter = 0

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function uniqueIp() {
    return `10.9.${++ipCounter}.${ipCounter * 3}`
  }

  it('TC-P27-01: hidden 画师的 my/lookup/track 一律 404', async () => {
    const artist = seedArtist({ qq_number: '77001', subdomain: 'hidden-a', status: 'hidden' })
    seedOrder(artist.id, { order_no: 'HID-A-001', client_qq: '66001', queue_position: 1 })
    seedOrder(artist.id, { order_no: 'HID-A-002', client_qq: '66002', queue_position: 2 })

    expect((await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=hidden-a&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=hidden-a&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/orders/track/HID-A-001?qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(404)
  })

  it('TC-P27-02: 管理员账号的 my/lookup/track 一律 404', async () => {
    db.prepare("UPDATE platform_config SET value = '77009' WHERE key = 'admin_qq'").run()
    const artist = seedArtist({ qq_number: '77009', subdomain: 'admin-artist' })
    seedOrder(artist.id, { order_no: 'ADM-001', client_qq: '66001', queue_position: 1 })

    expect((await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=admin-artist&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=admin-artist&qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/api/orders/track/ADM-001?qq=66001', remoteAddress: uniqueIp() })).statusCode).toBe(404)
  })

  it('TC-P27-03: 可见画师 my/lookup/track 回归正常', async () => {
    const artist = seedArtist({ qq_number: '77010', subdomain: 'visible-a' })
    seedOrder(artist.id, { order_no: 'VIS-001', client_qq: '66001', queue_position: 1 })
    seedOrder(artist.id, { order_no: 'VIS-002', client_qq: '66001', queue_position: 2 })

    const my = await app.inject({ method: 'GET', url: '/api/orders/my?subdomain=visible-a&qq=66001', remoteAddress: uniqueIp() })
    expect(my.statusCode).toBe(200)
    expect(my.json()).toHaveLength(2)

    const lookup = await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=visible-a&qq=66001', remoteAddress: uniqueIp() })
    expect(lookup.statusCode).toBe(200)
    expect(lookup.json().hasOrders).toBe(true)

    const track = await app.inject({ method: 'GET', url: '/api/orders/track/VIS-001?qq=66001', remoteAddress: uniqueIp() })
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
