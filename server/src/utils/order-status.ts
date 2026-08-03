// ============================================
// 订单状态常量（v0.16 技术债清理）
// ============================================

/**
 * SQL 过滤片段 — "活跃订单"条件（非终态）
 * 直接拼入 WHERE 子句，无需额外参数
 */
export const ACTIVE_ORDER_SQL = `status NOT IN ('delivered', 'cancelled')`

/** SQL 过滤片段 — "已完成"条件 */
export const COMPLETED_ORDER_SQL = `status IN ('done', 'delivered')`
