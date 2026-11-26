// F0314 后端回归：track 响应下发权威 nextDueCents（下期应付）
// 口径：getNextDueCents 内部走 deriveInstallmentProgress（与 computeLockedState 同一 forwardFill），
// 取首个 remainingCents > 0 的节点（partial 时为其剩余）；全付清/无节点为 0；尾款负待收（纯超付
// 应退）不满足 > 0，恒 ≥ 0。用例镜像 installment-negative-tail-display.test.ts 的
// 负尾款 / 带内 / 纯超付 / 负节点跳过 四形态，并做端到端（GET /orders/track）断言。
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'
import { getNextDueCents } from '../src/features/order/order-pricing.js'

/** 展示行形状（getOrderInstallments 的 amountCents 口径：amount_cents || 0） */
function displayRows(insts: Array<[string, number]>) {
  return insts.map(([, amt]) => ({ amountCents: amt || 0 }))
}

// 纯函数单元：getNextDueCents 内部只走引擎推导，不触库——无需种子数据
describe('getNextDueCents 单元口径（F0314，镜像负尾款四形态）', () => {
  it('负尾款 + 已收 ≥ Σ正节点：无幻影下期（0）', () => {
    // [15000, -5000] 收 30000 —— 首节点付清、尾款待收 -20000 被 >0 过滤
    expect(getNextDueCents(displayRows([['定金', 15000], ['尾款', -5000]]), 30000)).toBe(0)
  })

  it('带内 partial：返回首节点剩余', () => {
    // [15000, -5000] 收 5000 —— 首节点 partial，下期 = 15000 - 5000
    expect(getNextDueCents(displayRows([['定金', 15000], ['尾款', -5000]]), 5000)).toBe(10000)
  })

  it('纯超付：尾款吸收全部剩余，负待收不下发（0）', () => {
    // [10000, 20000] 收 40000 —— 尾款待收 -10000，不作为下期应付
    expect(getNextDueCents(displayRows([['定金', 10000], ['尾款', 20000]]), 40000)).toBe(0)
  })

  it('常规分期：首个未覆盖节点金额', () => {
    // [10000, 20000, 20000] 收 30000 —— 前两节点付清，下期 = 尾款 20000
    expect(getNextDueCents(displayRows([['定金', 10000], ['中期', 20000], ['尾款', 20000]]), 30000)).toBe(20000)
  })

  it('零/负节点跳过：不吞覆盖额度，首个正节点即下期', () => {
    // [0, -3000, 5000] 收 0 —— 前两个无待收对象，下期 = 5000
    expect(getNextDueCents(displayRows([['占位', 0], ['冲正', -3000], ['尾款', 5000]]), 0)).toBe(5000)
  })

  it('无节点：返回 0（不回退订单级待收——那是 trackRemainingCents 的语义）', () => {
    expect(getNextDueCents([], 30000)).toBe(0)
  })
})

describe('GET /orders/track 下发 nextDueCents（F0314 端到端）', () => {
  let app: FastifyInstance
  let artist: ArtistRow

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist({ qq_number: '89231', subdomain: 'next-due-track' })
    seedArtistStages(artist.id)
  })

  /** 建 token 令牌化的订单 + 节点行，返回 { order, token } */
  function seedTrackedOrder(
    insts: Array<[string, number]>,
    priceCents: number | null,
    paidCents: number,
    customerToken: string
  ): { order: SeededOrder; token: string } {
    const order = seedOrder(artist.id, { customerToken })
    db.prepare('UPDATE orders SET total_price_cents = ?, final_price_cents = ?, paid_total_cents = ? WHERE id = ?')
      .run(priceCents, priceCents, paidCents, order.id)
    const insert = db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order, locked, locked_reason) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    insts.forEach(([name, amt], i) => insert.run(order.id, name, 0, amt, i + 1, 0, null))
    return { order, token: customerToken }
  }

  it('负尾款超付形态：nextDueCents=0，且与 installments 的待收合计一致（恒 ≥ 0）', async () => {
    const { order, token } = seedTrackedOrder([['定金', 15000], ['尾款', -5000]], 10000, 30000, 'nd-tok-negtail')

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': token }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ nextDueCents: number; installments: Array<{ remainingCents: number }> }>()

    expect(body.nextDueCents).toBe(0)
    expect(body.nextDueCents).toBeGreaterThanOrEqual(0)
    // 同源一致性：字段值 ≡ installments 里首个 remainingCents>0 的节点（此处无 → 0）
    const firstPositive = body.installments.find(i => i.remainingCents > 0)
    expect(body.nextDueCents).toBe(firstPositive ? firstPositive.remainingCents : 0)
  })

  it('带内 partial：nextDueCents = 首节点剩余，与 installments 同源', async () => {
    const { order, token } = seedTrackedOrder([['定金', 15000], ['尾款', -5000]], 10000, 5000, 'nd-tok-partial')

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': token }
    })
    const body = res.json<{ nextDueCents: number; installments: Array<{ remainingCents: number }> }>()

    expect(body.nextDueCents).toBe(10000)
    expect(body.nextDueCents).toBe(body.installments.find(i => i.remainingCents > 0)?.remainingCents)
  })

  it('常规分期：nextDueCents = 首个未覆盖节点金额；query 令牌（兼容窗口）同样下发', async () => {
    const { order, token } = seedTrackedOrder(
      [['定金', 10000], ['中期', 20000], ['尾款', 20000]], 50000, 30000, 'nd-tok-regular'
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}?token=${encodeURIComponent(token)}`
    })
    const body = res.json<{ nextDueCents: number; installments: Array<{ remainingCents: number }> }>()

    expect(body.nextDueCents).toBe(20000)
    expect(body.nextDueCents).toBe(body.installments.find(i => i.remainingCents > 0)?.remainingCents)
  })

  it('无节点订单：nextDueCents=0（不回退订单级待收，语义区别于 trackRemainingCents）', async () => {
    const order = seedOrder(artist.id, { customerToken: 'nd-tok-empty' })
    db.prepare('UPDATE orders SET total_price_cents = 30000, final_price_cents = 30000, paid_total_cents = 0 WHERE id = ?')
      .run(order.id)

    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': 'nd-tok-empty' }
    })
    const body = res.json<{ nextDueCents: number; finalPriceCents: number; paidTotalCents: number }>()

    expect(body.nextDueCents).toBe(0)
    // 订单级待收仍在（30000），证明两者语义分工而非同字段复用
    expect(body.finalPriceCents - body.paidTotalCents).toBe(30000)
  })
})
