import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { updateDeadline } from '../src/features/order/order.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// track 接口补收款明细（payments）+ 截稿日（deadline）
// GET /api/orders/track/:orderNo?qq=
// ============================================

describe('track 接口收款明细与截稿日', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function makeArtist(qq = '88011', sub = 'track-pay') {
    return seedArtist({ qq_number: qq, subdomain: sub })
  }

  function addPayment(orderId, amountCents, note, createdAt, createdBy = 'artist') {
    db.prepare(
      'INSERT INTO order_payments (order_id, amount_cents, note, created_at, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(orderId, amountCents, note || null, createdAt, createdBy)
  }

  it('TC-TP-01: track 响应含 payments 数组（金额/备注/时间，按创建时间升序）与 deadline', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'TEST-TP01',
      client_qq: '99011'
    })
    // 一正一负：定金 + 退款
    addPayment(order.id, 10000, '定金', '2026-08-01 08:00:00')
    addPayment(order.id, -2000, '退款', '2026-08-02 08:00:00')

    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/track/TEST-TP01?qq=99011'
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(Array.isArray(body.payments)).toBe(true)
    expect(body.payments).toHaveLength(2)
    // 顺序：created_at 升序
    expect(body.payments.map(p => p.amountCents)).toEqual([10000, -2000])
    expect(body.payments[0]).toEqual({
      id: expect.any(Number),
      amountCents: 10000,
      note: '定金',
      createdAt: '2026-08-01 08:00:00'
    })
    expect(body.payments[1].amountCents).toBe(-2000)
    expect(body.payments[1].note).toBe('退款')
    // 不含内部字段
    expect(body.payments[0].created_by).toBeUndefined()
    expect(body.payments[0].installment_id).toBeUndefined()
    // deadline 未设置 → null
    expect(body.deadline).toBeNull()
  })

  it('TC-TP-02: deadline 已设置 → 返回；无收款 → payments 空数组', async () => {
    const artist = makeArtist('88012', 'track-pay2')
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'TEST-TP02',
      client_qq: '99012'
    })
    // 模拟画师端设置截稿日
    updateDeadline(order.id, '2026-09-30T12:00:00Z')

    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/track/TEST-TP02?qq=99012'
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.deadline).toMatch(/^2026-09-30/)
    expect(body.payments).toEqual([])
  })

  it('TC-TP-03: 收款明细按客户订单隔离（订单号不匹配的 QQ 查不到）', async () => {
    const artist = makeArtist('88013', 'track-pay3')
    seedArtistStages(artist.id)
    const order = seedOrder(artist.id, {
      order_no: 'TEST-TP03',
      client_qq: '99013'
    })
    addPayment(order.id, 5000, '定金', '2026-08-03 08:00:00')

    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/track/TEST-TP03?qq=99998'
    })
    expect(res.statusCode).toBe(404)
  })
})