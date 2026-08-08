// 外部审计 P1-3：金额聚合 ROUND
// 存量订单走 price_snapshot(REAL) 路径时，SQL 聚合 SUM 的浮点误差在 SQL 侧消除
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { getArtistStats } from '../src/features/order/order-stats.service.js'
import { PRICE_FALLBACK_SQL } from '../src/utils/price.js'

describe('金额聚合 ROUND (P1-3)', () => {
  beforeEach(() => cleanDb())

  function nowSqlite() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19)
  }

  it('TC-ROUND-01: 三条 0.1 元 snapshot 订单聚合为整数分（修复前 30.000000000000004）', () => {
    const artist = seedArtist()
    const ts = nowSqlite()
    for (let i = 0; i < 3; i++) {
      const order = seedOrder(artist.id, { status: 'done' })
      db.prepare('UPDATE orders SET price_snapshot = ?, completed_at = ? WHERE id = ?').run(0.1, ts, order.id)
    }
    const stats = getArtistStats(artist.id)
    expect(stats.monthRevenueCents).toBe(30)
    expect(stats.todayRevenueCents).toBe(30)
    expect(Number.isInteger(stats.monthRevenueCents)).toBe(true)
  })

  it('TC-ROUND-02: 混合 final_price_cents(整数) 与 snapshot 聚合仍精确', () => {
    const artist = seedArtist()
    const ts = nowSqlite()
    const o1 = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = ?, completed_at = ? WHERE id = ?').run(500, ts, o1.id)
    const o2 = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET price_snapshot = ?, completed_at = ? WHERE id = ?').run(0.1, ts, o2.id)
    const stats = getArtistStats(artist.id)
    // 500 + 10 = 510（修复前 snapshot 路径贡献 10.000000000000002）
    expect(stats.monthRevenueCents).toBe(510)
  })

  it('TC-ROUND-03: 单行取值路径（季度周分组）snapshot 也返回整数分', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET price_snapshot = ? WHERE id = ?').run(0.7, order.id)
    const row = db.prepare(`SELECT ${PRICE_FALLBACK_SQL} as cents FROM orders o WHERE o.id = ?`).get(order.id)
    // 0.7*100 = 69.99999999999999（修复前）；ROUND 后 = 70 整数
    expect(row.cents).toBe(70)
    expect(Number.isInteger(row.cents)).toBe(true)
  })

  it('TC-ROUND-04: 三级回退顺序不变（final > total > snapshot）', () => {
    const artist = seedArtist()
    const ts = nowSqlite()
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare(
      'UPDATE orders SET final_price_cents = ?, total_price_cents = ?, price_snapshot = ?, completed_at = ? WHERE id = ?'
    ).run(888, 777, 6.66, ts, order.id)
    const stats = getArtistStats(artist.id)
    expect(stats.monthRevenueCents).toBe(888)
  })
})
