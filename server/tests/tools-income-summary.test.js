import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// 画师收入汇总端点 GET /api/artist/tools/income-summary?from=&to=
// 订单收款（order_payments）+ 散单（standalone_incomes）按日期区间汇总
// ============================================

describe('income-summary 收入汇总端点', () => {
  let app, artist, token

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist()
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function addOrderPayment(artistId, amountCents, createdAt) {
    const o = seedOrder(artistId, { order_no: `IS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, client_qq: '10001' })
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)')
      .run(o.id, amountCents, createdAt, 'artist')
    return o
  }

  function addStandalone(artistId, amountCents, incomeDate) {
    db.prepare('INSERT INTO standalone_incomes (artist_id, amount_cents, client_name, note, income_date) VALUES (?, ?, ?, ?, ?)')
      .run(artistId, amountCents, '散单客户', '', incomeDate)
  }

  it('TC-IS-01: 无数据 → 0/0/0', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01&to=2026-08-31',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      orderIncomeCents: 0,
      standaloneIncomeCents: 0,
      totalCents: 0,
      from: '2026-08-01',
      to: '2026-08-31'
    })
  })

  it('TC-IS-02: 订单收款（含退款负数）+ 散单 → 合计正确', async () => {
    addOrderPayment(artist.id, 10000, '2026-08-01 08:00:00')
    addOrderPayment(artist.id, -2000, '2026-08-05 08:00:00')
    addStandalone(artist.id, 5000, '2026-08-10')

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01&to=2026-08-31',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.orderIncomeCents).toBe(8000) // 10000 - 2000
    expect(body.standaloneIncomeCents).toBe(5000)
    expect(body.totalCents).toBe(13000)
  })

  it('TC-IS-03: 区间过滤——区间外订单收款/散单不计入', async () => {
    addOrderPayment(artist.id, 10000, '2026-07-31 08:00:00') // 区间外
    addOrderPayment(artist.id, 3000, '2026-08-15 08:00:00')  // 区间内
    addStandalone(artist.id, 5000, '2026-07-01')             // 区间外
    addStandalone(artist.id, 7000, '2026-08-20')             // 区间内

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01&to=2026-08-31',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.orderIncomeCents).toBe(3000)
    expect(body.standaloneIncomeCents).toBe(7000)
    expect(body.totalCents).toBe(10000)
  })

  it('TC-IS-04: 权限——未登录 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01&to=2026-08-31'
    })
    expect(res.statusCode).toBe(401)
  })

  it('TC-IS-05: 权限——两个画师数据互相看不到（隔离）', async () => {
    const other = seedArtist({ subdomain: 'bob', qq_number: '999' })
    const otherToken = createSession(other.id, other.token_version)
    addOrderPayment(artist.id, 10000, '2026-08-01 08:00:00')
    addOrderPayment(other.id, 99999, '2026-08-01 08:00:00')

    const mine = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01&to=2026-08-31',
      headers: { Authorization: `Bearer ${token}` }
    })
    const theirs = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01&to=2026-08-31',
      headers: { Authorization: `Bearer ${otherToken}` }
    })
    expect(mine.json().orderIncomeCents).toBe(10000)
    expect(theirs.json().orderIncomeCents).toBe(99999)
  })

  it('TC-IS-06: 参数校验——缺 from/to → 400', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res1.statusCode).toBe(400)

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026-08-01',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res2.statusCode).toBe(400)
  })

  it('TC-IS-07: 参数校验——非法日期 → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/income-summary?from=2026/08/01&to=2026-08-31',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(400)
  })
})