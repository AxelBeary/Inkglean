/**
 * 审计批 260830 修复回归（后端 A 路）：
 *   H-1 计价引擎负 delta R8 下限 + checkOrderConservation R8 断言
 *   H-5 金额上限累加绕过（前置校验 + adjustFinalPrice 兜底断言）
 *
 * 矩阵覆盖（审计报告点名的缺口）：锁定状态 × 节点金额分布（含 0）× delta 符号：
 *   - H-1 报告最小构造：bp=[500,9500]、总价 1 分 → 节点 [0,1]，客户付清 1 分 →
 *     尾款锁（paidOff）/ 定金不锁（0 元节点不误锁）→ 减价 1 分：
 *     定金金额 ≥ 0、多出的 1 分进额外应退、A1 守恒成立；
 *   - 尾款未锁的常规负 delta（现行为不回归）；
 *   - 全锁负 delta（R9/R13 路径不回归）；
 *   - checkOrderConservation 的 R8 断言：手工构造非尾款负金额行 → 抛错（含 Σbp≠100% 早退兜底）；
 *   - H-5：连续加项触顶 → INVALID_PRICE 且整体回滚。
 *
 * 金额单位全部为「分」。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import {
  allocateInitial,
  computeLockedState,
  allocateDelta,
  assertConservation,
  type EngineInstallment
} from '../src/features/pricing/pricing-engine.js'
import { AppError, E } from '../src/shared/errors.js'
import { MAX_MONEY_CENTS } from '../src/features/order/order-limits.js'

beforeEach(() => cleanDb())

// ─── 测试辅助 ───

/** 通用节点构造（升序 sortOrder） */
function nodes(amounts: number[], bps: number[], paid: number[] = amounts.map(() => 0)): EngineInstallment[] {
  return amounts.map((amt, i) => ({
    id: i + 1,
    label: `节点${i + 1}`,
    sortOrder: i,
    basisPoints: bps[i],
    amountCents: amt,
    paidCents: paid[i]
  }))
}

/** 直插带价订单 + 手工节点 + base 条目（守恒自检的最小数据面） */
function seedConservationOrder(artist: ArtistRow, opts: {
  orderNo: string
  finalCents: number
  bps: number[]
  amounts: number[]
  paidTotal?: number
}): number {
  const r = db.prepare(`
    INSERT INTO orders (order_no, artist_id, client_qq, status, queue_zone, total_price_cents, final_price_cents, paid_total_cents)
    VALUES (?, ?, ?, 'pending', 'formal', ?, ?, ?)
  `).run(opts.orderNo, artist.id, '88400', opts.finalCents, opts.finalCents, opts.paidTotal ?? 0)
  const orderId = Number(r.lastInsertRowid)
  const ins = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  opts.amounts.forEach((amt, i) => ins.run(orderId, `节点${i + 1}`, opts.bps[i], amt, i))
  db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, created_by) VALUES (?, ?, ?, ?)').run(orderId, 'base', opts.finalCents, 'system')
  return orderId
}

// ============================================
// H-1：负 delta R8 下限（按绝对位置，审计批 260830）
// ============================================

describe('H-1：allocateDelta 负 delta R8 下限（按绝对位置）', () => {
  it('TC-R8-A-01: 报告最小构造——尾款锁/定金不锁，减价 1 分不打穿定金，超额进额外应退（A1 守恒）', () => {
    // bp=[500,9500]、总价 1 分 → allocateInitial 得 [0,1]（前节点 round(0.05)=0，末节点吸尾差）
    const bpNodes = nodes([0, 0], [500, 9500])
    const amounts = allocateInitial(bpNodes, 1)
    expect(amounts).toEqual([0, 1])

    // 客户付清 1 分：尾款节点付清即锁（paidOff）；定金 0 元节点不因 0≥0 误锁
    const state = computeLockedState(nodes(amounts, [500, 9500]), 1, -1)
    expect(state.lockedFlags).toEqual([false, true])
    expect(state.reasons[1]).toBe('paidOff')
    expect(state.reasons[0]).toBe(null)

    // 减价 1 分：参与者只剩定金节点（尾款已锁）——旧实现会把 1 分全压给定金打出 −1（资金静默损坏）
    const res = allocateDelta(nodes(amounts, [500, 9500], state.paidCents), state.lockedFlags, -1)
    expect(res.amountsCents).toEqual([0, 1]) // 定金金额 ≥ 0（R8 下限）
    expect(res.allocationsCents).toEqual([0, 0])
    expect(res.extraRefundCents).toBe(1) // 尾款不在参与者中 → 超额进额外应退
    expect(res.extraChargeCents).toBe(0)

    // A1/A2 守恒：总价 1−1=0 = Σ节点价 1 − 额外应退 1；已收 1 分按顺序填充（定金 0 元节点不吃额度）→ 节点待收 [0,0]，0 − 1 = 0 − 1 ✓
    expect(() => assertConservation({
      totalCents: 0,
      paidTotalCents: 1,
      nodeAmountsCents: res.amountsCents,
      nodeRemainingCents: [0, 0],
      extraChargeCents: 0,
      extraRefundCents: 1
    })).not.toThrow()
  })

  it('TC-R8-A-02: 三节点尾款已锁 + 中间封顶 → 超额进额外应退，中间节点不打负', () => {
    // 金额分布含普通值；尾款已付清锁定（不在参与者），两中间节点待收都不够冲
    const res = allocateDelta(nodes([2000, 3000, 5000], [2000, 3000, 5000], [0, 0, 5000]), [false, false, true], -6000)
    expect(res.allocationsCents).toEqual([-2000, -3000, 0]) // 各自最多冲掉自己的待收
    expect(res.amountsCents).toEqual([0, 0, 5000])
    expect(res.extraRefundCents).toBe(1000) // 超额 −1000 不再压给中间节点
    expect(res.extraChargeCents).toBe(0)
    // Σ 级守恒：Σalloc(−5000) − extraRefund(1000) = −6000 = delta
    expect(res.allocationsCents.reduce((s, v) => s + v, 0) - res.extraRefundCents).toBe(-6000)
    // A1/A2：总价 10000−6000=4000；已收 5000 → Σ待收 = −1000
    expect(() => assertConservation({
      totalCents: 4000,
      paidTotalCents: 5000,
      nodeAmountsCents: res.amountsCents,
      nodeRemainingCents: [0, 0, 0],
      extraChargeCents: 0,
      extraRefundCents: 1000
    })).not.toThrow()
  })

  it('TC-R8-A-03: 四节点全未锁大幅减价——尾款在参与者中，超额仍压尾款变负（现行为不回归）', () => {
    const res = allocateDelta(nodes([3000, 12000, 9000, 6000], [1000, 4000, 3000, 2000]), [false, false, false, false], -40000)
    // 各节点按比例分摊、以各自待收封顶到 0，超额由参与的尾款节点吸收（待收变负）
    expect(res.allocationsCents).toEqual([-3000, -12000, -9000, -16000])
    expect(res.amountsCents).toEqual([0, 0, 0, -10000])
    expect(res.extraRefundCents).toBe(0)
    expect(res.amountsCents.reduce((s, v) => s + v, 0)).toBe(-10000) // 30000 − 40000
  })

  it('TC-R8-A-04: 尾款未锁的常规负 delta（无封顶触发）——现行为不回归', () => {
    // 定金锁，线稿/细化/完稿未锁；减 200 元各节点待收都够冲
    const res = allocateDelta(nodes([3000, 12000, 9000, 6000], [1000, 4000, 3000, 2000], [3000, 0, 0, 0]), [true, false, false, false], -20000)
    expect(res.allocationsCents).toEqual([0, -8889, -6667, -4444])
    expect(res.amountsCents).toEqual([3000, 3111, 2333, 1556])
    expect(res.extraRefundCents).toBe(0)
    expect(res.extraChargeCents).toBe(0)
  })

  it('TC-R8-A-05: 全锁未付清负 delta → R9 镜像冲抵（不回归）', () => {
    const res = allocateDelta(nodes([3000, 12000, 9000, 6000], [1000, 4000, 3000, 2000], [3000, 0, 0, 0]), [true, true, true, true], -20000)
    expect(res.amountsCents).toEqual([3000, 7000, 0, 0])
    expect(res.extraRefundCents).toBe(0)
  })

  it('TC-R8-A-06: 全锁未付清负 delta 超出欠款 → 冲光 + 剩余进额外应退（R13 不回归）', () => {
    const res = allocateDelta(nodes([3000, 12000, 9000, 6000], [1000, 4000, 3000, 2000], [3000, 0, 0, 0]), [true, true, true, true], -28000)
    expect(res.amountsCents).toEqual([3000, 0, 0, 0])
    expect(res.extraRefundCents).toBe(1000)
  })

  it('TC-R8-A-07: 尾款锁 + 正 delta → 只摊未锁节点，不进额外项（符号维度不回归）', () => {
    const res = allocateDelta(nodes([2000, 3000, 5000], [2000, 3000, 5000], [0, 0, 5000]), [false, false, true], 1000)
    expect(res.allocationsCents).toEqual([400, 600, 0])
    expect(res.amountsCents).toEqual([2400, 3600, 5000])
    expect(res.extraChargeCents).toBe(0)
  })
})

// ============================================
// H-1 配套：checkOrderConservation R8 断言（fail-fast）
// ============================================

describe('checkOrderConservation R8 断言（审计批 260830 H-1）', () => {
  it('TC-R8-B-01: 手工构造非尾款负金额 → 抛 PRICING_CONSERVATION（assertion=R8）', () => {
    const artist = seedArtist({ qq_number: '88501', subdomain: 'r8-b1' })
    // Σbp=10000、Σ节点价=总价=10000（A1 本可通过）——旧缺口正是这种「Σ 守恒但节点为负」的静默损坏
    const orderId = seedConservationOrder(artist, { orderNo: 'R8-B1', finalCents: 10000, bps: [5000, 5000], amounts: [-5, 10005] })
    try {
      orderService.checkOrderConservation(orderId)
      expect.unreachable('R8 断言应抛出')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const e = err as AppError
      expect(e.code).toBe(E.PRICING_CONSERVATION)
      const detail = e.detail as Record<string, unknown>
      expect(detail.assertion).toBe('R8')
      expect(detail.index).toBe(0)
      expect(detail.amountCents).toBe(-5)
    }
  })

  it('TC-R8-B-02: 尾款节点负金额（超付应退合法形态）不误伤', () => {
    const artist = seedArtist({ qq_number: '88502', subdomain: 'r8-b2' })
    // 案例 8 的合法形态：总价 10000、已收 11000（纯超付 1000 压尾款），尾款 −500
    const orderId = seedConservationOrder(artist, { orderNo: 'R8-B2', finalCents: 10000, bps: [5000, 5000], amounts: [10500, -500], paidTotal: 11000 })
    expect(() => orderService.checkOrderConservation(orderId)).not.toThrow()
  })

  it('TC-R8-B-03: Σbp≠100% 早退分支的订单同样兜得住（断言在早退之前）', () => {
    const artist = seedArtist({ qq_number: '88503', subdomain: 'r8-b3' })
    // Σbp=6000≠10000：A1 早退跳过，但非尾款负金额仍必须抛错（早退不得放行损坏数据）
    const orderId = seedConservationOrder(artist, { orderNo: 'R8-B3', finalCents: 5000, bps: [3000, 3000], amounts: [-10, 5010] })
    try {
      orderService.checkOrderConservation(orderId)
      expect.unreachable('早退分支也应被 R8 断言拦截')
    } catch (err) {
      const e = err as AppError
      expect(e.code).toBe(E.PRICING_CONSERVATION)
      expect((e.detail as Record<string, unknown>).assertion).toBe('R8')
    }
  })
})

// ============================================
// H-5：金额上限累加绕过（审计批 260830）
// ============================================

describe('H-5：金额上限累加防线', () => {
  it('TC-H5-01: 已触顶订单再加项 → INVALID_PRICE，且整体不落库（前置校验拒绝）', () => {
    const artist = seedArtist({ qq_number: '88504', subdomain: 'r8-h5a' })
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = ?, total_price_cents = ? WHERE id = ?').run(MAX_MONEY_CENTS, MAX_MONEY_CENTS, order.id)

    try {
      orderService.addExtraItem(order.id, { name: '触顶项', priceCents: 1 })
      expect.unreachable('触顶加项应被拒绝')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const e = err as AppError
      expect(e.code).toBe(E.INVALID_PRICE)
      expect((e.detail as Record<string, unknown>).message).toContain('100 万元')
    }
    // 拒绝即不落库：总价不变、附加项/条目/备注均无
    const final = (db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id) as { final_price_cents: number | null }).final_price_cents
    expect(final).toBe(MAX_MONEY_CENTS)
    expect((db.prepare('SELECT COUNT(*) AS c FROM order_extra_items WHERE order_id = ?').get(order.id) as { c: number }).c).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS c FROM order_price_entries WHERE order_id = ?').get(order.id) as { c: number }).c).toBe(0)
  })

  it('TC-H5-02: 连续加项——第一笔成功、第二笔累加触顶拒绝', () => {
    const artist = seedArtist({ qq_number: '88505', subdomain: 'r8-h5b' })
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = ?, total_price_cents = ? WHERE id = ?').run(MAX_MONEY_CENTS - 150, MAX_MONEY_CENTS - 150, order.id)

    orderService.addExtraItem(order.id, { name: '第一笔', priceCents: 100 })
    const mid = (db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id) as { final_price_cents: number | null }).final_price_cents
    expect(mid).toBe(MAX_MONEY_CENTS - 50)

    // 第二笔 100 > 剩余额度 50 → 累加触顶拒绝（旧缺口：单项校验放行，20 项叠加可达上限 20 倍）
    expect(() => orderService.addExtraItem(order.id, { name: '第二笔', priceCents: 100 })).toThrow('INVALID_PRICE')
    const final = (db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id) as { final_price_cents: number | null }).final_price_cents
    expect(final).toBe(MAX_MONEY_CENTS - 50)
    expect((db.prepare('SELECT COUNT(*) AS c FROM order_extra_items WHERE order_id = ?').get(order.id) as { c: number }).c).toBe(1)
  })

  it('TC-H5-03: adjustFinalPrice 兜底断言——删减价项冲正组合越过前置校验时内部拦截', () => {
    // 组合路径：触顶订单加「减价项」→ 改价回到上限 → 删减价项（正向冲正）→
    // deleteExtraItem 无累加上限前置校验，靠 adjustFinalPrice 内部断言拦截（双保险的兜底侧）
    const artist = seedArtist({ qq_number: '88506', subdomain: 'r8-h5c' })
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = ?, total_price_cents = ? WHERE id = ?').run(MAX_MONEY_CENTS, MAX_MONEY_CENTS, order.id)

    const reduced = orderService.addExtraItem(order.id, { name: '减价项', priceCents: -1000 })
    expect((db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id) as { final_price_cents: number | null }).final_price_cents).toBe(MAX_MONEY_CENTS - 1000)
    orderService.updateFinalPrice(order.id, MAX_MONEY_CENTS) // 改价回上限（合法，≤ 上限）

    const item = db.prepare('SELECT id FROM order_extra_items WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(order.id) as { id: number }
    try {
      orderService.deleteExtraItem(order.id, item.id) // 冲正 +1000 → newFinal 越过上限
      expect.unreachable('兜底断言应抛出')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const e = err as AppError
      expect(e.code).toBe(E.INVALID_PRICE)
      expect((e.detail as Record<string, unknown>).message).toContain('100 万元')
    }
    // 事务回滚：总价保持上限、减价项仍在
    expect((db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id) as { final_price_cents: number | null }).final_price_cents).toBe(MAX_MONEY_CENTS)
    expect(db.prepare('SELECT id FROM order_extra_items WHERE id = ?').get(item.id)).toBeTruthy()
    expect(reduced.id).toBeTruthy()
  })
})
