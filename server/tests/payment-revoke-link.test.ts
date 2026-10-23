// 审计 #21 条目 4：一笔正数收款不能被重复撤销
// 负数撤销流水关联被撤行 id（v78 revoke_of_payment_id），服务端按「该行已撤合计 + 本次 ≤ 该笔金额」设限；
// 不关联的负数流水（历史退款/手工冲正）维持旧规则，只受订单总额不为负约束。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow, SeededOrder } from './setup.js'
import { addPayment, getPayments } from '../src/features/order/order-pricing.js'

function row(id: number) {
  return db.prepare('SELECT * FROM order_payments WHERE id = ?').get(id) as
    { id: number; amount_cents: number; revoke_of_payment_id: number | null }
}

describe('撤销关联与单笔上限（#21-4）', () => {
  let artist: ArtistRow
  let order: SeededOrder

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89440', subdomain: 'revoke-link' })
    order = seedOrder(artist.id, { status: 'wip' })
  })

  it('TC-RVK-01: 关联撤销落 revoke_of_payment_id，paid_total 同步扣减', () => {
    const credit = addPayment(order.id, { amountCents: 10000, note: '定金' })
    const revoke = addPayment(order.id, { amountCents: -10000, note: '退定金', revokeOfPaymentId: credit.id })

    expect(revoke.amount_cents).toBe(-10000)
    expect(row(revoke.id).revoke_of_payment_id).toBe(credit.id)
    expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id)).toMatchObject({ paid_total_cents: 0 })
  })

  it('TC-RVK-02: 同一笔撤第二次 → 400 PAYMENT_REVOKE_LIMIT，且不落第二笔负数', () => {
    const credit = addPayment(order.id, { amountCents: 10000, note: '定金' })
    addPayment(order.id, { amountCents: -10000, note: '退定金', revokeOfPaymentId: credit.id })

    expect(() =>
      addPayment(order.id, { amountCents: -10000, note: '再退一次', revokeOfPaymentId: credit.id })
    ).toThrow('PAYMENT_REVOKE_LIMIT')

    const negatives = db.prepare("SELECT COUNT(*) AS c FROM order_payments WHERE order_id = ? AND amount_cents < 0").get(order.id) as { c: number }
    expect(negatives.c).toBe(1)
    expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id)).toMatchObject({ paid_total_cents: 0 })
  })

  it('TC-RVK-03: 分次撤到刚好等额可放行，再撤一笔才拒（按合计而非按次）', () => {
    const credit = addPayment(order.id, { amountCents: 10000, note: '定金' })

    addPayment(order.id, { amountCents: -6000, note: '部分退一', revokeOfPaymentId: credit.id })
    addPayment(order.id, { amountCents: -4000, note: '部分退二', revokeOfPaymentId: credit.id })

    expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id)).toMatchObject({ paid_total_cents: 0 })
    expect(() =>
      addPayment(order.id, { amountCents: -1, note: '零头再退', revokeOfPaymentId: credit.id })
    ).toThrow('PAYMENT_REVOKE_LIMIT')
  })

  it('TC-RVK-04: 超单笔但订单总额仍为正 → 依旧拒绝（旧口径只守总额下限）', () => {
    const first = addPayment(order.id, { amountCents: 1000, note: '第一笔' })
    addPayment(order.id, { amountCents: 9000, note: '第二笔' })

    expect(() =>
      addPayment(order.id, { amountCents: -2000, note: '超撤第一笔', revokeOfPaymentId: first.id })
    ).toThrow('PAYMENT_REVOKE_LIMIT')

    // 订单总已收 10000 未被扣成负数，说明拦截来自单笔上限而不是总下限
    expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id)).toMatchObject({ paid_total_cents: 10000 })
  })

  it('TC-RVK-05: 目标行不存在或属别的订单 → 404 NOT_FOUND', () => {
    const credit = addPayment(order.id, { amountCents: 5000, note: '定金' })
    const other = seedOrder(artist.id, { status: 'wip' })
    const otherCredit = addPayment(other.id, { amountCents: 5000, note: '他单定金' })

    expect(() =>
      addPayment(order.id, { amountCents: -1000, note: '撤他单', revokeOfPaymentId: otherCredit.id })
    ).toThrow('NOT_FOUND')
    expect(() =>
      addPayment(order.id, { amountCents: -1000, note: '撤幽灵行', revokeOfPaymentId: credit.id + 9999 })
    ).toThrow('NOT_FOUND')
    expect(row(credit.id)).toMatchObject({ amount_cents: 5000 })
  })

  it('TC-RVK-06: 撤销一笔负数流水 → 拒（不是应收款）', () => {
    const credit = addPayment(order.id, { amountCents: 3000, note: '定金' })
    const revoke = addPayment(order.id, { amountCents: -3000, note: '退定金', revokeOfPaymentId: credit.id })

    expect(() =>
      addPayment(order.id, { amountCents: -100, note: '撤退款', revokeOfPaymentId: revoke.id })
    ).toThrow('PAYMENT_REVOKE_LIMIT')
  })

  it('TC-RVK-07: 正数收款不能携带撤销关联', () => {
    const credit = addPayment(order.id, { amountCents: 3000, note: '定金' })

    expect(() =>
      addPayment(order.id, { amountCents: 1000, note: '乱挂关联', revokeOfPaymentId: credit.id })
    ).toThrow('VALIDATION')
  })

  it('TC-RVK-08: 不关联的负数流水维持旧规则（只守订单总额下限）', () => {
    addPayment(order.id, { amountCents: 8000, note: '定金' })

    const manual = addPayment(order.id, { amountCents: -3000, note: '线下退部分' })
    expect(row(manual.id).revoke_of_payment_id).toBeNull()
    expect(db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id)).toMatchObject({ paid_total_cents: 5000 })

    // 未关联的退款不计入该行的已撤额度：该行仍有 8000 的可撤余额
    const credits = getPayments(order.id).filter(p => p.amount_cents > 0)
    expect(credits.map(p => p.revoked_cents)).toEqual([0])
    const linked = addPayment(order.id, { amountCents: -5000, note: '关联撤满剩余额度', revokeOfPaymentId: credits[0].id })
    expect(row(linked.id).revoke_of_payment_id).toBe(credits[0].id)
    expect(getPayments(order.id).find(p => p.id === credits[0].id)?.revoked_cents).toBe(5000)
  })

  it('TC-RVK-09: 列表按行给出 revoked_cents（前端据此收起撤销入口）', () => {
    const a = addPayment(order.id, { amountCents: 10000, note: '定金' })
    const b = addPayment(order.id, { amountCents: 5000, note: '中期' })
    addPayment(order.id, { amountCents: -4000, note: '部分退', revokeOfPaymentId: a.id })

    const list = getPayments(order.id)
    const byId = new Map(list.map(p => [p.id, p]))

    expect(byId.get(a.id)?.revoked_cents).toBe(4000)
    expect(byId.get(b.id)?.revoked_cents).toBe(0)
    expect(list.filter(p => p.amount_cents < 0).map(p => p.revoke_of_payment_id)).toEqual([a.id])
  })
})
