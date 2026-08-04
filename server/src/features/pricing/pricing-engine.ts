/**
 * REQ-025 动态节点计价引擎（v0.37 第一阶段）
 *
 * 纯函数计价核心：给定「收款节点 + 价格条目账本 + 已收总额 + 完成进度」，
 * 推导每个节点的锁定价 / 已收 / 待收 / 额外应收应退，并做守恒自检。
 *
 * 第一阶段边界（派工死命令）：
 *   - 本模块全部为纯函数，无副作用、不碰数据库、不改任何现有端点/调用点。
 *   - 所有金额一律整数「分」(cents)。
 *   - 第二阶段才接端点、切调用点、写 base 条目。
 *
 * 规则映射见 docs/requirements/REQ-025-动态节点计价模型.md（R1~R12）。
 */
import { AppError, E } from '../../shared/errors.js'

// ─── 类型定义 ───

/** 价格条目类型（R1，与迁移 v39 的 CHECK 约束一一对应） */
export type PriceEntryType =
  | 'base'
  | 'manual_adjust'
  | 'extra_item'
  | 'discount_item'
  | 'refund_item'
  | 'extra_charge_after_close'
  | 'extra_refund_after_close'

/** 订单价格条目（账本，R1：只追加不覆盖不删除） */
export interface PriceEntry {
  id?: number
  orderId?: number
  type: PriceEntryType
  deltaCents: number
  name?: string | null
  note?: string | null
  createdBy?: string
  createdAt?: string
}

/**
 * 收款节点（分期）引擎入参。
 * basisPoints 为创建时快照的原始基点（R3，分摊依据，1/10000）。
 * amountCents 为当前节点价；paidCents 为当前已分配收款（供负 delta 下限判断）。
 */
export interface EngineInstallment {
  id?: number
  label?: string
  sortOrder: number
  basisPoints: number
  amountCents: number
  paidCents?: number
}

/** computeLockedState 的结果 */
export interface LockedState {
  /** 每节点是否锁定（与入参 installments 顺序一致） */
  lockedFlags: boolean[]
  /** 每节点推导出的已分配收款（顺序填充，R7） */
  paidCents: number[]
  /** 锁定原因：completed=完成即锁 / paidOff=付清即锁 / prev=回退不解锁 / null=未锁（R4） */
  reasons: Array<'completed' | 'paidOff' | 'prev' | null>
}

/** allocateDelta 的结果 */
export interface AllocateDeltaResult {
  /** 分摊后的每节点新价（与入参顺序一致） */
  amountsCents: number[]
  /** 每节点分得的 delta（可追溯，R11.3；锁定节点为 0） */
  allocationsCents: number[]
  /** 全锁时正 delta 进入额外应收（R10） */
  extraChargeCents: number
  /** 全锁时负 delta 进入额外应退（R10） */
  extraRefundCents: number
}

/** deriveInstallmentProgress 的单节点结果 */
export interface ProgressRow {
  paidCents: number
  /** 待收 = 节点价 − 已分配；非尾款最低 0，尾款可为负（R8） */
  remainingCents: number
}

/** assertConservation 的入参（全部为「分」整数） */
export interface ConservationInput {
  /** 订单应收总额 = Σ 条目 delta（R1） */
  totalCents: number
  /** 已收总额（订单级 paid_total_cents） */
  paidTotalCents: number
  /** 每节点当前价 */
  nodeAmountsCents: number[]
  /** 每节点当前待收（独立给出，便于单独断言） */
  nodeRemainingCents: number[]
  /** 额外应收（关单后加价，R10） */
  extraChargeCents: number
  /** 额外应退（关单后退款，R10） */
  extraRefundCents: number
  /** 可选：每节点基础分摊额（A3 追溯） */
  baseSharesCents?: number[]
  /** 可选：每节点历次分摊增量之和（A3 追溯） */
  allocHistoryCents?: number[]
}

// ─── 工具 ───

/** R1：订单应收总额 = Σ 全部条目 delta */
export function sumEntryDeltas(entries: PriceEntry[]): number {
  let sum = 0
  for (const e of entries) sum += e.deltaCents
  return sum
}

/**
 * 顺序填充（R7）：把 paidTotal 按节点顺序填入待收，返回每节点已分配。
 * 非尾款节点最多填到节点价；尾款节点吸收全部剩余（可超付，为 R8 负待收留口）。
 */
function forwardFill(amountsCents: number[], paidTotalCents: number): number[] {
  const n = amountsCents.length
  const paid = new Array<number>(n).fill(0)
  if (n === 0) return paid
  let remaining = paidTotalCents
  for (let i = 0; i < n; i++) {
    if (i < n - 1) {
      const take = Math.min(remaining, amountsCents[i])
      paid[i] = take > 0 ? take : 0
      remaining -= paid[i]
    } else {
      // 尾款节点吸收全部剩余（可为负场景由 applyRefund/负 delta 处理）
      paid[i] = remaining
      remaining = 0
    }
  }
  return paid
}

// ─── 初始分配 ───

/**
 * 初始分配（R3）：把订单总价按节点原始基点摊成节点价。
 *
 * 与现有 recalcInstallmentAmounts 语义一致：
 *   ratioTotal = round(total × Σbp / 10000)（比例和≠100% 时按比例和算，案例 10）；
 *   前 N-1 个节点各自 round，末节点 = ratioTotal − 前面之和，吸收舍入尾差。
 *
 * 注意：这是「初始」分配（取整用 round）。后续增减价走 allocateDelta（R5/R6，floor+尾差归最后未锁）。
 */
export function allocateInitial(installments: EngineInstallment[], totalCents: number): number[] {
  const sorted = [...installments].sort((a, b) => a.sortOrder - b.sortOrder)
  const n = sorted.length
  if (n === 0) return []
  const totalBp = sorted.reduce((s, i) => s + i.basisPoints, 0)
  const ratioTotal = Math.round((totalCents * totalBp) / 10000)
  const amounts = new Array<number>(n).fill(0)
  let allocated = 0
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      amounts[i] = ratioTotal - allocated
    } else {
      amounts[i] = Math.round((totalCents * sorted[i].basisPoints) / 10000)
      allocated += amounts[i]
    }
  }
  return amounts
}

// ─── 锁价 ───

/**
 * 计算每节点锁定状态（R4：完成 OR 付清，先到先锁；回退不解锁）。
 *
 * @param installments        节点列表（含当前价 amountCents）
 * @param paidTotalCents      订单级已收总额
 * @param completedStageIndex 已完成的最后收款节点下标（0 起，-1/省略=无完成）
 * @param prevLockedFlags     上一轮锁定标记（回退不解锁：已锁的保持锁）
 */
export function computeLockedState(
  installments: EngineInstallment[],
  paidTotalCents: number,
  completedStageIndex: number = -1,
  prevLockedFlags?: boolean[]
): LockedState {
  const sorted = [...installments].sort((a, b) => a.sortOrder - b.sortOrder)
  const n = sorted.length
  const amounts = sorted.map(i => i.amountCents)
  const paid = forwardFill(amounts, paidTotalCents)
  const lockedFlags = new Array<boolean>(n).fill(false)
  const reasons: LockedState['reasons'] = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    const isCompleted = i <= completedStageIndex
    const isPaidOff = paid[i] >= amounts[i] && amounts[i] > 0
    const wasLocked = prevLockedFlags?.[i] === true
    if (isCompleted) {
      lockedFlags[i] = true
      reasons[i] = 'completed'
    } else if (isPaidOff) {
      lockedFlags[i] = true
      reasons[i] = 'paidOff'
    } else if (wasLocked) {
      lockedFlags[i] = true
      reasons[i] = 'prev'
    }
  }
  return { lockedFlags, paidCents: paid, reasons }
}

// ─── 增减价分摊 ───

/**
 * 分摊一笔 delta（R5/R6/R10）。
 *
 * - 无未锁节点 → 正 delta 进额外应收、负 delta 进额外应退，节点不动（R10）。
 * - 有未锁节点 → 按未锁节点「原始基点」归一化分摊；逐节点向下取整，
 *   尾差归最后一个未锁节点，保证 Σ 分摊 ≡ delta（R6）。
 * - 负 delta 额外受 R8 下限约束：非尾款未锁节点待收最低 0，
 *   超出部分压到尾款节点使其待收变负（案例 8）。
 *
 * @param installments 节点列表（需含 basisPoints / amountCents / paidCents）
 * @param lockedFlags  与 installments 顺序一致的锁定标记
 * @param deltaCents   增价为正、减价为负
 */
export function allocateDelta(
  installments: EngineInstallment[],
  lockedFlags: boolean[],
  deltaCents: number
): AllocateDeltaResult {
  // 配对后按 sortOrder 排序，保证 lockedFlags 始终与其节点对齐（调用方可传任意顺序）
  const pairs = installments
    .map((inst, idx) => ({ inst, locked: lockedFlags[idx] === true }))
    .sort((a, b) => a.inst.sortOrder - b.inst.sortOrder)
  const sorted = pairs.map(p => p.inst)
  const n = sorted.length
  const amounts = sorted.map(i => i.amountCents)
  const alloc = new Array<number>(n).fill(0)
  let extraCharge = 0
  let extraRefund = 0

  const unlockedIdx: number[] = []
  for (let i = 0; i < n; i++) {
    if (!pairs[i].locked) unlockedIdx.push(i)
  }

  if (unlockedIdx.length === 0 || deltaCents === 0) {
    if (deltaCents > 0) extraCharge = deltaCents
    else if (deltaCents < 0) extraRefund = -deltaCents
    return { amountsCents: amounts, allocationsCents: alloc, extraChargeCents: extraCharge, extraRefundCents: extraRefund }
  }

  const bpSum = unlockedIdx.reduce((s, i) => s + sorted[i].basisPoints, 0)
  if (bpSum <= 0) {
    // 退化：未锁节点基点和为 0，无法按比例分摊 → 全部进额外项
    if (deltaCents > 0) extraCharge = deltaCents
    else extraRefund = -deltaCents
    return { amountsCents: amounts, allocationsCents: alloc, extraChargeCents: extraCharge, extraRefundCents: extraRefund }
  }

  // 比例分摊：向下取整，尾差归最后一个未锁节点（R6）
  let allocated = 0
  for (let k = 0; k < unlockedIdx.length; k++) {
    const i = unlockedIdx[k]
    const isLast = k === unlockedIdx.length - 1
    if (isLast) {
      alloc[i] = deltaCents - allocated
    } else {
      alloc[i] = Math.floor((deltaCents * sorted[i].basisPoints) / bpSum)
      allocated += alloc[i]
    }
  }

  // 负 delta 的 R8 下限：非尾款未锁节点待收不得 < 0，超出部分压到尾款节点
  if (deltaCents < 0) {
    const lastUnlocked = unlockedIdx[unlockedIdx.length - 1]
    let excess = 0
    for (const i of unlockedIdx) {
      if (i === lastUnlocked) continue // 尾款节点可吸收（待收可为负）
      const paidCents = sorted[i].paidCents ?? 0
      const remaining = amounts[i] - paidCents
      const newRemaining = remaining + alloc[i]
      if (newRemaining < 0) {
        // 该节点最多只能减掉自己的待收（把待收打到 0）
        const capped = -remaining
        excess += alloc[i] - capped // alloc[i] 更负，excess 为负
        alloc[i] = capped
      }
    }
    alloc[lastUnlocked] += excess
  }

  for (let i = 0; i < n; i++) amounts[i] += alloc[i]
  return { amountsCents: amounts, allocationsCents: alloc, extraChargeCents: extraCharge, extraRefundCents: extraRefund }
}

// ─── 收款进度 ───

/**
 * 推导每节点已收/待收（R7 顺序填充 + 超付抵扣，R8 下限）。
 * 非尾款节点待收最低 0；尾款节点待收可为负（多收可退）。
 */
export function deriveInstallmentProgress(
  installments: EngineInstallment[],
  paidTotalCents: number
): ProgressRow[] {
  const sorted = [...installments].sort((a, b) => a.sortOrder - b.sortOrder)
  const n = sorted.length
  const amounts = sorted.map(i => i.amountCents)
  const paid = forwardFill(amounts, paidTotalCents)
  const rows: ProgressRow[] = []
  for (let i = 0; i < n; i++) {
    let remaining = amounts[i] - paid[i]
    if (i < n - 1 && remaining < 0) remaining = 0 // 非尾款下限 0（R8）
    rows.push({ paidCents: paid[i], remainingCents: remaining })
  }
  return rows
}

// ─── 退款 ───

/** applyRefund 的结果 */
export interface RefundResult {
  /** 退款后的每节点新价（锁定节点不变；尾款可能低于已收 → 待收为负） */
  amountsCents: number[]
  /** 全部节点锁定时退款无法进节点 → 额外应退（R10） */
  extraRefundCents: number
}

/**
 * 退款镜像填充（R9）：退款只冲未锁节点，从尾往头冲（R7 顺序填充的镜像）。
 *
 * - 冲的是未锁节点的「待收」（等价于降价，客户少付），不回溯已锁节点。
 * - 冲到底（未锁节点待收全部为 0）后仍有剩余 → 尾款节点待收变负（应退给客户）。
 * - 全部节点锁定（订单关闭）→ 退款进额外应退（R10），节点不动。
 *
 * @param installments 节点列表（含当前价 amountCents 与已分配 paidCents）
 * @param lockedFlags  与 installments 顺序一致的锁定标记
 * @param refundCents  退款金额（正数）
 */
export function applyRefund(
  installments: EngineInstallment[],
  lockedFlags: boolean[],
  refundCents: number
): RefundResult {
  // 配对后按 sortOrder 排序，保证 lockedFlags 始终与其节点对齐
  const pairs = installments
    .map((inst, idx) => ({ inst, locked: lockedFlags[idx] === true }))
    .sort((a, b) => a.inst.sortOrder - b.inst.sortOrder)
  const sorted = pairs.map(p => p.inst)
  const n = sorted.length
  const amounts = sorted.map(i => i.amountCents)
  if (refundCents <= 0 || n === 0) {
    return { amountsCents: amounts, extraRefundCents: 0 }
  }

  const unlockedIdx: number[] = []
  for (let i = 0; i < n; i++) {
    if (!pairs[i].locked) unlockedIdx.push(i)
  }
  // 全锁 → 额外应退（R10）
  if (unlockedIdx.length === 0) {
    return { amountsCents: amounts, extraRefundCents: refundCents }
  }

  let remainingRefund = refundCents
  // 从尾往头冲未锁节点待收（R9 镜像方向）
  for (let k = unlockedIdx.length - 1; k >= 0; k--) {
    if (remainingRefund <= 0) break
    const i = unlockedIdx[k]
    const paidCents = sorted[i].paidCents ?? 0
    const remaining = amounts[i] - paidCents // 待收（未锁节点应 ≥ 0）
    const take = Math.min(remainingRefund, Math.max(remaining, 0))
    amounts[i] -= take
    remainingRefund -= take
  }
  // 冲到底：剩余把尾款节点待收打成负（应退）——尾款即最后一个未锁节点
  if (remainingRefund > 0) {
    const lastUnlocked = unlockedIdx[unlockedIdx.length - 1]
    amounts[lastUnlocked] -= remainingRefund
  }
  return { amountsCents: amounts, extraRefundCents: 0 }
}

// ─── 守恒断言 ───

/**
 * 守恒断言（R11）。三条任一不成立即抛 AppError(PRICING_CONSERVATION)。
 *
 * A1 总价 = Σ 节点价 + 额外应收 − 额外应退
 * A2 总价 − 已收 = Σ 节点待收 + 额外应收 − 额外应退
 * A3 每节点价 = 基础分摊额 + Σ 历次分摊增量（提供 baseShares/allocHistory 时校验）
 */
export function assertConservation(input: ConservationInput): void {
  const {
    totalCents,
    paidTotalCents,
    nodeAmountsCents,
    nodeRemainingCents,
    extraChargeCents,
    extraRefundCents,
    baseSharesCents,
    allocHistoryCents
  } = input

  const sumAmounts = nodeAmountsCents.reduce((s, v) => s + v, 0)
  const sumRemaining = nodeRemainingCents.reduce((s, v) => s + v, 0)

  // A1：总价 = Σ 节点价 + 额外应收 − 额外应退
  if (totalCents !== sumAmounts + extraChargeCents - extraRefundCents) {
    throw new AppError(E.PRICING_CONSERVATION, 500, {
      assertion: 'A1',
      totalCents,
      sumAmounts,
      extraChargeCents,
      extraRefundCents
    })
  }

  // A2：总价 − 已收 = Σ 节点待收 + 额外应收 − 额外应退
  if (totalCents - paidTotalCents !== sumRemaining + extraChargeCents - extraRefundCents) {
    throw new AppError(E.PRICING_CONSERVATION, 500, {
      assertion: 'A2',
      totalCents,
      paidTotalCents,
      sumRemaining,
      extraChargeCents,
      extraRefundCents
    })
  }

  // A3：节点价 = 基础分摊额 + Σ 历次分摊增量（可选，提供即校验）
  if (baseSharesCents && allocHistoryCents) {
    for (let i = 0; i < nodeAmountsCents.length; i++) {
      const expected = (baseSharesCents[i] ?? 0) + (allocHistoryCents[i] ?? 0)
      if (nodeAmountsCents[i] !== expected) {
        throw new AppError(E.PRICING_CONSERVATION, 500, {
          assertion: 'A3',
          index: i,
          amountCents: nodeAmountsCents[i],
          expected
        })
      }
    }
  }
}
