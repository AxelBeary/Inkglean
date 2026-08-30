import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { allocateInitial } from '../pricing/pricing-engine.js'
import { logActivity } from './activity-log.service.js'
import { resolvePriceCents } from '../../utils/price.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import type { Artist, Order, OrderDetail, WorkflowStage } from '../../types/entities.js'
import { getOrder } from './order-read.js'
import { updateOrderChecked } from './order-fields.js'
import { checkOrderConservation } from './order-pricing.js'

// ============================================
// 订单服务 - 状态机与队列子域（从 order.service.ts 拆出）
// ============================================

/**
 * 订单状态机：定义每个状态允许转换到的下一个状态
 * 唯一事实源：updateOrderStatus / advanceStage / rollbackStage / deliver 共用
 * （audit-b F1：workflow 路径此前绕过本表，现统一收敛到 assertStatusTransition）
 */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  // audit-a P1-1: pending → wip 合法——「定金(收款)→线稿(非收款)→交付」类工作流的
  // 第 2 节点非收款时 mapStageToStatus 返回 wip，未收款直接开工属合法语义（confirmed 非强制前置）
  pending:   ['confirmed', 'wip', 'cancelled'],
  confirmed: ['wip', 'cancelled'],
  // delivered 本就是交付合法路径（wip/revision 可交付），显式化而非绕过
  wip:       ['revision', 'done', 'delivered', 'cancelled'],
  // v129（用户拍板）：revision → revision 合法——「需修改」可反复点击，每点一轮计一次修改（流水留痕）
  revision:  ['revision', 'wip', 'done', 'delivered', 'cancelled'],
  done:      ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
}

/**
 * 统一状态机断言：from → to 非法时抛 INVALID_TRANSITION。
 * 同状态（from === to）不构成状态转换（wip 中间节点推进、revision 连续回退等仅移动节点），直接放行。
 */
export function assertStatusTransition(from: string, to: string): void {
  if (from === to) return
  const allowed = STATUS_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from, to })
  }
}

/**
 * 更新订单状态（带状态机校验）
 * 事务包裹，防止中途崩溃留下不一致状态
 */
export function updateOrderStatus(orderId: number, newStatus: string, confirmPaidCancel: boolean = false, expectedVersion?: number): OrderDetail {
  const validStatuses = ['pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled']
  if (!validStatuses.includes(newStatus)) throw new AppError(E.ORDER_INVALID_STATUS, 400, { status: newStatus })

  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // audit-a R-2: 取消已收款订单必须有显式确认——否则资金静默滞留（409 + 已收金额）
  if (newStatus === 'cancelled' && (order.paid_total_cents ?? 0) > 0 && !confirmPaidCancel) {
    throw new AppError(E.CANCEL_WITH_PAYMENT, 409, { paidCents: order.paid_total_cents })
  }

  const allowed = STATUS_TRANSITIONS[order.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from: order.status, to: newStatus })
  }

  return db.transaction(() => {
    updateOrderChecked(orderId, expectedVersion, 'status = ?', newStatus)

    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'status_change', 'artist', { from: order.status, to: newStatus })

    if (['done', 'delivered'].includes(newStatus)) {
      db.prepare('UPDATE orders SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ?')
        .run(orderId)
    }

    if (['delivered', 'cancelled'].includes(newStatus)) {
      compactQueue(order.artist_id)
      // SPEC-004: 正式区释放名额后尝试自动递补
      tryAutoPromote(order.artist_id)
    }

    return getOrder(orderId)!
  })()
}

/**
 * 重排队列位置（删除/交付后调用）
 * 导出供 order-gallery.service.js 的 deliverOrder 使用
 */
export function compactQueue(artistId: number): void {
  const queue = db.prepare(`
    SELECT id, queue_zone, version FROM orders
    WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}
    ORDER BY queue_zone ASC, queue_position ASC
  `).all(artistId) as Array<{ id: number; queue_zone: string; version: number }>

  db.transaction(() => {
    // audit-a R-7: 分区各自重排 1..n——formal 与 buffer 独立编号，
    // promoteOrder（formal-only MAX+1）不再与 buffer 单位置号重复
    const zoneCounters = new Map<string, number>()
    for (const row of queue) {
      const next = (zoneCounters.get(row.queue_zone) ?? 0) + 1
      zoneCounters.set(row.queue_zone, next)
      // D-1: 批量重排逐条带 version 守卫（队列 SELECT 在同一同步调用内完成，版本必然新鲜）
      updateOrderChecked(row.id, row.version, 'queue_position = ?', next)
    }
  })()
}

// ─── SPEC-004: 名额与缓冲系统 ───

/**
 * 为订单生成付款节点（按订单当前报价生成）
 * 从工作流模板的收款节点生成；仅正式区订单（对齐 createOrder 的生成条件，
 * SPEC-004: 缓冲订单不生成付款节点；promoteOrder 先更新 zone 再调本函数，不受影响）
 * 幂等：已有节点则跳过
 * 调用方：promoteOrder（递补时）、demo-data 脚本（直插订单补分期）
 */
export function generateInstallmentsForOrder(orderId: number): void {
  // 已有节点则跳过（幂等）
  const existing = (db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(orderId) as { c: number }).c
  if (existing > 0) return

  // Order 实体类型未收录 final_price_cents（后加列），SELECT * 已取出，此处补结构断言
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as (Order & { final_price_cents: number | null }) | undefined
  if (!order) return
  if (order.queue_zone !== 'formal') return
  // REQ-025 第二阶段：按当前有效总价生成（final 优先——缓冲期改过价的订单
  // final≠total，节点必须与条目账本 Σ 闭合，否则递补守恒 A1 失败）
  const totalCents = resolvePriceCents(order)
  if (!totalCents) return

  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as WorkflowStage[]
  const paymentStages = stages.filter(s => s.takes_payment && s.basis_points)
  if (paymentStages.length === 0) return

  // REQ-025 第二阶段：走引擎 allocateInitial（末节点吸收舍入尾差——守恒 A1 的前提；
  // 原内联 Math.round 各自取整会产生 ±1~2 分漂移导致守恒断言失败）
  const engineNodes = paymentStages.map((s, i) => ({ sortOrder: i, basisPoints: s.basis_points as number, amountCents: 0 }))
  const amounts = allocateInitial(engineNodes, totalCents)
  const insertInst = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  paymentStages.forEach((stage, i) => {
    insertInst.run(orderId, stage.name, stage.basis_points, amounts[i], i)
  })
}

/**
 * 递补订单：buffer → formal
 * 排到正式队列末尾 + 生成付款节点 + 系统备注
 */
export function promoteOrder(orderId: number, expectedVersion?: number): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)
  if (order.queue_zone !== 'buffer') throw new AppError(E.NOT_BUFFER_ORDER)
  if (['delivered', 'cancelled'].includes(order.status)) throw new AppError(E.ORDER_FINAL_STATE)

  return db.transaction(() => {
    // 正式队列末尾
    const maxPos = db.prepare(
      `SELECT MAX(queue_position) as m FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')`
    ).get(order.artist_id) as { m: number | null } | undefined
    const newPos = (maxPos?.m ?? 0) + 1

    // D-1: 递补是正式位语义变更（zone/position），带版本守卫防旧快照重复递补
    updateOrderChecked(orderId, expectedVersion, "queue_zone = 'formal', queue_position = ?", newPos)

    // 递补后生成付款节点（按下单时报价快照）
    generateInstallmentsForOrder(orderId)

    // 系统备注
    db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
      .run(orderId, '📋 从缓冲区递补到正式排期')

    // REQ-025 R11: 守恒自检（生成节点后 Σ节点价 必须与账本/总价闭合）
    checkOrderConservation(orderId)

    return getOrder(orderId)!
  })()
}

/**
 * 自动递补（auto_promote=1 时，正式区空位后触发）
 * 从缓冲区取最早一单递补，循环直到正式区满或缓冲区空
 */
export function tryAutoPromote(artistId: number): void {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
  if (!artist || !artist.auto_promote || artist.batch_limit == null) return

  const N = artist.batch_limit
  for (;;) {
    const formalCount = (db.prepare(`
      SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')
    `).get(artistId) as { c: number }).c
    if (formalCount >= N) break

    const next = db.prepare(`
      SELECT id FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
      ORDER BY queue_position ASC LIMIT 1
    `).get(artistId) as { id: number } | undefined
    if (!next) break

    try {
      promoteOrder(next.id)
    } catch (err) {
      // audit-a R-1: 自动递补是 best-effort 副作用——单条脏缓冲单守恒校验失败
      // 不得让整个交付/取消事务回滚；记录原因后终止本轮递补（该单仍在 buffer，
      // 继续循环会无限选中同一单，故 break 而非跳过）
      console.error(`[tryAutoPromote] 缓冲单递补失败，跳过本轮：artistId=${artistId}, orderId=${next.id}, reason=${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
}

// ─── 815 拍板 #1：取消 5 秒撤销（窗口存 DB 刷新不丢） ───

export const CANCEL_UNDO_WINDOW_MS = 5_000

interface UndoWindowRow {
  id: number
  order_id: number
  artist_id: number
  prev_status: string
  expires_at: number
  consumed: number
}

/**
 * 带撤销窗口的取消（画师端取消入口）：
 * ① 本次取消自己的队列重排/递补延迟执行（窗口过后由 settleExpiredUndoWindows 结算）——避免撤销前后反复动其他单位置；
 * ② 新取消作废该画师旧窗口（只撤最近一次），被作废窗口立即补结队列（L-10，见下）；
 * ③ 窗口与状态变更同事务，留痕 status_change + undoWindow 标记。
 */
export function cancelOrderWithUndo(orderId: number, confirmPaidCancel: boolean = false, expectedVersion?: number): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)
  // audit-a R-2 同款：已收款取消必须显式确认
  if ((order.paid_total_cents ?? 0) > 0 && !confirmPaidCancel) {
    throw new AppError(E.CANCEL_WITH_PAYMENT, 409, { paidCents: order.paid_total_cents })
  }
  assertStatusTransition(order.status, 'cancelled')

  return db.transaction(() => {
    // 只撤最近一次：作废该画师全部未消费旧窗口（consumed=2 过期结算语义）。
    // L-10（审计批 260830）：作废旧窗口必须补结队列——settleExpiredUndoWindows
    // 只扫 consumed=0，被作废窗口不会再被结算，其订单名额不补就会滞留到下次队列
    // 写操作。先记下受影响画家，作废后统一补 compactQueue + tryAutoPromote。
    const superseded = db.prepare(
      'SELECT DISTINCT artist_id FROM cancel_undo_windows WHERE artist_id = ? AND consumed = 0'
    ).all(order.artist_id) as Array<{ artist_id: number }>
    db.prepare('UPDATE cancel_undo_windows SET consumed = 2 WHERE artist_id = ? AND consumed = 0').run(order.artist_id)

    updateOrderChecked(orderId, expectedVersion, 'status = ?', 'cancelled')
    logActivity(orderId, 'status_change', 'artist', { from: order.status, to: 'cancelled', undoWindow: true })

    db.prepare('INSERT INTO cancel_undo_windows (order_id, artist_id, prev_status, expires_at) VALUES (?, ?, ?, ?)')
      .run(orderId, order.artist_id, order.status, Date.now() + CANCEL_UNDO_WINDOW_MS)

    // L-10（审计批 260830）：被作废旧窗口涉及的画家立即补一次重排 + 递补——
    // 同画家维度即覆盖其全部被作废窗口订单（与 M-2 修法同口径）。
    // 注意：本次取消自己的窗口仍延迟结算（撤销期内不动自己那份队列，原设计不变）
    for (const row of superseded) {
      compactQueue(row.artist_id)
      // SPEC-004: 名额释放后的自动递补一并补上
      tryAutoPromote(row.artist_id)
    }

    return getOrder(orderId)!
  })()
}

/**
 * 撤销取消：窗口未过期且未消费 → 恢复原状态；留痕 cancel_undo；窗口过期/不存在 → 410。
 * 注意（M-2，审计批 260830）：「队列本就没动」的旧前提不成立——取消窗口期内其他订单的
 * 交付/取消会经 updateOrderStatus 触发 compactQueue + tryAutoPromote 全局重排，
 * 复活订单带的旧位次号可能与现存订单撞号，恢复状态后必须补一次重排 + 递补。
 */
export function undoCancelOrder(orderId: number, artistId: number): OrderDetail {
  return db.transaction(() => {
    const order = getOrder(orderId)
    if (!order || order.artist_id !== artistId) throw new AppError(E.ORDER_NOT_FOUND)
    if (order.status !== 'cancelled') {
      throw new AppError(E.INVALID_TRANSITION, 400, { from: order.status, to: '撤销取消' })
    }
    const win = db.prepare(
      'SELECT * FROM cancel_undo_windows WHERE order_id = ? AND consumed = 0 ORDER BY id DESC LIMIT 1'
    ).get(orderId) as UndoWindowRow | undefined
    if (!win || win.expires_at <= Date.now()) {
      throw new AppError(E.CANCEL_UNDO_EXPIRED, 410)
    }

    // 恢复原状态：撤销是回滚操作，不走 STATUS_TRANSITIONS 前向断言（cancelled 无前向出路）；
    // version 不带守卫（窗口同事务新写入，无并发覆盖面）
    updateOrderChecked(orderId, undefined, 'status = ?', win.prev_status)
    db.prepare('UPDATE cancel_undo_windows SET consumed = 1 WHERE id = ?').run(win.id)
    // 留痕：action_type 白名单无 cancel_undo，复用 status_change + undo 标记（避免 CHECK 重建表）
    logActivity(orderId, 'status_change', 'artist', { from: 'cancelled', to: win.prev_status, undo: true })

    // M-2（审计批 260830）：复活订单补一次队列重排 + 递补——窗口期内其他订单可能已
    // 触发全局重排（updateOrderStatus 交付/取消路径），复活的旧位次会与现存订单撞号；
    // 口径与 updateOrderStatus 的队列写路径一致。
    compactQueue(order.artist_id)
    tryAutoPromote(order.artist_id)

    return getOrder(orderId)!
  })()
}

/**
 * 过期窗口结算：标记 consumed=2 + 补执行队列重排/递补。
 * 两个触发点：队列读入口懒清理（传 artistId）与启动时全局扫描（拍板⑥，复用迁移崩溃恢复思路）。
 */
export function settleExpiredUndoWindows(artistId?: number): void {
  const now = Date.now()
  const rows = artistId === undefined
    ? db.prepare('SELECT DISTINCT artist_id FROM cancel_undo_windows WHERE consumed = 0 AND expires_at <= ?').all(now) as Array<{ artist_id: number }>
    : db.prepare('SELECT DISTINCT artist_id FROM cancel_undo_windows WHERE consumed = 0 AND expires_at <= ? AND artist_id = ?').all(now, artistId) as Array<{ artist_id: number }>
  for (const row of rows) {
    db.prepare('UPDATE cancel_undo_windows SET consumed = 2 WHERE artist_id = ? AND consumed = 0 AND expires_at <= ?').run(row.artist_id, now)
    compactQueue(row.artist_id)
    // SPEC-004: 名额释放后的自动递补在窗口过后才发生（撤销期内不动队列）
    tryAutoPromote(row.artist_id)
  }
}
