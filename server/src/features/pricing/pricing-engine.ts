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
  /** 关闭（全节点锁定且 Σ待收=0）时正 delta 进入额外应收（R10/R13） */
  extraChargeCents: number
  /** 关闭时负 delta 进入额外应退；全锁未付清时负 delta 冲抵完欠款后的剩余进入额外应退（R10/R13） */
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
  const paid = Array.from({ length: n }, () => 0)
  if (n === 0) return paid
  let remaining = paidTotalCents
  for (let i = 0; i < n; i++) {
    if (i < n - 1) {
      const take = Math.min(remaining, amountsCents[i])
      paid[i] = take > 0 ? take : 0
      remaining -= paid[i]
    } else {
      // 尾款节点吸收全部剩余（负待收场景由 allocateDelta 的负 delta 路径处理）
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
  const amounts = Array.from({ length: n }, () => 0)
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
  const lockedFlags = Array.from({ length: n }, () => false)
  const reasons: LockedState['reasons'] = Array.from({ length: n }, () => null)
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
 * 分摊一笔 delta（R5/R6/R10/R13，A3 关闭语义收敛）。
 *
 * 关闭判定（R10 + R13 收敛，A3）：**全部节点锁定 且 Σ待收 = 0** 双条件同时满足
 * 才算关闭——不再是「无未锁节点即关闭」（未付清的全锁 done 订单不属于关闭）。
 *
 * - 关闭 → 正 delta 进额外应收、负 delta 进额外应退，节点不动（R10）。
 * - 未关闭（存在待收 > 0 的节点）→ delta 作用于「有待款的节点」：
 *   · 非全锁订单：按 R5/R9 既有规则只摊未锁节点，已锁但未付清的欠款保留
 *     （案例 2/7：完成即锁的节点不参与分摊）。
 *   · 全锁订单（done 半终态，R13）：参与节点 = 有待款的节点（含已锁但未付清），
 *     正 delta 按 R5「原始基点」比例摊入（增加其待收）；负 delta 按 R9 镜像
 *     从尾往头冲抵欠款，冲抵完仍有剩余 → 额外应退（R13「已付全 → 额外应退」推广）。
 *
 * - 比例分摊逐节点向下取整，尾差归最后一个参与节点，保证 Σ 分摊 + 额外 ≡ delta（R6）。
 * - 非全锁路径的负 delta 额外受 R8 下限约束（按**绝对位置**：i < n-1 即非尾款，
 *   与 deriveInstallmentProgress 同口径）：非尾款节点待收不得 < 0，封顶到 0 后记录超额；
 *   · 真正尾款节点（n-1）在参与者中 → 超额压到尾款节点使其待收变负（案例 8）；
 *   · 真正尾款节点已锁定不在参与者中 → 无节点可吸收负待收，超额转入额外应退
 *     （审计批 260830 H-1：旧实现把超额压给「最后一个参与节点」——尾款已锁定时
 *     它是中间节点，会被扣成负金额造成资金静默损坏，且 Σ 级守恒拦不住）。
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
  const alloc = Array.from({ length: n }, () => 0)
  let extraCharge = 0
  let extraRefund = 0

  // 每节点待收（R8：由入参 paidCents 推导；非尾款最低 0、尾款可为负）
  const remaining = sorted.map((inst, idx) => amounts[idx] - (inst.paidCents ?? 0))
  const allLocked = pairs.every(p => p.locked)
  const sumRemaining = remaining.reduce((s, v) => s + v, 0)
  // A3：关闭 = 全节点锁定 且 Σ待收 = 0（双条件）
  const closed = allLocked && sumRemaining === 0

  // 参与分摊的节点：
  //   - 非全锁 → 未锁节点（R5/R9 既有：只摊未锁，已锁欠款保留）
  //   - 全锁但未关闭（done 未付全，R13）→ 有待款的节点（含已锁但未付清的节点）
  const participantIdx: number[] = []
  for (let i = 0; i < n; i++) {
    if (allLocked ? remaining[i] > 0 : !pairs[i].locked) participantIdx.push(i)
  }

  if (closed || deltaCents === 0 || participantIdx.length === 0) {
    if (deltaCents > 0) extraCharge = deltaCents
    else if (deltaCents < 0) extraRefund = -deltaCents
    return { amountsCents: amounts, allocationsCents: alloc, extraChargeCents: extraCharge, extraRefundCents: extraRefund }
  }

  const bpSum = participantIdx.reduce((s, i) => s + sorted[i].basisPoints, 0)
  if (bpSum <= 0) {
    // 退化：参与节点基点和为 0，无法按比例分摊 → 全部进额外项
    if (deltaCents > 0) extraCharge = deltaCents
    else extraRefund = -deltaCents
    return { amountsCents: amounts, allocationsCents: alloc, extraChargeCents: extraCharge, extraRefundCents: extraRefund }
  }

  if (allLocked && deltaCents < 0) {
    // 全锁未关闭（done 未付全）负 delta：R9 镜像——从尾往头冲抵债务节点待收，
    // 每个节点最多冲掉自己的待收；冲抵完仍有剩余 → 额外应退（R13）
    let remainingDelta = -deltaCents
    for (let k = participantIdx.length - 1; k >= 0; k--) {
      if (remainingDelta <= 0) break
      const i = participantIdx[k]
      const take = Math.min(remainingDelta, Math.max(remaining[i], 0))
      alloc[i] -= take
      remainingDelta -= take
    }
    if (remainingDelta > 0) extraRefund = remainingDelta
  } else {
    // 比例分摊：向下取整，尾差归最后一个参与节点（R6）
    let allocated = 0
    for (let k = 0; k < participantIdx.length; k++) {
      const i = participantIdx[k]
      const isLast = k === participantIdx.length - 1
      if (isLast) {
        alloc[i] = deltaCents - allocated
      } else {
        alloc[i] = Math.floor((deltaCents * sorted[i].basisPoints) / bpSum)
        allocated += alloc[i]
      }
    }

    // 负 delta 的 R8 下限（非全锁路径）：非尾款节点待收不得 < 0。
    // 豁免对象按**绝对位置**判定（真正尾款节点 = n-1，与 deriveInstallmentProgress 同口径），
    // 而非「最后一个参与节点」：当真正尾款节点已锁定不在参与者中时，最后参与者是
    // 中间节点，把超额压给它会打出负金额——资金静默损坏且 Σ 级守恒拦不住（审计批 260830 H-1）。
    if (deltaCents < 0) {
      const finalNodeIdx = n - 1
      const finalNodeParticipates = participantIdx.includes(finalNodeIdx)
      let excess = 0
      for (const i of participantIdx) {
        if (i === finalNodeIdx) continue // 尾款节点可吸收（待收可为负，R8）
        const newRemaining = remaining[i] + alloc[i]
        if (newRemaining < 0) {
          // 该节点最多只能减掉自己的待收（把待收打到 0）
          const capped = -remaining[i] + 0 // +0 归一：待收恰为 0 时 -0 不得进入整数分域
          excess += alloc[i] - capped // alloc[i] 更负，excess 为负
          alloc[i] = capped
        }
      }
      if (finalNodeParticipates) {
        // 尾款节点在参与者中：超额压到尾款使其待收变负（案例 8，原行为保留）
        alloc[finalNodeIdx] += excess
      } else {
        // 尾款节点已锁定不在参与者中：无任何节点可吸收负待收，
        // 超额转入额外应退——宁可显式应退也不得把中间节点扣成负数（审计批 260830 H-1）
        extraRefund += -excess
      }
    }
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
