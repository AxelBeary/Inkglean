// ============================================
// 价格回退链工具（v0.16 技术债清理）
// 订单金额优先级：final_price_cents → total_price_cents → price_snapshot×100
// ============================================

/**
 * SQL CASE 表达式 — 嵌入 SELECT SUM(...) 中使用
 * 别名前缀固定为 o（所有订单查询均用 o 作 orders 别名）
 */
export const PRICE_FALLBACK_SQL = `CASE
        WHEN o.final_price_cents IS NOT NULL THEN o.final_price_cents
        WHEN o.total_price_cents IS NOT NULL THEN o.total_price_cents
        ELSE COALESCE(o.price_snapshot, 0) * 100
      END`

/**
 * JS 层价格回退 — 从订单行对象解析金额（分）
 * 三级均为 null 时返回 null（未定价订单）
 */
export function resolvePriceCents(order: { final_price_cents?: number | null; total_price_cents?: number | null; price_snapshot?: number | null }): number | null {
  return order.final_price_cents
    ?? order.total_price_cents
    ?? (order.price_snapshot != null ? Math.round(order.price_snapshot * 100) : null)
}
