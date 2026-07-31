import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { getOrder } from './order.service.js'
import type { WorkflowStage } from '../../types/entities.js'

// ============================================
// 订单流程服务（从 order.service.js 拆出，v0.16）
// 流程节点推进、回退、跟踪启用、进度查询
// ============================================

/**
 * 根据节点位置映射订单状态
 * 规则（SPEC-002 用户确认）：
 *   第 1 个节点 → pending
 *   第 2 个节点且为收款节点 → confirmed
 *   中间节点 → wip
 *   最后一个节点 → done
 */
export function mapStageToStatus(stages: WorkflowStage[], stageId: number): string {
  const idx = stages.findIndex(s => s.id === stageId)
  if (idx === -1) return 'wip'
  if (idx === 0) return 'pending'
  if (idx === stages.length - 1) return 'done'
  if (idx === 1 && stages[idx].takes_payment) return 'confirmed'
  return 'wip'
}

/**
 * 推进流程节点（只能前进）
 * stageId=null 时关闭流程跟踪（回退旧模式）
 */
export function advanceStage(orderId: number, stageId: number | null): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 关闭流程跟踪
  if (stageId === null) {
    db.prepare('UPDATE orders SET current_stage_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(orderId)
    return getOrder(orderId)
  }

  // 校验目标节点属于该画师
  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as WorkflowStage[]
  const targetIdx = stages.findIndex(s => s.id === stageId)
  if (targetIdx === -1) throw new AppError(E.STAGE_NOT_FOUND)

  // 校验只能前进（当前节点在目标之前）
  if (order.current_stage_id !== null) {
    const currentIdx = stages.findIndex(s => s.id === order.current_stage_id)
    if (currentIdx >= targetIdx) {
      throw new AppError(E.INVALID_TRANSITION, 400, { from: stages[currentIdx]?.name, to: stages[targetIdx].name })
    }
  }

  // 不允许从终态推进
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from: order.status, to: stages[targetIdx].name })
  }

  const newStatus = mapStageToStatus(stages, stageId)
  db.prepare('UPDATE orders SET current_stage_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(stageId, newStatus, orderId)

  if (newStatus === 'done') {
    db.prepare('UPDATE orders SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ?')
      .run(orderId)
  }

  return getOrder(orderId)
}

/**
 * 回退流程节点（打回修改）
 * 状态映射为 revision，记录系统备注
 */
export function rollbackStage(orderId: number, stageId: number): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  if (order.current_stage_id === null) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from: '无流程', to: '回退' })
  }

  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as WorkflowStage[]
  const targetIdx = stages.findIndex(s => s.id === stageId)
  const currentIdx = stages.findIndex(s => s.id === order.current_stage_id)

  if (targetIdx === -1) throw new AppError(E.STAGE_NOT_FOUND)
  if (targetIdx >= currentIdx) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from: stages[currentIdx]?.name, to: stages[targetIdx].name })
  }

  // 不允许从终态回退
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from: order.status, to: stages[targetIdx].name })
  }

  const fromName = stages[currentIdx]?.name || '未知'
  const toName = stages[targetIdx].name

  db.prepare('UPDATE orders SET current_stage_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(stageId, 'revision', orderId)

  // 系统备注（用户确认：客户有知情权）
  db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
    .run(orderId, `↩ 从「${fromName}」打回到「${toName}」`)

  return getOrder(orderId)
}

/**
 * 启用流程跟踪（v0.14）
 * 对无工作流订单设 current_stage_id = 画师工作流第一节点，status 保持不变
 * 为什么不能复用 advanceStage：advanceStage 对无跟踪订单会把 status 重置为 pending（状态倒退）
 */
export function enableTracking(orderId: number): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 已有跟踪 → 409
  if (order.current_stage_id !== null) {
    throw new AppError(E.TRACK_ALREADY_ON, 409)
  }

  // 画师无工作流模板 → 400
  const firstStage = db.prepare(
    'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
  ).get(order.artist_id) as { id: number } | undefined
  if (!firstStage) {
    throw new AppError(E.NO_WORKFLOW_TEMPLATE)
  }

  // 只设 current_stage_id，不动 status
  db.prepare('UPDATE orders SET current_stage_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(firstStage.id, orderId)

  return getOrder(orderId)
}

/**
 * 获取订单的流程进度信息（供路由层拼装响应）
 */
export function getStageInfo(order: any): { currentStageId: number; currentStageName: string; stageProgress: { current: number; total: number } } | null {
  if (!order.current_stage_id) return null

  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as WorkflowStage[]
  const currentIdx = stages.findIndex(s => s.id === order.current_stage_id)
  if (currentIdx === -1) return null

  return {
    currentStageId: order.current_stage_id,
    currentStageName: stages[currentIdx].name,
    stageProgress: { current: currentIdx + 1, total: stages.length }
  }
}

// ─── plan-node-speech: 话术变量替换 + 客户沟通数据 ───

/** 截稿日格式化为 X月X日（无则空串） */
function formatDeadline(deadline: string | null): string {
  if (!deadline) return ''
  const d = new Date(deadline.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 金额格式化（分 → ¥X 或 ¥X.XX） */
function formatCentsYuan(cents: number | null): string {
  if (cents == null) return ''
  const yuan = cents / 100
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(2)}`
}

/**
 * 替换话术模板中的 9 个变量
 * 无对应数据时替换为空字符串
 */
export function replaceSpeechVars(template: string | null, order: any, stageName: string | null): string {
  if (!template) return ''

  // 已付金额（paid 分期合计）
  const paidRow = db.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as s FROM order_payment_installments WHERE order_id = ? AND status = 'paid'"
  ).get(order.id) as { s: number } | undefined
  const paidCents = paidRow?.s ?? 0

  const totalCents = order.final_price_cents ?? order.total_price_cents ?? null
  const unpaidCents = totalCents != null ? Math.max(0, totalCents - paidCents) : null

  const vars: Record<string, string> = {
    '{客户名}': order.client_name || '',
    '{客户QQ}': order.client_qq || '',
    '{订单号}': order.order_no || '',
    '{档位名}': order.tier_name || '',
    '{节点名}': stageName || '',
    '{截稿日}': formatDeadline(order.deadline),
    '{总价}': formatCentsYuan(totalCents),
    '{已付}': formatCentsYuan(paidCents),
    '{待付}': formatCentsYuan(unpaidCents)
  }

  let result = template
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(key, val)
  }
  return result
}

/** 话术 + 客户沟通数据返回类型 */
interface SpeechInfoResult {
  clientQq: string | null
  totalPriceCents: number | null
  paidCents: number
  unpaidCents: number | null
  speechText: string | null
}

/**
 * 获取订单的话术 + 客户沟通数据（供订单详情路由拼装）
 * 返回：{ speechText, clientQq, totalPriceCents, paidCents, unpaidCents }
 * 无 current_stage_id 时 speechText 为 null
 */
export function getSpeechInfo(order: any): SpeechInfoResult {
  // 已付金额
  const paidRow = db.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as s FROM order_payment_installments WHERE order_id = ? AND status = 'paid'"
  ).get(order.id) as { s: number } | undefined
  const paidCents = paidRow?.s ?? 0

  const totalCents = order.final_price_cents ?? order.total_price_cents ?? null
  const unpaidCents = totalCents != null ? Math.max(0, totalCents - paidCents) : null

  const base = {
    clientQq: order.client_qq || null,
    totalPriceCents: totalCents,
    paidCents,
    unpaidCents
  }

  // 无流程节点 → 无话术
  if (!order.current_stage_id) {
    return { ...base, speechText: null }
  }

  const stage = db.prepare(
    'SELECT name, speech_template FROM artist_workflow_stages WHERE id = ?'
  ).get(order.current_stage_id) as { name: string; speech_template: string | null } | undefined
  if (!stage) {
    return { ...base, speechText: null }
  }

  const speechText = replaceSpeechVars(stage.speech_template, order, stage.name)
  return { ...base, speechText }
}
