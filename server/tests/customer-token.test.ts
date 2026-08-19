import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

const AUTH_PREFIX = 'Bearer '

/** order_activity_logs 行（测试消费字段） */
interface ActivityLogRow {
  action_type: string
  actor: string
  detail_json: string
}

/**
 * F1 围剿：客户访问令牌化（根治 QQ+订单号弱双因子）
 * - 正确令牌 track/delivery 200；错误/缺令牌 404 且不泄漏订单存在性
 * - /my 与 /lookup 退役返回 410
 * - 画师重新生成令牌后旧令牌失效、新令牌生效
 * - 校验实现引用 crypto.timingSafeEqual（常量时间比较）
 */
describe('F1 客户访问令牌化', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function authH(artist: ArtistRow): { Authorization: string } {
    const token = createSession(artist.id, artist.token_version)
    return { Authorization: AUTH_PREFIX + token }
  }

  it('TC-CT-01: POST /api/orders 成功响应一次下发 customerToken + trackUrl，库中只存 sha256 哈希', async () => {
    const artist = seedArtist({ qq_number: '88001', subdomain: 'ct-create' })
    seedArtistStages(artist.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        subdomain: 'ct-create',
        clientQq: '99001',
        clientName: '令牌测试',
        agreeRules: true
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // 18 字节 base64url → 24 字符；只含 URL 安全字符
    expect(body.customerToken).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(body.trackUrl).toContain('/artist/ct-create/track?no=')
    expect(body.trackUrl).toContain(`token=${encodeURIComponent(body.customerToken)}`)

    const row = db.prepare(
      'SELECT customer_token_hash FROM orders WHERE order_no = ?'
    ).get(body.orderNo) as { customer_token_hash: string }
    expect(row.customer_token_hash).toBe(createHash('sha256').update(body.customerToken).digest('hex'))
    // 库中不得出现令牌明文
    expect(row.customer_token_hash).not.toContain(body.customerToken)
  })

  it('TC-CT-02: 正确令牌 track 200，错误/缺令牌与不存在订单号响应同形 404', async () => {
    const artist = seedArtist({ qq_number: '88002', subdomain: 'ct-track' })
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'CT-TRACK-01',
      client_qq: '99002',
      customerToken: 'ct-track-token-0001'
    })

    const ok = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}?token=ct-track-token-0001`
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().orderNo).toBe('CT-TRACK-01')

    const wrong = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}?token=wrong-token`
    })
    const missing = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`
    })
    const nonexistent = await app.inject({
      method: 'GET',
      url: '/api/orders/track/CT-NO-SUCH?token=whatever'
    })

    for (const res of [wrong, missing, nonexistent]) {
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('ORDER_NOT_FOUND')
    }
    // 同形：不暴露订单存在性
    expect(wrong.json()).toEqual(nonexistent.json())
    expect(missing.json()).toEqual(nonexistent.json())
  })

  it('TC-CT-03: 正确令牌 delivery 200，错误令牌/不存在订单号同形 404', async () => {
    const artist = seedArtist({ qq_number: '88003', subdomain: 'ct-delivery' })
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'CT-DLV-01',
      client_qq: '99003',
      customerToken: 'ct-delivery-token-001'
    })
    db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(order.id, 'deliverables/1/a.png', 'a.png', 1024)

    const ok = await app.inject({
      method: 'GET',
      url: `/api/orders/delivery/${order.order_no}?token=ct-delivery-token-001`
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().orderNo).toBe('CT-DLV-01')
    expect(ok.json().deliverables).toHaveLength(1)

    const wrong = await app.inject({
      method: 'GET',
      url: `/api/orders/delivery/${order.order_no}?token=wrong`
    })
    const nonexistent = await app.inject({
      method: 'GET',
      url: '/api/orders/delivery/CT-NO-SUCH?token=whatever'
    })
    expect(wrong.statusCode).toBe(404)
    expect(nonexistent.statusCode).toBe(404)
    expect(wrong.json()).toEqual(nonexistent.json())
  })

  it('TC-CT-04: /my 与 /lookup 退役返回 410 + 友好错误码', async () => {
    const artist = seedArtist({ qq_number: '88004', subdomain: 'ct-retire' })
    seedOrder(artist.id, { order_no: 'CT-RETIRE-01', client_qq: '99004' })

    const my = await app.inject({
      method: 'GET',
      url: '/api/orders/my?subdomain=ct-retire&qq=99004'
    })
    expect(my.statusCode).toBe(410)
    expect(my.json().code).toBe('MY_ORDERS_RETIRED')

    const lookup = await app.inject({
      method: 'GET',
      url: '/api/orders/lookup?subdomain=ct-retire&qq=99004'
    })
    expect(lookup.statusCode).toBe(410)
    expect(lookup.json().code).toBe('LOOKUP_RETIRED')
  })

  it('TC-CT-05: 画师重新生成令牌后旧令牌失效、新令牌生效', async () => {
    const artist = seedArtist({ qq_number: '88005', subdomain: 'ct-regen' })
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'CT-REGEN-01',
      client_qq: '99005',
      customerToken: 'ct-old-token-0000001'
    })

    const regen = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/regenerate-token`,
      headers: authH(artist)
    })
    expect(regen.statusCode).toBe(200)
    const body = regen.json()
    expect(body.customerToken).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(body.customerToken).not.toBe('ct-old-token-0000001')
    expect(body.trackUrl).toContain('/artist/ct-regen/track?no=CT-REGEN-01')

    const oldLink = await app.inject({
      method: 'GET',
      url: `/api/orders/track/CT-REGEN-01?token=ct-old-token-0000001`
    })
    expect(oldLink.statusCode).toBe(404)

    const newLink = await app.inject({
      method: 'GET',
      url: `/api/orders/track/CT-REGEN-01?token=${encodeURIComponent(body.customerToken)}`
    })
    expect(newLink.statusCode).toBe(200)
    expect(newLink.json().orderNo).toBe('CT-REGEN-01')
  })

  it('TC-CT-05b: regenerate-token 递增 version 并写活动日志（L-2 审计 三#5）', async () => {
    const artist = seedArtist({ qq_number: '88006', subdomain: 'ct-regen-v' })
    const order = seedOrder(artist.id, { order_no: 'CT-REGEN-V1', client_qq: '99006' })
    const versionBefore = order.version

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/regenerate-token`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)

    // version 递增（写路径可感知令牌补发）
    const row = db.prepare('SELECT version FROM orders WHERE id = ?').get(order.id) as { version: number }
    expect(row.version).toBe(versionBefore + 1)

    // 活动日志留痕（沿用既有 note_update 类型 + detail.action 标记；DB CHECK 六类、迁移禁改）
    const logs = db.prepare(
      "SELECT action_type, actor, detail_json FROM order_activity_logs WHERE order_id = ? ORDER BY id DESC"
    ).all(order.id) as ActivityLogRow[]
    expect(logs[0].action_type).toBe('note_update')
    expect(logs[0].actor).toBe('artist')
    expect(JSON.parse(logs[0].detail_json)).toEqual({ action: 'token_regenerate' })
  })

  it('TC-CT-06: 令牌校验实现引用 crypto.timingSafeEqual（常量时间比较）', () => {
    const src = readFileSync(
      new URL('../src/features/order/order-read.ts', import.meta.url),
      'utf8'
    )
    expect(src).toContain('timingSafeEqual')
  })
})
