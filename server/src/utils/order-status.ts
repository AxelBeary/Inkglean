// ============================================
// 订单状态常量（v0.16 技术债清理）
// ============================================

/** 终态状态列表 — 订单进入这些状态后不再参与队列/活跃统计 */
export const TERMINAL_STATUSES = ['delivered', 'cancelled'] as const

/**
 * SQL 过滤片段 — "活跃订单"条件（非终态）
 * 直接拼入 WHERE 子句，无需额外参数
 */
export const ACTIVE_ORDER_SQL = `status NOT IN ('delivered', 'cancelled')`

/** 已完成状态列表 — 用于收入/完成数统计 */
export const COMPLETED_STATUSES = ['done', 'delivered'] as const

/** SQL 过滤片段 — "已完成"条件 */
export const COMPLETED_ORDER_SQL = `status IN ('done', 'delivered')`
