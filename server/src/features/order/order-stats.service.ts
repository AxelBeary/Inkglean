import db from '../../db/connection.js'
import { PRICE_FALLBACK_SQL } from '../../utils/price.js'
import { ACTIVE_ORDER_SQL, COMPLETED_ORDER_SQL } from '../../utils/order-status.js'
import { toSqliteDate, localDayStartSqlite, localDayEndSqlite, localMonthStartSqlite } from '../../utils/date.js'

// ============================================
// 订单统计服务（从 order.service.js 拆出，v0.16）
// 纯读操作，无写操作，无交叉调用
// ============================================

/** 即将到期订单行 */
interface DeadlineRow {
  id: number
  order_no: string
  client_name: string | null
  deadline: string
  status: string
}

/**
 * 获取即将到期的订单列表（v0.15 R51）
 * deadline 在未来 7 天内 + 状态非终态，按 deadline 升序
 */
export function getUpcomingDeadlines(artistId: number): DeadlineRow[] {
  const now = new Date()
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const nowUTC = toSqliteDate(now)
  const laterUTC = toSqliteDate(sevenDaysLater)

  return db.prepare(`
    SELECT o.id, o.order_no, o.client_name, o.deadline, o.status
    FROM orders o
    WHERE o.artist_id = ?
      AND o.deadline IS NOT NULL
      AND o.deadline >= ?
      AND o.deadline <= ?
      AND o.${ACTIVE_ORDER_SQL}
    ORDER BY o.deadline ASC
  `).all(artistId, nowUTC, laterUTC) as DeadlineRow[]
}

/**
 * 仪表盘统计数据
 * R52: 新增 todayNewOrderCents（今日新增订单金额）+ todayRevenueCents（今日收入）
 */
export function getArtistStats(artistId: number): {
    pendingCount: number
    activeCount: number
    monthRevenue: number
    monthRevenueCents: number
    totalCompleted: number
    todayNewOrderCents: number
    todayNewOrderCount: number
    todayRevenueCents: number
    todayRevenueCount: number
    todayTodoCount: number
  } {
  const pendingCount = (db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND status = 'pending'"
  ).get(artistId) as { c: number }).c
  const activeCount = (db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}`
  ).get(artistId) as { c: number }).c
  // 收入统计 — 使用 completed_at + final_price_cents（回退 total_price_cents，再回退 price_snapshot）
  // 时区修正：在应用层计算本地时区的月初 UTC 时间戳，避免 UTC+8 用户月初订单被算入上月
  const now = new Date()
  const monthStartUTC = localMonthStartSqlite(now)
  const monthRevenue = (db.prepare(`
    SELECT COALESCE(SUM(
      ${PRICE_FALLBACK_SQL}
    ), 0) as total_cents
    FROM orders o
    WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
      AND o.completed_at >= ?
  `).get(artistId, monthStartUTC) as { total_cents: number }).total_cents
  const totalCompleted = (db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND ${COMPLETED_ORDER_SQL}`
  ).get(artistId) as { c: number }).c

  // R52: 今日统计 — 时区处理与月收入一致（本地零点 → UTC 时间戳）
  const dayStartUTC = localDayStartSqlite(now)

  // 今日新增订单金额：created_at >= 今日零点，金额回退链与月收入一致
  const todayNewOrderRow = db.prepare(`
    SELECT COALESCE(SUM(
      ${PRICE_FALLBACK_SQL}
    ), 0) as total_cents, COUNT(*) as cnt
    FROM orders o
    WHERE o.artist_id = ? AND o.created_at >= ?
  `).get(artistId, dayStartUTC) as { total_cents: number; cnt: number }
  const todayNewOrderCents = todayNewOrderRow.total_cents
  const todayNewOrderCount = todayNewOrderRow.cnt

  // 今日收入：completed_at >= 今日零点 且 status IN ('done','delivered')
  const todayRevenueRow = db.prepare(`
    SELECT COALESCE(SUM(
      ${PRICE_FALLBACK_SQL}
    ), 0) as total_cents, COUNT(*) as cnt
    FROM orders o
    WHERE o.artist_id = ? AND o.${COMPLETED_ORDER_SQL}
      AND o.completed_at >= ?
  `).get(artistId, dayStartUTC) as { total_cents: number; cnt: number }
  const todayRevenueCents = todayRevenueRow.total_cents
  const todayRevenueCount = todayRevenueRow.cnt

  // R51: 今日待办 — 今天截稿 + status='pending' + status='revision'（C62 已拍板）
  const dayEndUTC = localDayEndSqlite(now)
  const todayTodoCount = (db.prepare(`
    SELECT COUNT(*) as c FROM orders
    WHERE artist_id = ?
      AND ${ACTIVE_ORDER_SQL}
      AND (
        status IN ('pending', 'revision')
        OR (deadline IS NOT NULL AND deadline >= ? AND deadline < ?)
      )
  `).get(artistId, dayStartUTC, dayEndUTC) as { c: number }).c

  return {
    pendingCount,
    activeCount,
    monthRevenue: monthRevenue / 100,   // 元（REAL），兼容现有 Dashboard.vue
    monthRevenueCents: monthRevenue,    // 分（INTEGER），R8 仪表盘重构时切换
    totalCompleted,
    todayNewOrderCents,                 // R52: 今日新增订单金额（分）
    todayNewOrderCount,                 // R52: 今日新增订单数
    todayRevenueCents,                  // R52: 今日收入金额（分）
    todayRevenueCount,                  // R52: 今日完成订单数
    todayTodoCount                      // R51: 今日待办数
  }
}
