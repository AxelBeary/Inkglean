/**
 * REQ-025 动态节点计价引擎 测试（v0.37 第一阶段）
 *
 * 纯函数测试（内存构造数据，不依赖 DB）+ 迁移 v39 数据层测试。
 * 边界案例 1~8 逐案例对应 REQ-025 第三节（数值一律用文档纠正值）；
 * 案例 9/10 + 守恒断言三条破坏用例为一号派工补充项。
 *
 * 审计批 260830（L-8）：applyRefund 死代码已整体删除（单轨保留 allocateDelta），
 * 仅针对它的用例（TC-PE-C5-02 / TC-PE-REF-01~03）同步删除，其余保留。
 *
 * 金额单位全部为「分」。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb } from './setup.js'
import { MIGRATIONS } from '../src/db/init.js'
import {
  sumEntryDeltas,
  allocateInitial,
  computeLockedState,
  allocateDelta,
  deriveInstallmentProgress,
  assertConservation,
  type EngineInstallment,
  type ConservationInput,
  type PriceEntry
} from '../src/features/pricing/pricing-engine.js'
import { AppError, E } from '../src/shared/errors.js'

// ─── 测试辅助 ───

/** 主场景四节点：定金 10% / 线稿 40% / 细化 30% / 完稿 20%（basis_points = 万分比） */
function fourNodes(amounts: number[] = [0, 0, 0, 0], paid: number[] = [0, 0, 0, 0]): EngineInstallment[] {
  const labels = ['定金', '线稿', '细化', '完稿']
  const bps = [1000, 4000, 3000, 2000]
  return labels.map((label, i) => ({
    id: i + 1,
    label,
    sortOrder: i,
    basisPoints: bps[i],
    amountCents: amounts[i],
    paidCents: paid[i]
  }))
}

/** 守恒自检包装：条目总价 vs 节点+额外项 */
function conservationInput({ total, paidTotal, amounts, remaining, extraCharge = 0, extraRefund = 0, baseShares, allocHistory }: {
  total: number
  paidTotal: number
  amounts: number[]
  remaining: number[]
  extraCharge?: number
  extraRefund?: number
  baseShares?: number[]
  allocHistory?: number[]
}): ConservationInput {
  return {
    totalCents: total,
    paidTotalCents: paidTotal,
    nodeAmountsCents: amounts,
    nodeRemainingCents: remaining,
    extraChargeCents: extraCharge,
    extraRefundCents: extraRefund,
    baseSharesCents: baseShares,
    allocHistoryCents: allocHistory
  }
}

// ============================================
// 基础工具
// ============================================

describe('sumEntryDeltas（R1 总价条目化）', () => {
  it('TC-PE-SUM-01: Σ 条目 delta = 订单应收总额', () => {
    const entries: PriceEntry[] = [
      { type: 'base', deltaCents: 19500 },
      { type: 'manual_adjust', deltaCents: 10500 },
      { type: 'extra_item', deltaCents: 20000 },
      { type: 'extra_charge_after_close', deltaCents: 5000 }
    ]
    expect(sumEntryDeltas(entries)).toBe(55000)
  })

  it('TC-PE-SUM-02: 负条目（减项/退款）参与求和', () => {
    const entries: PriceEntry[] = [
      { type: 'base', deltaCents: 30000 },
      { type: 'discount_item', deltaCents: -5000 },
      { type: 'refund_item', deltaCents: -3000 }
    ]
    expect(sumEntryDeltas(entries)).toBe(22000)
  })

  it('TC-PE-SUM-03: 空条目列表 = 0', () => {
    expect(sumEntryDeltas([])).toBe(0)
  })
})

// ============================================
// 案例 1：用户主场景（全流程）
// ============================================

describe('案例 1：用户主场景（节点 10/40/30/20）', () => {
  it('TC-PE-C1-01: 改价 300 后初始分配 = 30/120/90/60', () => {
    const nodes = fourNodes()
    const amounts = allocateInitial(nodes, 30000)
    expect(amounts).toEqual([3000, 12000, 9000, 6000])
  })

  it('TC-PE-C1-02: base 195 + manual_adjust +105 两段式等价于直接分 300（R2 条目化改价）', () => {
    const nodes = fourNodes()
    const initial = allocateInitial(nodes, 19500)
    expect(initial).toEqual([1950, 7800, 5850, 3900])
    const nodesWithAmounts = fourNodes(initial)
    const res = allocateDelta(nodesWithAmounts, [false, false, false, false], 10500)
    expect(res.amountsCents).toEqual([3000, 12000, 9000, 6000])
    expect(res.extraChargeCents).toBe(0)
    expect(res.extraRefundCents).toBe(0)
  })

  it('TC-PE-C1-03: 收定金 3000 并推进后，定金节点完成即锁（R4）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const state = computeLockedState(nodes, 3000, 0)
    expect(state.lockedFlags).toEqual([true, false, false, false])
    expect(state.reasons[0]).toBe('completed')
    expect(state.paidCents).toEqual([3000, 0, 0, 0])
  })

  it('TC-PE-C1-04: 累计收 18000（≥线稿 12000）→ 线稿付清即锁，超付 3000 冲细化（R4/R7）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    // 定金已完成（completedStageIndex=0），线稿尚未完成，靠付清锁定
    const state = computeLockedState(nodes, 18000, 0)
    expect(state.lockedFlags).toEqual([true, true, false, false])
    expect(state.reasons[0]).toBe('completed')
    expect(state.reasons[1]).toBe('paidOff')
    expect(state.paidCents).toEqual([3000, 12000, 3000, 0])
    // 细化待收 = 9000 - 3000 = 6000（"细化待收自动 = 90 − 30 = 60"）
    const progress = deriveInstallmentProgress(nodes, 18000)
    expect(progress[2].remainingCents).toBe(6000)
    expect(progress[3].remainingCents).toBe(6000)
  })

  it('TC-PE-C1-05: 加 200 元按未锁节点 30%:20% 归一化分摊 → 细化 210 / 完稿 140（R5，纠正值）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000], [3000, 12000, 3000, 0])
    const res = allocateDelta(nodes, [true, true, false, false], 20000)
    expect(res.amountsCents).toEqual([3000, 12000, 21000, 14000])
    expect(res.allocationsCents).toEqual([0, 0, 12000, 8000])
    // 守恒：总价 500 = 30+120+210+140；500−180=320=180+140
    expect(res.amountsCents.reduce((s, v) => s + v, 0)).toBe(50000)
    const nodesAfter = fourNodes(res.amountsCents, [3000, 12000, 3000, 0])
    const progress = deriveInstallmentProgress(nodesAfter, 18000)
    expect(progress[2].remainingCents).toBe(18000)
    expect(progress[3].remainingCents).toBe(14000)
  })

  it('TC-PE-C1-06: 推进完稿收齐 50000 → 全锁、待收 0、订单关闭', () => {
    const nodes = fourNodes([3000, 12000, 21000, 14000])
    const state = computeLockedState(nodes, 50000, 3)
    expect(state.lockedFlags).toEqual([true, true, true, true])
    expect(state.paidCents).toEqual([3000, 12000, 21000, 14000])
    const progress = deriveInstallmentProgress(nodes, 50000)
    expect(progress.every(p => p.remainingCents === 0)).toBe(true)
  })

  it('TC-PE-C1-07: 关单后加 50 元 → 节点全不动，额外应收 5000（R10）', () => {
    const nodes = fourNodes([3000, 12000, 21000, 14000], [3000, 12000, 21000, 14000])
    const res = allocateDelta(nodes, [true, true, true, true], 5000)
    expect(res.amountsCents).toEqual([3000, 12000, 21000, 14000])
    expect(res.allocationsCents).toEqual([0, 0, 0, 0])
    expect(res.extraChargeCents).toBe(5000)
    expect(res.extraRefundCents).toBe(0)
  })

  it('TC-PE-C1-08: 全流程守恒断言通过（R11）', () => {
    const total = sumEntryDeltas([
      { type: 'base', deltaCents: 19500 },
      { type: 'manual_adjust', deltaCents: 10500 },
      { type: 'extra_item', deltaCents: 20000 },
      { type: 'extra_charge_after_close', deltaCents: 5000 }
    ])
    expect(total).toBe(55000)
    expect(() => assertConservation(conservationInput({
      total,
      paidTotal: 50000,
      amounts: [3000, 12000, 21000, 14000],
      remaining: [0, 0, 0, 0],
      extraCharge: 5000,
      extraRefund: 0
    }))).not.toThrow()
  })
})

// ============================================
// 案例 2：完成但部分付款的节点
// ============================================

describe('案例 2：线稿已完成只付 60，加 200 不参与分摊（欠款保留）', () => {
  it('TC-PE-C2-01: 完成即锁优先于未付清；delta 只摊细化/完稿；线稿欠 60 保留', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const state = computeLockedState(nodes, 9000, 1) // 定金+线稿阶段完成，累计只收 90
    expect(state.lockedFlags).toEqual([true, true, false, false])
    expect(state.reasons[1]).toBe('completed')
    expect(state.paidCents[1]).toBe(6000) // 线稿只分配 60

    const nodesWithPaid = fourNodes([3000, 12000, 9000, 6000], state.paidCents)
    const res = allocateDelta(nodesWithPaid, state.lockedFlags, 20000)
    expect(res.amountsCents).toEqual([3000, 12000, 21000, 14000])
    // 线稿待收 = 12000 - 6000 = 6000（欠款保留，R4 末段）
    const progress = deriveInstallmentProgress(fourNodes(res.amountsCents), 9000)
    expect(progress[1].remainingCents).toBe(6000)
  })
})

// ============================================
// 案例 3：部分付款但未完成的节点
// ============================================

describe('案例 3：线稿未完成只预收 60，加 200（分）参与分摊', () => {
  it('TC-PE-C3-01: 未锁线稿参与分摊 88/66/46，尾差归完稿（R5/R6 纠正值）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    // 只完成定金（completedStageIndex=0），线稿未完成、未付清 → 不锁
    const state = computeLockedState(nodes, 9000, 0)
    expect(state.lockedFlags).toEqual([true, false, false, false])
    expect(state.paidCents).toEqual([3000, 6000, 0, 0])

    const nodesWithPaid = fourNodes([3000, 12000, 9000, 6000], state.paidCents)
    const res = allocateDelta(nodesWithPaid, state.lockedFlags, 200)
    // 200×40/90=88.88→88；200×30/90=66.67→66；尾差归完稿 200-88-66=46
    expect(res.allocationsCents).toEqual([0, 88, 66, 46])
    expect(res.amountsCents).toEqual([3000, 12088, 9066, 6046])
    expect(res.allocationsCents.reduce((s, v) => s + v, 0)).toBe(200)
  })
})

// ============================================
// 案例 4：付清先于完成
// ============================================

describe('案例 4：线稿未开画但客户预付全款，付清即锁（先到先锁）', () => {
  it('TC-PE-C4-01: 线稿付清 → paidOff 锁定；加 200 只摊细化/完稿，已付清节点不涨价', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    // 预付 15000：顺序填充满定金 3000 + 线稿 12000；线稿尚未开工（只完成定金）
    const state = computeLockedState(nodes, 15000, 0)
    expect(state.lockedFlags).toEqual([true, true, false, false])
    expect(state.reasons[1]).toBe('paidOff')

    const nodesWithPaid = fourNodes([3000, 12000, 9000, 6000], state.paidCents)
    const res = allocateDelta(nodesWithPaid, state.lockedFlags, 200)
    expect(res.amountsCents).toEqual([3000, 12000, 9120, 6080])
    expect(res.allocationsCents).toEqual([0, 0, 120, 80])
  })
})

// ============================================
// 案例 5：关单后退款
// ============================================

describe('案例 5：全部锁定收齐后 −50 → 额外应退，节点不动', () => {
  const closedAmounts = [3000, 12000, 21000, 14000]
  const closedPaid = [3000, 12000, 21000, 14000]
  const allLocked = [true, true, true, true]

  it('TC-PE-C5-01: 负 delta 全锁 → 额外应退 5000（R5.1/R10）', () => {
    const nodes = fourNodes(closedAmounts, closedPaid)
    const res = allocateDelta(nodes, allLocked, -5000)
    expect(res.amountsCents).toEqual(closedAmounts)
    expect(res.extraRefundCents).toBe(5000)
    expect(res.extraChargeCents).toBe(0)
  })

  // 审计批 260830（L-8）：TC-PE-C5-02（applyRefund 全锁）随函数删除同步移除

  it('TC-PE-C5-03: 关单退款后守恒（条目 −5000，总价 45000）', () => {
    const total = sumEntryDeltas([
      { type: 'base', deltaCents: 50000 },
      { type: 'extra_refund_after_close', deltaCents: -5000 }
    ])
    expect(total).toBe(45000)
    expect(() => assertConservation(conservationInput({
      total,
      paidTotal: 50000,
      amounts: closedAmounts,
      remaining: [0, 0, 0, 0],
      extraCharge: 0,
      extraRefund: 5000
    }))).not.toThrow()
  })
})

// ============================================
// A3：R10 关闭语义向 R13 收敛（关闭 = 全节点锁定 且 Σ待收=0）
// ============================================

describe('allocateDelta 关闭语义（A3：R10/R13 收敛）', () => {
  const doneAmounts = [3000, 12000, 9000, 6000]
  const allLocked = [true, true, true, true]

  it('TC-PE-A3-01: 全锁未付清（done 未付全）+ 负 delta → R9 镜像冲抵债务节点，不进额外应退', () => {
    const nodes = fourNodes(doneAmounts, [3000, 0, 0, 0])
    const res = allocateDelta(nodes, allLocked, -20000)
    // 从尾往头冲抵：完稿 6000→0、细化 9000→0、线稿 12000→7000
    expect(res.amountsCents).toEqual([3000, 7000, 0, 0])
    expect(res.allocationsCents).toEqual([0, -5000, -9000, -6000])
    expect(res.extraRefundCents).toBe(0)
    expect(res.extraChargeCents).toBe(0)
  })

  it('TC-PE-A3-02: 全锁未付清 + 负 delta 超出欠款 → 欠款冲光 + 剩余进额外应退', () => {
    const nodes = fourNodes(doneAmounts, [3000, 0, 0, 0])
    const res = allocateDelta(nodes, allLocked, -28000)
    expect(res.amountsCents).toEqual([3000, 0, 0, 0])
    expect(res.allocationsCents).toEqual([0, -12000, -9000, -6000])
    expect(res.extraRefundCents).toBe(1000)
    // 守恒：Σalloc − extraRefund = −28000 = delta
    expect(res.allocationsCents.reduce((s, v) => s + v, 0) - res.extraRefundCents).toBe(-28000)
  })

  it('TC-PE-A3-03: 全锁未付清 + 正 delta → R5 比例摊入债务节点，待收增加', () => {
    const nodes = fourNodes(doneAmounts, [3000, 0, 0, 0])
    const res = allocateDelta(nodes, allLocked, 20000)
    expect(res.allocationsCents).toEqual([0, 8888, 6666, 4446])
    expect(res.amountsCents).toEqual([3000, 20888, 15666, 10446])
    expect(res.extraChargeCents).toBe(0)
  })

  it('TC-PE-A3-04: 全锁已付清（Σ待收=0）→ 维持 extra 语义不变（R10/R13 回归）', () => {
    const nodes = fourNodes(doneAmounts, doneAmounts)
    const res = allocateDelta(nodes, allLocked, -5000)
    expect(res.amountsCents).toEqual(doneAmounts)
    expect(res.allocationsCents).toEqual([0, 0, 0, 0])
    expect(res.extraRefundCents).toBe(5000)
  })
})

// ============================================
// 案例 6：尾差取整
// ============================================

describe('案例 6：delta 20000 分摊三个未锁节点 40:30:20，向下取整尾差归最后未锁', () => {
  it('TC-PE-C6-01: 8888 / 6666 / 4446，Σ = 20000（R6）', () => {
    // 首节点（10%）已锁，后三个未锁
    const nodes = fourNodes([3000, 12000, 9000, 6000], [3000, 0, 0, 0])
    const res = allocateDelta(nodes, [true, false, false, false], 20000)
    expect(res.allocationsCents).toEqual([0, 8888, 6666, 4446])
    expect(res.allocationsCents.reduce((s, v) => s + v, 0)).toBe(20000)
    expect(res.amountsCents).toEqual([3000, 20888, 15666, 10446])
  })
})

// ============================================
// 案例 7：回退不解锁
// ============================================

describe('案例 7：细化已锁后打回线稿返工（回退不解锁）', () => {
  it('TC-PE-C7-01: prevLockedFlags 保持细化锁定（reason=prev），返工费 50 摊给完稿', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    // 原本推进到细化完成（completedStageIndex=2），现回退到线稿返工（completedStageIndex=1）
    const prevLocked = [true, true, true, false]
    const state = computeLockedState(nodes, 18000, 1, prevLocked)
    expect(state.lockedFlags).toEqual([true, true, true, false])
    expect(state.reasons).toEqual(['completed', 'completed', 'prev', null])

    const nodesWithPaid = fourNodes([3000, 12000, 9000, 6000], state.paidCents)
    const res = allocateDelta(nodesWithPaid, state.lockedFlags, 50)
    // 线稿/细化节点价不变；返工费进唯一未锁节点（完稿）
    expect(res.amountsCents).toEqual([3000, 12000, 9000, 6050])
    expect(res.extraChargeCents).toBe(0)
  })

  it('TC-PE-C7-02: 若无未锁节点，返工费进额外应收', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000], [3000, 12000, 9000, 6000])
    const res = allocateDelta(nodes, [true, true, true, true], 50)
    expect(res.amountsCents).toEqual([3000, 12000, 9000, 6000])
    expect(res.extraChargeCents).toBe(50)
  })

  it('TC-PE-C7-03: 不传 prevLockedFlags 时回退会解锁细化（对照组，证明 prev 参数的作用）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const state = computeLockedState(nodes, 18000, 1) // 无 prev
    expect(state.lockedFlags).toEqual([true, true, false, false])
  })
})

// ============================================
// 案例 8：负增项把未锁节点冲到 0 以下
// ============================================

describe('案例 8：总价减 200 元，未锁只剩细化 90 + 完稿 60（R8 下限）', () => {
  it('TC-PE-C8-01: 细化待收打到 0，差额把尾款冲成负数（应退）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const state = computeLockedState(nodes, 18000, 1) // 定金+线稿锁；细化已分配 3000
    const nodesWithPaid = fourNodes([3000, 12000, 9000, 6000], state.paidCents)
    const res = allocateDelta(nodesWithPaid, state.lockedFlags, -20000)
    // 比例分摊本为 细化 −12000 / 完稿 −8000；细化待收只有 6000 → 封顶 −6000，余 −6000 压给完稿
    expect(res.allocationsCents).toEqual([0, 0, -6000, -14000])
    expect(res.amountsCents).toEqual([3000, 12000, 3000, -8000])
    // 待收：细化 0（下限），完稿 −8000（可退）
    const progress = deriveInstallmentProgress(fourNodes(res.amountsCents), 18000)
    expect(progress[2].remainingCents).toBe(0)
    expect(progress[3].remainingCents).toBe(-8000)
    // 守恒：总价 30000−20000=10000；10000−18000 = Σ待收(−8000)
    expect(() => assertConservation(conservationInput({
      total: 10000,
      paidTotal: 18000,
      amounts: res.amountsCents,
      remaining: progress.map(p => p.remainingCents)
    }))).not.toThrow()
  })
})

// ============================================
// 案例 9（派工补充）：0 节点订单
// ============================================

describe('案例 9：无收款节点的订单，delta 全进额外应收/应退', () => {
  it('TC-PE-C9-01: 正 delta → 额外应收', () => {
    const res = allocateDelta([], [], 5000)
    expect(res.amountsCents).toEqual([])
    expect(res.extraChargeCents).toBe(5000)
    expect(res.extraRefundCents).toBe(0)
  })

  it('TC-PE-C9-02: 负 delta → 额外应退', () => {
    const res = allocateDelta([], [], -3000)
    expect(res.extraRefundCents).toBe(3000)
    expect(res.extraChargeCents).toBe(0)
  })

  it('TC-PE-C9-03: 锁状态/进度推导对空节点安全', () => {
    const state = computeLockedState([], 0)
    expect(state.lockedFlags).toEqual([])
    expect(state.paidCents).toEqual([])
    expect(deriveInstallmentProgress([], 100)).toEqual([])
  })
})

// ============================================
// 案例 10（派工补充）：单节点 30%（比例和≠100%）
// ============================================

describe('案例 10：单节点 30%，ratioTotal 按 30% 算', () => {
  it('TC-PE-C10-01: allocateInitial 只摊总价的 30%', () => {
    const nodes: EngineInstallment[] = [{ sortOrder: 0, basisPoints: 3000, amountCents: 0 }]
    const amounts = allocateInitial(nodes, 10000)
    expect(amounts).toEqual([3000])
  })

  it('TC-PE-C10-02: 与现有 recalcInstallmentAmounts 语义一致（末节点吸收尾差）', () => {
    // 总价 10001 分 × 30% = 3000.3 → ratioTotal = round(3000.3) = 3000
    const nodes: EngineInstallment[] = [{ sortOrder: 0, basisPoints: 3000, amountCents: 0 }]
    expect(allocateInitial(nodes, 10001)).toEqual([3000])
    // 两节点 30%+30%：前节点 round，末节点 = ratioTotal − 前节点
    const two: EngineInstallment[] = [
      { sortOrder: 0, basisPoints: 3000, amountCents: 0 },
      { sortOrder: 1, basisPoints: 3000, amountCents: 0 }
    ]
    const amounts = allocateInitial(two, 10003) // ratioTotal = round(6001.8) = 6002；首 = round(3000.9) = 3001；末 = 3001
    expect(amounts).toEqual([3001, 3001])
    expect(amounts.reduce((s, v) => s + v, 0)).toBe(6002)
  })
})

// ============================================
// 锁价语义补充（R4）
// ============================================

describe('computeLockedState 锁价语义（R4 先到先锁）', () => {
  it('TC-PE-LOCK-01: 超付使尾款付清 → 尾款也锁', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const state = computeLockedState(nodes, 30000, -1)
    expect(state.lockedFlags).toEqual([true, true, true, true])
    expect(state.reasons.every(r => r === 'paidOff')).toBe(true)
  })

  it('TC-PE-LOCK-02: 0 金额节点不因 0≥0 误锁', () => {
    const nodes: EngineInstallment[] = [
      { sortOrder: 0, basisPoints: 10000, amountCents: 0 },
      { sortOrder: 1, basisPoints: 0, amountCents: 0 }
    ]
    const state = computeLockedState(nodes, 0, -1)
    expect(state.lockedFlags).toEqual([false, false])
  })

  it('TC-PE-LOCK-03: 未付款未完成 → 全不锁', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const state = computeLockedState(nodes, 0, -1)
    expect(state.lockedFlags).toEqual([false, false, false, false])
    expect(state.reasons.every(r => r === null)).toBe(true)
  })

  it('TC-PE-LOCK-04: 入参乱序时按 sortOrder 排序推导', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000]).reverse()
    const state = computeLockedState(nodes, 3000, 0)
    // 输出仍按 sortOrder（定金在前）
    expect(state.lockedFlags).toEqual([true, false, false, false])
  })
})

// ============================================
// 收款进度（R7/R8）
// ============================================

describe('deriveInstallmentProgress 顺序填充 + 超付抵扣（R7/R8）', () => {
  it('TC-PE-PROG-01: 超付自动向后抵扣', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const rows = deriveInstallmentProgress(nodes, 18000)
    expect(rows.map(r => r.paidCents)).toEqual([3000, 12000, 3000, 0])
    expect(rows.map(r => r.remainingCents)).toEqual([0, 0, 6000, 6000])
  })

  it('TC-PE-PROG-02: 多收时尾款待收为负（可退）', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const rows = deriveInstallmentProgress(nodes, 37000) // 总价 30000，多付 7000
    // 尾款吸收全部剩余：37000 − 前三节点 24000 = 13000；待收 = 6000 − 13000 = −7000
    expect(rows[3].paidCents).toBe(13000)
    expect(rows[3].remainingCents).toBe(-7000)
    // 非尾款待收不低于 0
    expect(rows.slice(0, 3).every(r => r.remainingCents >= 0)).toBe(true)
  })
})

// 审计批 260830（L-8）：applyRefund 镜像填充（R9，订单未关闭）用例组
// （TC-PE-REF-01~03）随函数删除同步移除；负向路径语义由
// allocateDelta 负 delta（案例 8 / A3 系列 / pricing-r8-audit.test.ts）承载。

// ============================================
// allocateDelta 其它行为
// ============================================

describe('allocateDelta 其它行为', () => {
  it('TC-PE-ALLOC-01: delta = 0 不改变任何节点', () => {
    const nodes = fourNodes([3000, 12000, 9000, 6000])
    const res = allocateDelta(nodes, [false, false, false, false], 0)
    expect(res.amountsCents).toEqual([3000, 12000, 9000, 6000])
    expect(res.allocationsCents).toEqual([0, 0, 0, 0])
    expect(res.extraChargeCents).toBe(0)
    expect(res.extraRefundCents).toBe(0)
  })

  it('TC-PE-ALLOC-02: 未锁节点基点和为 0 时退化进额外项（防御）', () => {
    const nodes: EngineInstallment[] = [
      { sortOrder: 0, basisPoints: 0, amountCents: 5000 },
      { sortOrder: 1, basisPoints: 0, amountCents: 5000 }
    ]
    const res = allocateDelta(nodes, [false, false], 300)
    expect(res.extraChargeCents).toBe(300)
    expect(res.amountsCents).toEqual([5000, 5000])
  })

  it('TC-PE-ALLOC-03: lockedFlags 乱序与节点配对不错位', () => {
    // 节点倒序传入，lockedFlags 与节点一一对应（完稿锁）
    const nodes = fourNodes([3000, 12000, 9000, 6000]).reverse()
    const flags = [true, false, false, false] // 对应倒序节点：完稿锁
    const res = allocateDelta(nodes, flags, 9000)
    // 排序后：定金/线稿/细化未锁（bp 1000:4000:3000=1:4:3），完稿锁
    // floor: 9000×1/8=1125→1125? 9000×1000/8000=1125, 9000×4000/8000=4500, 尾差归细化=9000-1125-4500=3375
    expect(res.allocationsCents).toEqual([1125, 4500, 3375, 0])
    expect(res.amountsCents).toEqual([4125, 16500, 12375, 6000])
  })
})

// ============================================
// 守恒断言破坏用例（派工补充：三条各造一个故意破坏）
// ============================================

describe('assertConservation 三条断言的破坏检测（R11）', () => {
  const goodInput = conservationInput({
    total: 50000,
    paidTotal: 18000,
    amounts: [3000, 12000, 21000, 14000],
    remaining: [0, 0, 18000, 14000]
  })

  it('TC-PE-CONS-00: 正确数据通过', () => {
    expect(() => assertConservation(goodInput)).not.toThrow()
  })

  it('TC-PE-CONS-01: 破坏 A1（总价 ≠ Σ节点价 + 额外应收 − 额外应退）', () => {
    const broken = { ...goodInput, totalCents: 50001 }
    try {
      assertConservation(broken)
      expect.unreachable('A1 应抛出')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const e = err as AppError
      expect(e.code).toBe(E.PRICING_CONSERVATION)
      expect((e.detail as Record<string, unknown>).assertion).toBe('A1')
    }
  })

  it('TC-PE-CONS-02: 破坏 A2（总价 − 已收 ≠ Σ待收 + 额外应收 − 额外应退）', () => {
    const broken = { ...goodInput, paidTotalCents: 17999 }
    try {
      assertConservation(broken)
      expect.unreachable('A2 应抛出')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const e = err as AppError
      expect(e.code).toBe(E.PRICING_CONSERVATION)
      expect((e.detail as Record<string, unknown>).assertion).toBe('A2')
    }
  })

  it('TC-PE-CONS-03: 破坏 A3（节点价 ≠ 基础分摊额 + Σ历次分摊增量）', () => {
    // 构造 A1/A2 均自洽、仅 A3 破坏的数据：细化节点价比可追溯链多 1 分，
    // 同步调高总价 1 分、已收 1 分，使 A1（Σ节点价）与 A2（Σ待收）仍守恒
    const a3Only = conservationInput({
      total: 50001,
      paidTotal: 18001,
      amounts: [3000, 12000, 21001, 14000],
      remaining: [0, 0, 18000, 14000], // 细化待收 = 21001 − 3001 = 18000
      baseShares: [3000, 12000, 9000, 6000],
      allocHistory: [0, 0, 12000, 8000] // 细化应 = 9000+12000 = 21000
    })
    try {
      assertConservation(a3Only)
      expect.unreachable('A3 应抛出')
    } catch (err) {
      const e = err as AppError
      expect(e.code).toBe(E.PRICING_CONSERVATION)
      const detail = e.detail as Record<string, unknown>
      expect(detail.assertion).toBe('A3')
      expect(detail.index).toBe(2)
    }
  })

  it('TC-PE-CONS-04: A3 可追溯链（初始分摊 + 历次 delta）完整成立', () => {
    const ok = conservationInput({
      total: 50000,
      paidTotal: 18000,
      amounts: [3000, 12000, 21000, 14000],
      remaining: [0, 0, 18000, 14000],
      baseShares: [3000, 12000, 9000, 6000],
      allocHistory: [0, 0, 12000, 8000]
    })
    expect(() => assertConservation(ok)).not.toThrow()
  })
})

// ============================================
// 迁移 v39：order_price_entries 数据层
// ============================================

// order_price_entries 表行局部类型（仅断言所需列）
interface PriceEntryDbRow { created_by: string; created_at: string }

describe('迁移 v39: order_price_entries 建表', () => {
  beforeEach(() => cleanDb())

  it('TC-MIG-39a: MIGRATIONS 含 v39 且已应用', () => {
    const v39 = MIGRATIONS.find(m => m.version === 39)
    expect(v39).toBeTruthy()
    expect(v39!.name).toBe('order_price_entries')
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 39').get()
    expect(applied).toBeTruthy()
  })

  it('TC-MIG-39b: 七种条目类型均可写入（R1）', () => {
    const artist = db.prepare('INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)').run('79901', 'PriceEntryArtist', 'pe-artist')
    const order = db.prepare('INSERT INTO orders (artist_id, order_no, client_qq) VALUES (?, ?, ?)').run(artist.lastInsertRowid, 'PE-001', '88901')
    const orderId = Number(order.lastInsertRowid)
    const types = ['base', 'manual_adjust', 'extra_item', 'discount_item', 'refund_item', 'extra_charge_after_close', 'extra_refund_after_close']
    const ins = db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents, name, note) VALUES (?, ?, ?, ?, ?)')
    for (const [i, t] of types.entries()) {
      ins.run(orderId, t, i === 0 ? 30000 : -100, '条目' + i, '备注' + i)
    }
    const rows = db.prepare('SELECT * FROM order_price_entries WHERE order_id = ? ORDER BY id').all(orderId) as PriceEntryDbRow[]
    expect(rows).toHaveLength(7)
    // 默认值：created_by / created_at
    expect(rows[0].created_by).toBe('artist')
    expect(rows[0].created_at).toBeTruthy()
  })

  it('TC-MIG-39c: CHECK 约束拒绝非法类型', () => {
    const artist = db.prepare('INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)').run('79902', 'PriceEntryArtist2', 'pe-artist2')
    const order = db.prepare('INSERT INTO orders (artist_id, order_no, client_qq) VALUES (?, ?, ?)').run(artist.lastInsertRowid, 'PE-002', '88902')
    expect(() => {
      db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents) VALUES (?, ?, ?)').run(order.lastInsertRowid, 'bogus_type', 100)
    }).toThrow()
  })

  it('TC-MIG-39d: 订单删除时条目级联清除（ON DELETE CASCADE）', () => {
    const artist = db.prepare('INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)').run('79903', 'PriceEntryArtist3', 'pe-artist3')
    const order = db.prepare('INSERT INTO orders (artist_id, order_no, client_qq) VALUES (?, ?, ?)').run(artist.lastInsertRowid, 'PE-003', '88903')
    const orderId = Number(order.lastInsertRowid)
    db.prepare('INSERT INTO order_price_entries (order_id, type, delta_cents) VALUES (?, ?, ?)').run(orderId, 'base', 5000)
    db.prepare('DELETE FROM orders WHERE id = ?').run(orderId)
    const left = db.prepare('SELECT COUNT(*) AS c FROM order_price_entries WHERE order_id = ?').get(orderId) as { c: number }
    expect(left.c).toBe(0)
  })

  it('TC-MIG-39e: 索引 idx_price_entries_order 已建', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_price_entries_order'").get()
    expect(idx).toBeTruthy()
  })
})
