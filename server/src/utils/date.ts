// ============================================
// 日期格式化工具（v0.16 技术债清理）
// SQLite 日期比较必须用空格格式 YYYY-MM-DD HH:MM:SS
// ISO 8601 的 T 分隔符会导致字符串比较错误（T > 空格）
// ============================================

/**
 * Date → SQLite 格式字符串（UTC）
 * 例：2026-07-30T14:30:00.000Z → "2026-07-30 14:30:00"
 */
export function toSqliteDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * 本地时区今日零点 → SQLite 格式（UTC 表示）
 * 用于"今日统计"查询，避免 UTC+8 用户零点偏移
 */
export function localDayStartSqlite(now: Date = new Date()): string {
  return toSqliteDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
}

/**
 * 本地时区明日零点 → SQLite 格式（UTC 表示）
 * 用于 deadline < 明日零点 的开区间查询
 */
export function localDayEndSqlite(now: Date = new Date()): string {
  return toSqliteDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
}

/**
 * 本地时区本月一号零点 → SQLite 格式（UTC 表示）
 * 用于月收入统计
 */
export function localMonthStartSqlite(now: Date = new Date()): string {
  return toSqliteDate(new Date(now.getFullYear(), now.getMonth(), 1))
}
