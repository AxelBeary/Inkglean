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

/** v128: 修改记录条（订单详情「修改次数」展示用，口径用户拍板：手动修改与打回均计一次） */
export interface RevisionRecord {
  /** manual=手动点「需修改」（状态转 revision）；rollback=流程节点打回 */
  type: 'manual' | 'rollback'
  at: string
  /** 仅 rollback：打回前/后节点名 */
  fromStage?: string
  toStage?: string
}

/**
 * v128: 从操作流水推导修改记录（不加存储/不动表结构）：
 * 手动路径 = status_change 且 to='revision'（排除取消撤销恢复的 undo 日志）；
 * 打回路径 = stage_advance 且 detail.action='rollback'（rollbackStageTx 不另记 status_change，两路不重叠）。
 * 日志自 v0.31 起存在，更早的历史订单无法追溯，如实计 0。
 */
export function getRevisionRecords(orderId: number): RevisionRecord[] {
  const rows = db.prepare(
    `SELECT action_type, detail_json, created_at FROM order_activity_logs
     WHERE order_id = ? AND action_type IN ('status_change', 'stage_advance')
     ORDER BY id ASC`
  ).all(orderId) as Array<{ action_type: string; detail_json: string | null; created_at: string }>

  const records: RevisionRecord[] = []
  for (const row of rows) {
    let detail: Record<string, unknown> | null = null
    if (row.detail_json) {
      try { detail = JSON.parse(row.detail_json) } catch { detail = null }
    }
    if (!detail) continue
    if (row.action_type === 'status_change') {
      if (detail.to === 'revision' && !detail.undo) {
        records.push({ type: 'manual', at: row.created_at })
      }
    } else if (detail.action === 'rollback') {
      records.push({
        type: 'rollback',
        at: row.created_at,
        fromStage: typeof detail.from === 'string' ? detail.from : '',
        toStage: typeof detail.to === 'string' ? detail.to : ''
      })
    }
  }
  return records
}
