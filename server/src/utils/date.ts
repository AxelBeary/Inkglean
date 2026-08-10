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
 * Date → 本地时区日期字符串（YYYY-MM-DD）
 * 用于截稿日/开工日交叉校验：用户语义是「本地日历日」，不能拿 UTC 日期直接比
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

/**
 * SQLite UTC datetime 串（'YYYY-MM-DD HH:MM:SS'，CURRENT_TIMESTAMP 口径）→ Date
 * SQLite 的 strftime(...,'localtime') 依赖 C 运行时 TZ，与 JS 的 TZ 环境变量在
 * Windows/容器间行为不一致（vitest TZ=Asia/Shanghai 下实测分叉），故本地日
 * 换算一律走 JS 层：先按 UTC 解析，再取本地日历日。
 */
export function parseSqliteUtcDate(sqliteUtc: string): Date {
  return new Date(sqliteUtc.replace(' ', 'T') + 'Z')
}

/**
 * 本地日期区间 [from, to]（YYYY-MM-DD）→ SQLite UTC 半开窗口 [startUtc, endUtc)
 * 用于 created_at（UTC）按本地日历日过滤：字符串比较即可，无需 SQLite 时区函数
 */
export function localDateRangeToUtc(from: string, to: string): { startUtc: string; endUtcExclusive: string } {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return {
    startUtc: toSqliteDate(new Date(fy, fm - 1, fd)),
    endUtcExclusive: toSqliteDate(new Date(ty, tm - 1, td + 1))
  }
}
