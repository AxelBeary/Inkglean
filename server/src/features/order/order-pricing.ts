import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { allocateDelta, computeLockedState, assertConservation, sumEntryDeltas } from '../pricing/pricing-engine.js'
import type { EngineInstallment, PriceEntry } from '../pricing/pricing-engine.js'
import { logActivity } from './activity-log.service.js'
import { resolvePriceCents } from '../../utils/price.js'
import type { OrderDetail } from '../../types/entities.js'
import { getOrder } from './order-read.js'
import { updateOrderChecked } from './order-fields.js'
import { MAX_MONEY_CENTS } from './order-limits.js'

// ============================================
// 订单服务 - 计价/增项/收款子域（从 order.service.ts 拆出）
// ============================================

// ─── v0.11 R2: 最终价格修改 ───

/**
 * 修改订单最终价格
 * 校验：正整数（分），上限 MAX_MONEY_CENTS（100 万元，815 拍板 #2 统一口径）
 * 改价时自动追加订单备注 "最终价格从 ¥A 改为 ¥B"
 */
export function updateFinalPrice(orderId: number, finalPriceCents: number, quoteSnapshot?: string | null, expectedVersion?: number): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // v0.37 终态守卫：delivered/cancelled 禁止改价
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  // REQ-025 R13: done = 半终态——禁止无痕改总价，改价必须走条目（加/减附加项）
  if (order.status === 'done') {
    throw new AppError(E.PRICE_CHANGE_AFTER_DONE)
  }

  // 校验：正整数，1 ~ MAX_MONEY_CENTS（100 万元）
  if (!Number.isInteger(finalPriceCents) || finalPriceCents < 1 || finalPriceCents > MAX_MONEY_CENTS) {
    throw new AppError(E.INVALID_PRICE, 400, { value: finalPriceCents })
  }

  return db.transaction(() => {
    // 计算旧价格（用于备注）
    const oldCents = resolvePriceCents(order)

    // REQ-025 第二阶段：改价条目化（R2 入口 A）——存量无账本订单先按旧价补 base 条目
    //（必须在 UPDATE final_price 之前，否则补录的 base 会取到新价）
    ensureBaseEntry(orderId)

    updateOrderChecked(
      orderId,
      expectedVersion,
      'final_price_cents = ?, quote_snapshot = COALESCE(?, quote_snapshot)',
      finalPriceCents,
      quoteSnapshot ?? null
    )

    // manual_adjust 条目 delta = 新总价 − 当前总价；条目由 applyDeltaToInstallments 按去向落账；
    // 节点联动只摊未锁节点（allocateDelta），已锁节点价不再变（R4/R5；recalcInstallmentAmounts 已退役删除）
    const deltaCents = finalPriceCents - (oldCents ?? 0)
    if (deltaCents !== 0) {
      applyDeltaToInstallments(orderId, deltaCents, 'manual_adjust', '改价')
    }

    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'price_change', 'artist', { oldCents, newCents: finalPriceCents, reason: quoteSnapshot || null })

    // 自动追加备注
    const oldStr = oldCents != null ? `¥${(oldCents / 100).toFixed(2)}` : '未定价'
    const newStr = `¥${(finalPriceCents / 100).toFixed(2)}`
    db.prepare('INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, ?)')
      .run(orderId, `最终价格从 ${oldStr} 改为 ${newStr}`, 'system')

    // REQ-025 R11: 守恒自检（不守恒即抛 PRICING_CONSERVATION 回滚）
    checkOrderConservation(orderId)

    return getOrder(orderId)!
  })()
}

// ─── SPEC-003: 附加工作项 ───

export interface OrderInstallment {
  id: number
  name: string
  amountCents: number
  paidCents: number
  remainingCents: number
  status: string
  locked: boolean
  lockedReason: string | null
}

/**
 * 获取订单付款节点（客户进度页 + 画师端节点收款）
 * v0.36 BUG-1 方案 b: 改读额度池 orders.paid_total_cents，按节点金额顺序推算每期状态，
 * 不再读 order_payment_installments.paid_cents（旧节点模型残留，列已随 v52 退役删除）。
 * paid: 完全覆盖 | partial: 部分覆盖 | pending: 未覆盖
 * 撤销回冲自然生效：负流水 → paid_total_cents 减少 → 状态自动回退，无需额外代码
 * 2-1（审计 二#1）: 与引擎视图 readInstallmentState 同口径——已收先封顶到 Σ节点价、
 * 每节点已收钳制到 [0, 节点价]，收款后大幅降价时节点级已付/待付不再出现负数错乱
 */
export function getOrderInstallments(orderId: number): OrderInstallment[] {
  return getOrdersInstallments([orderId]).get(orderId) ?? []
}

/**
 * 批量获取多个订单的付款节点（815 P-2：admin 订单列表逐单 N+1 → 2 条 IN 查询内存分组）
 * 每单算法与 getOrderInstallments 完全一致：读额度池 paid_total_cents，按节点金额顺序推算每期状态。
 */
export function getOrdersInstallments(orderIds: number[]): Map<number, OrderInstallment[]> {
  const result = new Map<number, OrderInstallment[]>()
  if (orderIds.length === 0) return result

  const placeholders = orderIds.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, order_id, label as name, amount_cents as amountCents, locked, locked_reason as lockedReason
     FROM order_payment_installments
     WHERE order_id IN (${placeholders})
     ORDER BY order_id ASC, sort_order ASC`
  ).all(...orderIds) as Array<{ id: number; order_id: number; name: string; amountCents: number; locked: number; lockedReason: string | null }>

  const orderRows = db.prepare(
    `SELECT id, paid_total_cents FROM orders WHERE id IN (${placeholders})`
  ).all(...orderIds) as Array<{ id: number; paid_total_cents: number | null }>
  const coveredByOrder = new Map(orderRows.map(r => [r.id, r.paid_total_cents ?? 0]))

  const rowsByOrder = new Map<number, Array<{ id: number; name: string; amountCents: number; locked: number; lockedReason: string | null }>>()
  for (const r of rows) {
    const list = rowsByOrder.get(r.order_id)
    if (list) list.push(r)
    else rowsByOrder.set(r.order_id, [r])
  }

  for (const [orderId, list] of rowsByOrder) {
    // 2-1（审计 二#1）: 已收封顶到 Σ节点价，逐节点 take 钳制到 [0, amt]——
    // 与 readInstallmentState（引擎视图）同口径；负价/零价节点视为已结清，
    // 杜绝大幅降价至已收之下时出现负「已付」/「待付」展示错乱
    const sumAmounts = list.reduce((s, r) => s + (r.amountCents || 0), 0)
    let covered = Math.min(coveredByOrder.get(orderId) ?? 0, sumAmounts)
    const installments: OrderInstallment[] = []
    for (const r of list) {
      const amt = r.amountCents || 0
      let paidCents = 0
      let status = 'pending'
      if (amt > 0 && covered > 0) {
        const take = Math.min(covered, amt)
        covered -= take
        paidCents = take
        status = take >= amt ? 'paid' : 'partial'
      } else if (amt <= 0) {
        // 无待收节点（0 价/负价尾款）：不产生已付，也绝不显示负待付
        status = 'paid'
      }
      installments.push({
        id: r.id,
        name: r.name,
        amountCents: amt,
        paidCents,
        remainingCents: Math.max(0, amt - paidCents),
        status,
        locked: r.locked === 1,
        lockedReason: r.lockedReason ?? null
      })
    }
    result.set(orderId, installments)
  }

  return result
}

/**
 * 订单收款明细（客户可见字段——只返回金额/备注/时间，不含 created_by 等内部信息）
 * 按创建时间升序，与额度池收款流水一致；负数=退款（前端按正负展示）
 */
export function getOrderPayments(orderId: number): Array<{ id: number; amountCents: number; note: string | null; createdAt: string }> {
  const rows = db.prepare(
    `SELECT id, amount_cents, note, created_at FROM order_payments WHERE order_id = ? ORDER BY created_at ASC`
  ).all(orderId) as Array<{ id: number; amount_cents: number; note: string | null; created_at: string }>
  return rows.map(r => ({
    id: r.id,
    amountCents: r.amount_cents,
    note: r.note,
    createdAt: r.created_at
  }))
}

/**
 * 加减法调整订单最终价格（P0-2；recalcFinalPrice 已退役删除，不再从快照整体重算）
 * 在当前 final_price_cents 基础上加减 delta，不从头重算
 * 手动改价不会被后续增项操作覆盖
 */
function adjustFinalPrice(orderId: number, deltaCents: number): number {
  const order = db.prepare('SELECT final_price_cents, total_price_cents, price_snapshot FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null; price_snapshot: number | null } | undefined
  const currentFinal = order ? (resolvePriceCents(order) ?? 0) : 0
  const newFinal = currentFinal + deltaCents
  // H-5（审计批 260830）：调整后总价落库前兜底断言——上游单项 ± 上限校验防不住
  // 「删减价项冲正 / 多项累加」等组合路径把总价推出 [0, MAX] 区间，超限即抛错回滚。
  // addExtraItem 正向分支另有前置累加校验给用户清晰提示，本断言是写路径最后防线。
  if (!Number.isInteger(newFinal) || newFinal < 0 || newFinal > MAX_MONEY_CENTS) {
    throw new AppError(E.INVALID_PRICE, 400, { value: newFinal, message: '调整后总价超出允许范围（0 ~ 100 万元）' })
  }
  // F5: 金额加减写路径递增 version（对齐 addPayment 相对增量写法，行为其余不变）
  db.prepare('UPDATE orders SET final_price_cents = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newFinal, orderId)
  return newFinal
}

/**
 * 金额格式化（分 → 元字符串，用于系统备注）
 */
function formatCents(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

// ─── REQ-025 第二阶段：计价引擎接线（条目账本 + 锁价 + 守恒） ───

/** 读取订单价格条目账本（按写入顺序） */
export function getPriceEntries(orderId: number): PriceEntry[] {
  const rows = db.prepare(
    'SELECT id, order_id, type, delta_cents, name, note, created_by, created_at FROM order_price_entries WHERE order_id = ? ORDER BY id ASC'
  ).all(orderId) as Array<{ id: number; order_id: number; type: PriceEntry['type']; delta_cents: number; name: string | null; note: string | null; created_by: string; created_at: string }>
  return rows.map(r => ({
    id: r.id,
    orderId: r.order_id,
    type: r.type,
    deltaCents: r.delta_cents,
    name: r.name,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at
  }))
}

/**
 * 追加一条价格条目（R1：只追加不覆盖不删除）
 * 域内导出：order-create.ts 的 createOrder 需在下单事务内写 base 条目
 */
export function appendPriceEntry(orderId: number, type: PriceEntry['type'], deltaCents: number, name?: string | null, createdBy = 'artist'): void {
  db.prepare(
    'INSERT INTO order_price_entries (order_id, type, delta_cents, name, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(orderId, type, deltaCents, name ?? null, createdBy)
}

/**
 * 存量订单懒回填 base 条目：账本为空时按当前价格补一条 base。
 * 守恒挂载的前提是账本完整；无条目订单（旧数据/直插订单）首次价格变动时触发。
 */
function ensureBaseEntry(orderId: number): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM order_price_entries WHERE order_id = ?').get(orderId) as { c: number }).c
  if (count > 0) return
  const order = db.prepare('SELECT final_price_cents, total_price_cents, price_snapshot FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null; price_snapshot: number | null } | undefined
  const base = order ? resolvePriceCents(order) : null
  if (base == null || base <= 0) return
  appendPriceEntry(orderId, 'base', base, '初始报价（补录）', 'system')
}

/**
 * 读取订单节点的引擎视图（含锁定标记与推导已收）。
 * 已收一律从 orders.paid_total_cents 顺序填充推导（paid_cents 旧列已随 v52 退役，R7）。
 * 返回按 sort_order 升序；lockedFlags 与 insts 同序。
 */
function readInstallmentState(orderId: number): { insts: EngineInstallment[]; lockedFlags: boolean[] } {
  const rows = db.prepare(
    'SELECT id, label, basis_points, amount_cents, locked FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId) as Array<{ id: number; label: string; basis_points: number; amount_cents: number | null; locked: number }>
  const order = db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(orderId) as { paid_total_cents: number | null } | undefined
  const sumAmounts = rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0)
  let covered = Math.min(order?.paid_total_cents ?? 0, sumAmounts)
  const insts: EngineInstallment[] = rows.map((r, i) => {
    const amt = r.amount_cents ?? 0
    const take = Math.max(0, Math.min(covered, amt))
    covered -= take
    return { id: r.id, label: r.label, sortOrder: i, basisPoints: r.basis_points, amountCents: amt, paidCents: take }
  })
  return { insts, lockedFlags: rows.map(r => r.locked === 1) }
}

/**
 * 推导已完成的最后收款节点下标（computeLockedState 的 completedStageIndex 入参）。
 * done/delivered → 全部阶段完成；否则 = 当前阶段之前的收款节点数 − 1。
 *
 * M-10（审计批 260830，已拍板最小修口径）：返回值用该订单 installments 节点数收口——
 * index = Math.min(index, installmentsCount - 1)，installmentsCount=0 时返回 -1。
 * 原因：artist_workflow_stages 是活表，模板**后加**收款阶段会追溯抬高本下标，
 * 把下单快照里不存在的节点追溯锁定（installments 是下单快照，不随模板增长）；
 * 收口后「后加阶段不得追溯锁定存量订单」。「阶段被删」一侧无需处理——
 * 既有锁定粘滞保留（回退不解锁同语义）。
 */
function getCompletedPaymentStageIndex(order: { id: number; artist_id: number; current_stage_id: number | null; status: string }): number {
  // M-10：installments 是下单快照，其节点数是锁定推导的天花板（模板后加阶段不追溯）
  const installmentsCount = (db.prepare('SELECT COUNT(*) AS c FROM order_payment_installments WHERE order_id = ?').get(order.id) as { c: number }).c
  if (installmentsCount === 0) return -1

  const stages = db.prepare(
    'SELECT id, sort_order, takes_payment FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as Array<{ id: number; sort_order: number; takes_payment: number }>
  const paymentStages = stages.filter(s => s.takes_payment === 1)
  if (paymentStages.length === 0) return -1

  let index: number
  if (['done', 'delivered'].includes(order.status)) {
    index = paymentStages.length - 1
  } else {
    if (order.current_stage_id == null) return -1
    const currentStage = stages.find(s => s.id === order.current_stage_id)
    if (!currentStage) return -1
    const completedCount = paymentStages.filter(ps => ps.sort_order < currentStage.sort_order).length
    index = completedCount - 1
  }
  return Math.min(index, installmentsCount - 1)
}

/**
 * 把一笔价格 delta 应用到节点并落条目（recalcInstallmentAmounts 已退役删除，R5/R6/R10）。
 *
 * 条目账本是总价真相源（Σ 条目 ≡ final_price_cents），因此条目由本函数统一写入，
 * 按 delta 去向决定类型，绝不双重记账：
 *   - 摊进未锁节点 → 写原因条目（entryType：manual_adjust/extra_item/refund_item）
 *   - 关闭（R10/R13：全节点锁定 且 Σ待收=0）→ 写 extra_charge_after_close（正）/
 *     extra_refund_after_close（负），不再写原因条目（额外项条目本身即审计留痕）
 *   - A3 混合去向（全锁未付清的 done 订单负 delta 冲抵完欠款后仍有剩余）→
 *     节点部分写原因条目 + 剩余部分写 extra_refund_after_close，两部分各记一笔，
 *     Σ 仍 ≡ delta（不双重记账、不丢账）
 *
 * 流程：读库锁定状态 → computeLockedState（完成/付清/回退不解锁）→ allocateDelta 只摊未锁节点
 * → 写回 amount_cents + locked + locked_reason。
 */
function applyDeltaToInstallments(orderId: number, deltaCents: number, entryType: PriceEntry['type'], entryName: string): void {
  if (deltaCents === 0) return
  const { insts, lockedFlags: prevLocked } = readInstallmentState(orderId)
  const order = db.prepare('SELECT id, paid_total_cents, current_stage_id, status, artist_id FROM orders WHERE id = ?').get(orderId) as { id: number; paid_total_cents: number | null; current_stage_id: number | null; status: string; artist_id: number } | undefined
  if (!order) return

  // 无节点订单：delta 只改总价，落原因条目即可（无分摊对象）
  if (insts.length === 0) {
    appendPriceEntry(orderId, entryType, deltaCents, entryName)
    return
  }

  const state = computeLockedState(insts, order.paid_total_cents ?? 0, getCompletedPaymentStageIndex(order), prevLocked)
  const res = allocateDelta(insts, state.lockedFlags, deltaCents)
  const update = db.prepare('UPDATE order_payment_installments SET amount_cents = ?, locked = ?, locked_reason = ? WHERE id = ?')
  insts.forEach((inst, i) => {
    update.run(res.amountsCents[i], state.lockedFlags[i] ? 1 : 0, state.lockedFlags[i] ? state.reasons[i] : null, inst.id)
  })

  // 条目落账（与 delta 去向一一对应，不双重记账）：
  //   进节点的部分 → 原因条目；进额外项的部分 → extra 条目；Σ 两笔 = delta
  const nodeDelta = deltaCents - (res.extraChargeCents > 0 ? res.extraChargeCents : 0) + (res.extraRefundCents > 0 ? res.extraRefundCents : 0)
  if (nodeDelta !== 0) {
    appendPriceEntry(orderId, entryType, nodeDelta, entryName)
  }
  if (res.extraChargeCents > 0) {
    appendPriceEntry(orderId, 'extra_charge_after_close', res.extraChargeCents, entryName, 'system')
  }
  if (res.extraRefundCents > 0) {
    appendPriceEntry(orderId, 'extra_refund_after_close', -res.extraRefundCents, entryName, 'system')
  }
}

/**
 * 刷新节点锁定状态（完成即锁 / 付清即锁，R4；回退不解锁由 prevLocked 保证）。
 * advanceStage（完成）与 addPayment（付清）后调用；只写 locked/locked_reason，不动节点价。
 */
export function refreshInstallmentLocks(orderId: number): void {
  const { insts, lockedFlags: prevLocked } = readInstallmentState(orderId)
  if (insts.length === 0) return
  const order = db.prepare('SELECT id, paid_total_cents, current_stage_id, status, artist_id FROM orders WHERE id = ?').get(orderId) as { id: number; paid_total_cents: number | null; current_stage_id: number | null; status: string; artist_id: number } | undefined
  if (!order) return
  const state = computeLockedState(insts, order.paid_total_cents ?? 0, getCompletedPaymentStageIndex(order), prevLocked)
  const update = db.prepare('UPDATE order_payment_installments SET locked = ?, locked_reason = ? WHERE id = ?')
  insts.forEach((inst, i) => {
    update.run(state.lockedFlags[i] ? 1 : 0, state.lockedFlags[i] ? state.reasons[i] : null, inst.id)
  })
}

/**
 * 守恒挂载（R11）：变动出口前自检，不守恒即抛 PRICING_CONSERVATION（事务回滚）。
 * A1 总价 = Σ 节点价 + 额外应收 − 额外应退（额外项取条目总额，与支付状态无关）
 * A2 总价 − 已收 = Σ 节点待收 + 额外应收 − 额外应退
 *    已收超出 Σ 节点价的部分（纯超付）全额压到尾款待收变负，与额外应收不做冲抵——
 *    数学上 A1/A2 同解（Σ待收 ≡ Σ节点价 − 已收），两断言同时成立。
 * A3 追溯链需要额外持久化字段（不在本阶段 schema 范围），服务层不校验；条目只追加本身保证可追溯。
 * R8 非尾款节点（绝对位置 i < n-1）金额不得为负（审计批 260830 H-1：负 delta 旧路径
 *    可把中间节点扣成负的静默损坏，Σ 级守恒拦不住——在此 fail-fast）。尾款节点
 *    允许负金额（超付应退的合法形态，案例 8）。断言置于早退分支之前，
 *    确保 Σbp≠10000 的非常规订单同样兜得住。
 *
 * 适用范围：仅 Σ basis_points = 10000（比例和 100%）的订单——此时 A1 方程才有解
 * （R3：比例之和应为 100%，正式工作流由 validateInstallments I2 SUM_NOT_100 强制）。
 * Σbp≠100% 的非常规配置（人工数据/历史残留）Σ节点价恒小于总价，A1 无解，跳过断言。
 * 无节点订单（缓冲区/无工作流）无守恒对象，直接通过。
 */
export function checkOrderConservation(orderId: number): void {
  const { insts } = readInstallmentState(orderId)
  if (insts.length === 0) return
  // R8 断言（审计批 260830 H-1）：非尾款节点金额不得为负。必须放在 Σbp≠10000
  // 早退之前独立执行——非常规比例订单的负金额同样是资金损坏，不得因早退逃过
  for (let i = 0; i < insts.length - 1; i++) {
    if (insts[i].amountCents < 0) {
      throw new AppError(E.PRICING_CONSERVATION, 500, {
        assertion: 'R8',
        index: i,
        amountCents: insts[i].amountCents
      })
    }
  }
  const bpSum = insts.reduce((s, i) => s + i.basisPoints, 0)
  if (bpSum !== 10000) return
  const order = db.prepare('SELECT final_price_cents, total_price_cents, price_snapshot, paid_total_cents FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null; price_snapshot: number | null; paid_total_cents: number | null } | undefined
  if (!order) return
  const entries = getPriceEntries(orderId)
  const totalCents = entries.length > 0 ? sumEntryDeltas(entries) : (resolvePriceCents(order) ?? 0)
  // 815-P2 金额#6：账本 ↔ 总价对账——有条目时 final_price 必须 ≡ Σ条目，
  // 否则断言只拿条目总额自检，总价列漂移静默（改价/增项全路径都双写，不等即脏数据）
  const orderPriceCents = resolvePriceCents(order)
  if (entries.length > 0 && orderPriceCents != null && orderPriceCents !== totalCents) {
    throw new AppError(E.PRICING_CONSERVATION, 500, {
      assertion: 'LEDGER_DRIFT',
      finalPriceCents: orderPriceCents,
      entrySumCents: totalCents
    })
  }
  const nodeAmountsCents = insts.map(i => i.amountCents)
  const sumAmounts = nodeAmountsCents.reduce((s, v) => s + v, 0)
  const extraChargeCents = entries.filter(e => e.type === 'extra_charge_after_close').reduce((s, e) => s + e.deltaCents, 0)
  const extraRefundCents = -entries.filter(e => e.type === 'extra_refund_after_close').reduce((s, e) => s + e.deltaCents, 0)
  const paidTotal = order.paid_total_cents ?? 0
  // 节点待收：顺序填充（每节点至多填满），超出 Σ 节点价的纯超付压到尾款待收（变负，可退）
  const nodeRemainingCents: number[] = []
  let covered = Math.min(paidTotal, sumAmounts)
  for (const amt of nodeAmountsCents) {
    const take = Math.max(0, Math.min(covered, amt))
    nodeRemainingCents.push(amt - take)
    covered -= take
  }
  const pureOverpay = Math.max(0, paidTotal - sumAmounts)
  if (pureOverpay > 0) nodeRemainingCents[nodeRemainingCents.length - 1] -= pureOverpay
  assertConservation({
    totalCents,
    paidTotalCents: paidTotal,
    nodeAmountsCents,
    nodeRemainingCents,
    extraChargeCents,
    extraRefundCents
  })
}

/** 附加工作项参数 */
interface ExtraItemParams {
  name: string
  description?: string | null
  priceCents?: number
}

/**
 * 添加附加工作项
 * 校验：终态拒绝 + 数量上限 20 + 金额区间守卫（负项减后不为负 / 正项累加不超上限）
 * 事务：插入 → 重算 final_price → 系统备注
 * B7: 额度池模型不关心"计入哪个节点"（adjustInstallments 已退役删除）
 */
export function addExtraItem(orderId: number, { name, description, priceCents }: ExtraItemParams): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 终态拒绝（R13: done 半终态允许加/减项，只拦 delivered/cancelled）
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  const cents = priceCents ?? 0
  const currentFinal = resolvePriceCents(order) ?? 0

  // R13: 负增项（减价路径）守卫——减后总价不得为负
  if (cents < 0 && currentFinal + cents < 0) {
    throw new AppError(E.INVALID_PRICE, 400, { value: cents, message: '减价金额不得超过当前总价' })
  }

  // H-5（审计批 260830）：正向累加守卫——路由 schema 只卡单项 ± 上限，最多 20 项
  // 叠加可把总价推过上限（旧缺口可达 20 倍），前置校验给出清晰业务错误；
  // adjustFinalPrice 内部另有同口径兜底断言（双保险）
  if (cents > 0 && currentFinal + cents > MAX_MONEY_CENTS) {
    throw new AppError(E.INVALID_PRICE, 400, { value: currentFinal + cents, message: '附加项累计后总价不得超过金额上限（100 万元）' })
  }

  // 数量上限
  const count = (db.prepare('SELECT COUNT(*) as c FROM order_extra_items WHERE order_id = ?').get(orderId) as { c: number }).c
  if (count >= 20) {
    throw new AppError(E.EXTRA_ITEM_LIMIT)
  }

  return db.transaction(() => {
      db.prepare('INSERT INTO order_extra_items (order_id, name, description, price_cents) VALUES (?, ?, ?, ?)')
        .run(orderId, name, description || null, cents)

      // REQ-025 第二阶段：存量无账本订单先按旧价补 base 条目
      //（必须在 adjustFinalPrice 之前，否则补录的 base 会取到加项后的新价）
      ensureBaseEntry(orderId)

      // P0-2: 加减法调整最终价格（不重算，保护手动改价）
      const finalCents = adjustFinalPrice(orderId, cents)

      // 增项双写（R1/R2 入口 B）——order_extra_items 保留（UI 层）；
      // 条目账本由 applyDeltaToInstallments 按去向落账（正=extra_item / 负=refund_item / 全锁=额外项）；
      // 节点联动只摊未锁节点（recalcInstallmentAmounts 已退役删除）
      if (cents !== 0) {
        applyDeltaToInstallments(orderId, cents, cents > 0 ? 'extra_item' : 'refund_item', name)
      }

      // v0.31 REQ-021 F1: 操作日志
      logActivity(orderId, 'extra_item', 'artist', { action: 'add', name, priceCents: cents })

      // 系统备注
      const priceStr = cents > 0 ? `+${formatCents(cents)}` : cents < 0 ? `-${formatCents(-cents)}` : '（不计费）'
      let noteContent = `📎 附加工作项「${name}」${priceStr}`
      const paidTotal = order.paid_total_cents ?? 0
      if (paidTotal >= finalCents) {
        noteContent += '（已付清订单追加，线下结算）'
      }
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
        .run(orderId, noteContent)

      // REQ-025 R11: 守恒自检
      checkOrderConservation(orderId)

      return getOrder(orderId)!
    })()
}

/** 附加工作项行 */
interface ExtraItemRow {
  id: number
  order_id: number
  name: string
  description: string | null
  price_cents: number
}

/**
 * 删除附加工作项
 * 校验：归属（item.order_id === orderId）
 * 事务：删除 → 重算 final_price → 系统备注
 * B7: adjustInstallments 已退役删除
 */
export function deleteExtraItem(orderId: number, itemId: number): OrderDetail {
  const item = db.prepare('SELECT * FROM order_extra_items WHERE id = ? AND order_id = ?').get(itemId, orderId) as ExtraItemRow | undefined
  if (!item) throw new AppError(E.NOT_FOUND, 404)

  // v0.37 终态守卫 + R13：done 半终态允许增减附加项，delivered/cancelled 拒绝
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  // audit-a F1: 删正项守卫——减后总价不得为负（与 addExtraItem 的负增项守卫对称）。
  // 合法操作序列「改价 1000 → 加项 +1500 → 改价回 1000 → 删该增项」会被这里拦下，
  // 防止 final_price_cents 被 adjustFinalPrice 打成负数。
  if (item.price_cents > 0) {
    const currentFinal = resolvePriceCents(order) ?? 0
    if (currentFinal - item.price_cents < 0) {
      throw new AppError(E.INVALID_PRICE, 400, { value: -item.price_cents, message: '删除金额不得超过当前总价' })
    }
  }

  return db.transaction(() => {
      db.prepare('DELETE FROM order_extra_items WHERE id = ?').run(itemId)

      // REQ-025 第二阶段：存量无账本订单先按旧价补 base 条目（必须在 adjustFinalPrice 之前）
      ensureBaseEntry(orderId)

      // P0-2: 加减法调整最终价格（不重算，保护手动改价）
      const finalCents = adjustFinalPrice(orderId, -item.price_cents)

      // 删项 = 冲正条目（R1：条目只追加不物理删）；UI 层 order_extra_items 仍物理删
      // 条目账本由 applyDeltaToInstallments 按去向落账（refund_item / 全锁=额外应退）；
      // 节点联动只摊未锁节点（recalcInstallmentAmounts 已退役删除）
      if (item.price_cents !== 0) {
        applyDeltaToInstallments(orderId, -item.price_cents, 'refund_item', `移除「${item.name}」`)
      }

      // v0.31 REQ-021 F1: 操作日志
      logActivity(orderId, 'extra_item', 'artist', { action: 'delete', name: item.name, priceCents: item.price_cents })

      // 系统备注
      const priceStr = item.price_cents > 0 ? `-${formatCents(item.price_cents)}` : '（不计费）'
      let noteContent = `📎 移除附加工作项「${item.name}」${priceStr}`
      const order = getOrder(orderId)
      const paidTotal = order?.paid_total_cents ?? 0
      if (paidTotal >= finalCents) {
        noteContent += '（已付清订单移除，线下结算）'
      }
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
        .run(orderId, noteContent)

      // REQ-025 R11: 守恒自检
      checkOrderConservation(orderId)

      return getOrder(orderId)!
    })()
}

// ─── B7: 额度池收款（v0.31 F4: 节点维度增强） ───

/** 收款流水行 */
interface PaymentRow {
  id: number
  order_id: number
  installment_id: number | null
  amount_cents: number
  note: string | null
  created_at: string
  created_by: string
}

/**
 * 记录一笔收款（正数）或撤销/退款（负数）
 * 事务原子：INSERT 流水 + UPDATE paid_total_cents；节点已收一律从 paid_total 推导（R7）
 * v0.31 F4: 可选 installmentId 关联到具体节点
 */
export function addPayment(orderId: number, { amountCents, note, createdBy, installmentId }: { amountCents: number; note?: string | null; createdBy?: string; installmentId?: number | null }): PaymentRow {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  if (!Number.isInteger(amountCents) || amountCents === 0) {
    throw new AppError(E.INVALID_PRICE, 400, { value: amountCents })
  }

  // 负数（撤销/退款）必须带 note
  if (amountCents < 0 && !note) {
    throw new AppError(E.VALIDATION, 400, { field: 'note', message: '撤销/退款必须填写原因' })
  }

  // P2-F9: 终态状态守卫——cancelled 仅允许负数冲正；delivered 不再允许正数收款
  if (order.status === 'cancelled' && amountCents > 0) {
    throw new AppError(E.PAYMENT_STATUS_BLOCKED, 400, {
      status: order.status,
      direction: 'credit',
      message: '已取消订单仅允许负数冲正'
    })
  }
  if (order.status === 'delivered' && amountCents > 0) {
    throw new AppError(E.PAYMENT_STATUS_BLOCKED, 400, {
      status: order.status,
      direction: 'credit',
      message: '已交付订单不再允许正数收款'
    })
  }

  // v0.31 F4: 校验节点归属
  if (installmentId) {
    const inst = db.prepare('SELECT * FROM order_payment_installments WHERE id = ? AND order_id = ?').get(installmentId, orderId)
    if (!inst) throw new AppError(E.NOT_FOUND, 404, { installmentId })
  }

  return db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO order_payments (order_id, installment_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(orderId, installmentId || null, amountCents, note || null, createdBy || 'artist')

    // P2-F4: 退款下限校验移入事务内，并改为原子条件更新——
    // 防止基于事务外快照判定（并发撤销可把 paid_total_cents 推到负数）；
    // changes=0（paid_total_cents + amountCents < 0）即拒绝并整笔回滚。
    const updateResult = db.prepare(
      'UPDATE orders SET paid_total_cents = paid_total_cents + ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND paid_total_cents + ? >= 0'
    ).run(amountCents, orderId, amountCents)
    if (updateResult.changes === 0) {
      throw new AppError(E.INVALID_PRICE, 400, { value: amountCents, message: '撤销金额不能超过已收金额' })
    }

    // REQ-025 R4: 付清即锁——收款后按 paid_total 推导刷新节点锁定状态
    //（R7/批4B：节点实收一律从 paid_total 顺序推导，不写已随 v52 退役的 paid_cents/status/paid_at）
    refreshInstallmentLocks(orderId)

    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'payment', createdBy || 'artist', { amountCents, note: note || null, installmentId: installmentId || null })

    // REQ-025 R11: 守恒自检（收款不改总价/节点价，A2 由待收推导自然闭合；挂载防脏数据）
    checkOrderConservation(orderId)

    return db.prepare('SELECT * FROM order_payments WHERE id = ?').get(result.lastInsertRowid) as PaymentRow
  })()
}

/**
 * 获取订单收款流水列表
 */
export function getPayments(orderId: number): PaymentRow[] {
  return db.prepare(
    'SELECT * FROM order_payments WHERE order_id = ? ORDER BY created_at ASC'
  ).all(orderId) as PaymentRow[]
}

// REQ-025 第二阶段（R12 不留双轨）：recalcInstallmentAmounts 已退役删除——
// 全部改价/增项链路改走引擎 allocateDelta（只摊未锁节点，见 applyDeltaToInstallments）。
