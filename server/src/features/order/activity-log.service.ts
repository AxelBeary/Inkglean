import db from '../../db/connection.js'

// ============================================
// 操作日志服务（v0.31 REQ-021 F1）
// 永久保留，不清理。记录订单关键操作。
// ============================================

/** 操作类型枚举 */
export const ACTION_TYPES = [
  'status_change',   // 状态变更
  'price_change',    // 改价
  'extra_item',      // 附加工作项增删
  'payment',         // 收款/撤销
  'stage_advance',   // 节点推进/打回
  'note_update'      // 备注增删
] as const

export type ActionType = typeof ACTION_TYPES[number]

/** 日志行 */
export interface ActivityLog {
  id: number
  order_id: number
  action_type: string
  actor: string
  detail_json: string | null
  created_at: string
}

/**
 * 写入一条操作日志（事务内调用，随主操作一起提交/回滚）
 * detail: 结构化上下文（JSON 序列化存储）
 */
export function logActivity(orderId: number, actionType: ActionType, actor: string, detail?: Record<string, unknown>): void {
  db.prepare(
    'INSERT INTO order_activity_logs (order_id, action_type, actor, detail_json) VALUES (?, ?, ?, ?)'
  ).run(orderId, actionType, actor, detail ? JSON.stringify(detail) : null)
}

/**
 * 查询订单操作日志（分页 + 可选 type 筛选）
 */
export function getOrderLogs(orderId: number, { page = 1, pageSize = 50, type }: { page?: number; pageSize?: number; type?: string } = {}): { logs: ActivityLog[]; total: number; page: number; pageSize: number } {
  let where = 'WHERE order_id = ?'
  const params: Array<string | number> = [orderId]

  if (type && ACTION_TYPES.includes(type as ActionType)) {
    where += ' AND action_type = ?'
    params.push(type)
  }

  const total = (db.prepare(
    `SELECT COUNT(*) as c FROM order_activity_logs ${where}`
  ).get(...params) as { c: number }).c

  const offset = (Math.max(1, page) - 1) * pageSize
  const logs = db.prepare(
    `SELECT * FROM order_activity_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as ActivityLog[]

  // 解析 detail_json 为对象（前端直接用）；d3 P2: 任一行脏 JSON 不得拖垮整页日志，容错置 null
  const parsed = logs.map(l => ({
    ...l,
    detail: l.detail_json ? (() => {
      try { return JSON.parse(l.detail_json) } catch { return null }
    })() : null
  }))

  return { logs: parsed, total, page, pageSize }
}
