import { randomBytes } from 'crypto'
import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { parseSqliteUtcDate, toLocalDateString } from '../../utils/date.js'

// ============================================
// 业务埋点服务（REQ-033）
// 匿名凭证签发/校验 + 事件落库
// ============================================

/** 凭证有效期：30 天滚动（last_seen_at 更新即续期；查询时 created_at 30 天内有效） */
const ANON_TOKEN_TTL_DAYS = 30

/** P2-10: 单事件扩展 payload 序列化字节上限——防超大 payload 落库造成存储放大 */
const MAX_EVENT_PAYLOAD_BYTES = 2048

/**
 * 事件白名单（只收白名单事件，其余 400——防乱写/刷垃圾事件）
 * 主体为施工图《01-to-03-后端收尾批》§2.2 拍板清单（18 项）；
 * 补充 REQ-033 §3.2（漏斗命名拍板 A：沿用第三方原名）与 §4.2（后台使用率）中
 * 未含在施工图清单内的事件名（5 项），避免前端按 REQ-033 实现时被 400 误拒。
 */
export const EVENT_WHITELIST = [
  // 换色率（REQ-033 §2.1）
  'theme_accent_change',
  // 下单漏斗（REQ-033 §3.2：沿用第三方原名）
  'order_form_start',
  'order_form_step_view',
  'order_form_step_leave',
  'order_form_submit_attempt',
  'order_form_submit_success',
  'order_form_submit_fail',
  'order_form_back',
  'order_form_step_back',
  'order_form_abandon',
  'order_submit_success',
  // 后台功能使用率（REQ-033 §4.1/§4.2）
  'dashboard_view',
  'queue_view',
  'orders_view',
  'manual_view',
  'artworks_view',
  'settings_view',
  'tiers_view',
  'guestbook_view',
  'preferences_view',
  'dashboard_quick_click',
  'artist_page_enter',
  'artist_action'
] as const

export type TrackedEventName = (typeof EVENT_WHITELIST)[number]

/** 上报事件结构（payload 开放扩展，白名单校验在路由层） */
export interface TrackedEvent {
  name: string
  ts: number
  version?: string | number
  [key: string]: unknown
}

/**
 * 签发匿名凭证（32 字节随机串 hex，不可猜测）
 * 不绑定 IP/UA——跨设备稳定标识（REQ-033 §2.2）
 */
export function issueAnonToken(): string {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO anon_tokens (token) VALUES (?)').run(token)
  return token
}

/**
 * 校验匿名凭证：存在且未过期（created_at 30 天内）→ 滚动续期 last_seen_at 并返回 anon_id
 * 不存在/已过期 → null（前端静默重取，不打断用户）
 */
export function resolveAnonToken(token: string): number | null {
  const row = db.prepare(`
    SELECT id FROM anon_tokens
    WHERE token = ? AND created_at > datetime('now', ?)
  `).get(token, `-${ANON_TOKEN_TTL_DAYS} days`) as { id: number } | undefined
  if (!row) return null
  db.prepare("UPDATE anon_tokens SET last_seen_at = datetime('now') WHERE id = ?").run(row.id)
  return row.id
}

/**
 * 批量落库事件（调用方已校验白名单/条数上限/凭证）
 * version 列 SQL 声明 INTEGER（规格），SQLite 动态类型兼容字符串版本号
 * （palette_version 类版本如 'natural-v2' 由调用方放入 payload）
 */
export function insertEvents(events: TrackedEvent[], artistId: number | null, anonId: number | null): number {
  const insert = db.prepare(`
    INSERT INTO events (name, ts, version, artist_id, anon_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  // P2-10: 先全量序列化并校验体积，再统一落库——任一事件超限即整请求 400，
  // 避免前面的合法事件已写入留下半批数据
  const payloadJsonList: string[] = []
  for (const ev of events) {
    const payload: Record<string, unknown> = { ...ev }
    delete payload.name
    delete payload.ts
    delete payload.version
    const payloadJson = JSON.stringify(payload)
    if (payloadJson.length > MAX_EVENT_PAYLOAD_BYTES) {
      throw new AppError(E.INVALID_EVENT_PAYLOAD, 400, { maxBytes: MAX_EVENT_PAYLOAD_BYTES })
    }
    payloadJsonList.push(payloadJson)
  }
  let count = 0
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    insert.run(String(ev.name), Number(ev.ts), ev.version ?? 1, artistId, anonId, payloadJsonList[i])
    count++
  }
  return count
}
// ============================================
// 统计读接口（REQ-033 收尾）
// 管理员全局统计 + 画师自身统计 + 画师门面开关
// ============================================

/** 下单漏斗事件名（顺序 = 漏斗展示顺序；简单版不去重，按事件名取总数） */
const FUNNEL_EVENT_NAMES = [
  'order_form_start',
  'order_form_step_view',
  'order_form_submit_attempt',
  'order_form_submit_success',
  'order_submit_success'
]

/**
 * audit-a P3-15: 服务层兜底钳制 days 到 1..90——
 * 函数导出后未来调用方可能不钳制，模板字符串拼 SQL 存在注入面；参数化绑定 + 钳制双保险
 */
function clampDays(days: number): number {
  const n = Math.trunc(days)
  return Math.min(Math.max(Number.isFinite(n) && n > 0 ? n : 30, 1), 90)
}

/** SQL 小时级聚合行 → 本地日历日分组（90 天最多 2160 行，替代逐行 SELECT） */
interface HourCountRow {
  hour: string
  count: number
}

function byLocalDayFromHourRows(rows: HourCountRow[]): Array<{ day: string; count: number }> {
  const byDayMap = new Map<string, number>()
  for (const r of rows) {
    const day = toLocalDateString(parseSqliteUtcDate(`${r.hour}:00:00`))
    byDayMap.set(day, (byDayMap.get(day) ?? 0) + r.count)
  }
  return [...byDayMap.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * 画师门面统计三态开关（用户 2026-08-07 拍板：关/不显/开，默认不显）
 * - 'on'    ：事件落库 + 画师端统计可见（等价旧 artist_stats_visible=true）
 * - 'hidden'：事件落库 + 画师端统计不可见（等价旧 artist_stats_visible=false，默认）
 * - 'off'   ：事件静默丢弃（不落库）+ 画师端统计不可见（彻底关闭埋点）
 * 双 key 同步：stats_mode 为主，artist_stats_visible 保持同步兼容旧读取方
 */
const STATS_MODE_KEY = 'stats_mode'
const ARTIST_STATS_VISIBLE_KEY = 'artist_stats_visible'

export type StatsMode = 'off' | 'hidden' | 'on'
const STATS_MODE_VALUES: StatsMode[] = ['off', 'hidden', 'on']

export interface TrackingSummary {
  total: number
  byName: Array<{ name: string; count: number }>
  byDay: Array<{ day: string; count: number }>
  funnel: Array<{ name: string; count: number }>
}

export interface ArtistTrackingSummary {
  total: number
  byName: Array<{ name: string; count: number }>
  byDay: Array<{ day: string; count: number }>
}

/**
 * 管理员全局事件统计（近 N 天）
 * days 已由路由层 clamp（1..90），此处直接拼字面量无注入面
 */
export function getTrackingSummary(days: number): TrackingSummary {
  const sinceParam = `-${clampDays(days)} days`
  const total = (db.prepare(`
    SELECT COUNT(*) AS c FROM events WHERE created_at >= datetime('now', ?)
  `).get(sinceParam) as { c: number }).c
  const byName = db.prepare(`
    SELECT name, COUNT(*) AS count FROM events
    WHERE created_at >= datetime('now', ?)
    GROUP BY name ORDER BY count DESC
  `).all(sinceParam) as Array<{ name: string; count: number }>
  // d3 P2: 本地日分组下推到 SQL 小时级聚合（90 天最多 2160 行），JS 只做时区换算——
  // 仍不用 SQLite localtime，避免 C 运行时 TZ 分叉（与 tools/dashboard 口径一致）
  const dayRows = db.prepare(`
    SELECT substr(created_at, 1, 13) AS hour, COUNT(*) AS count
    FROM events
    WHERE created_at >= datetime('now', ?)
    GROUP BY hour
  `).all(sinceParam) as HourCountRow[]
  const byDay = byLocalDayFromHourRows(dayRows)
  const funnelRows = db.prepare(`
    SELECT name, COUNT(*) AS count FROM events
    WHERE created_at >= datetime('now', ?) AND name IN (${FUNNEL_EVENT_NAMES.map(() => '?').join(',')})
    GROUP BY name
  `).all(sinceParam, ...FUNNEL_EVENT_NAMES) as Array<{ name: string; count: number }>
  const countMap = new Map(funnelRows.map(r => [r.name, r.count]))
  const funnel = FUNNEL_EVENT_NAMES.map(name => ({ name, count: countMap.get(name) ?? 0 }))
  return { total, byName, byDay, funnel }
}

/** 画师自己的统计（artist_id 过滤，近 N 天） */
export function getArtistTrackingSummary(artistId: number, days: number): ArtistTrackingSummary {
  const sinceParam = `-${clampDays(days)} days`
  const total = (db.prepare(`
    SELECT COUNT(*) AS c FROM events
    WHERE artist_id = ? AND created_at >= datetime('now', ?)
  `).get(artistId, sinceParam) as { c: number }).c
  const byName = db.prepare(`
    SELECT name, COUNT(*) AS count FROM events
    WHERE artist_id = ? AND created_at >= datetime('now', ?)
    GROUP BY name ORDER BY count DESC
  `).all(artistId, sinceParam) as Array<{ name: string; count: number }>
  // d3 P2: 与管理员 summary 同款小时级聚合（artist_id 过滤）
  const dayRows = db.prepare(`
    SELECT substr(created_at, 1, 13) AS hour, COUNT(*) AS count
    FROM events
    WHERE artist_id = ? AND created_at >= datetime('now', ?)
    GROUP BY hour
  `).all(artistId, sinceParam) as HourCountRow[]
  const byDay = byLocalDayFromHourRows(dayRows)
  return { total, byName, byDay }
}

/**
 * 读取三态开关：stats_mode 优先，回退旧 artist_stats_visible（'true'→on / 'false'→hidden），
 * 都没有则默认 'hidden'（用户拍板：默认不显）
 */
export function getStatsMode(): StatsMode {
  const row = db.prepare('SELECT value FROM platform_config WHERE key = ?').get(STATS_MODE_KEY) as { value: string } | undefined
  if (row && (STATS_MODE_VALUES as string[]).includes(row.value)) return row.value as StatsMode
  const legacy = db.prepare('SELECT value FROM platform_config WHERE key = ?').get(ARTIST_STATS_VISIBLE_KEY) as { value: string } | undefined
  if (legacy) return legacy.value === 'false' ? 'hidden' : 'on'
  return 'hidden'
}

/** 写入三态开关（INSERT OR REPLACE 语义）；同步旧 key 保持向后兼容 */
export function setStatsMode(mode: StatsMode): StatsMode {
  if (!(STATS_MODE_VALUES as string[]).includes(mode)) mode = 'hidden'
  db.prepare('INSERT INTO platform_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(STATS_MODE_KEY, mode)
  db.prepare('INSERT INTO platform_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(ARTIST_STATS_VISIBLE_KEY, mode === 'on' ? 'true' : 'false')
  return mode
}

/**
 * 兼容旧读取方：画师门面统计是否可见（可见 = mode==='on'）
 * 旧语义 artist_stats_visible=false 仅隐藏显示、事件仍收集 → 映射为 hidden，此处返回 false
 */
export function getArtistStatsVisible(): boolean {
  return getStatsMode() === 'on'
}

/** 兼容旧写入方：true→on（可见+收集）；false→hidden（仅隐藏显示，事件仍收集——匹配旧语义） */
export function setArtistStatsVisible(visible: boolean): boolean {
  setStatsMode(visible ? 'on' : 'hidden')
  return visible
}
