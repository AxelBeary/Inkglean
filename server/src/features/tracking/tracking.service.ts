import { randomBytes } from 'crypto'
import db from '../../db/connection.js'

// ============================================
// 业务埋点服务（REQ-033）
// 匿名凭证签发/校验 + 事件落库
// ============================================

/** 凭证有效期：30 天滚动（last_seen_at 更新即续期；查询时 created_at 30 天内有效） */
const ANON_TOKEN_TTL_DAYS = 30

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
  let count = 0
  for (const ev of events) {
    const payload: Record<string, unknown> = { ...ev }
    delete payload.name
    delete payload.ts
    delete payload.version
    insert.run(
      String(ev.name),
      Number(ev.ts),
      ev.version ?? 1,
      artistId,
      anonId,
      JSON.stringify(payload)
    )
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

/** 画师门面统计显隐的 platform_config key（默认 true） */
const ARTIST_STATS_VISIBLE_KEY = 'artist_stats_visible'

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
  const since = `datetime('now', '-${days} days')`
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM events WHERE created_at >= ${since}`).get() as { c: number }).c
  const byName = db.prepare(`
    SELECT name, COUNT(*) AS count FROM events
    WHERE created_at >= ${since}
    GROUP BY name ORDER BY count DESC
  `).all() as Array<{ name: string; count: number }>
  const byDay = db.prepare(`
    SELECT date(created_at, 'localtime') AS day, COUNT(*) AS count FROM events
    WHERE created_at >= ${since}
    GROUP BY day ORDER BY day ASC
  `).all() as Array<{ day: string; count: number }>
  const funnelRows = db.prepare(`
    SELECT name, COUNT(*) AS count FROM events
    WHERE created_at >= ${since} AND name IN (${FUNNEL_EVENT_NAMES.map(() => '?').join(',')})
    GROUP BY name
  `).all(...FUNNEL_EVENT_NAMES) as Array<{ name: string; count: number }>
  const countMap = new Map(funnelRows.map(r => [r.name, r.count]))
  const funnel = FUNNEL_EVENT_NAMES.map(name => ({ name, count: countMap.get(name) ?? 0 }))
  return { total, byName, byDay, funnel }
}

/** 画师自己的统计（artist_id 过滤，近 N 天） */
export function getArtistTrackingSummary(artistId: number, days: number): ArtistTrackingSummary {
  const since = `datetime('now', '-${days} days')`
  const total = (db.prepare(`
    SELECT COUNT(*) AS c FROM events
    WHERE artist_id = ? AND created_at >= ${since}
  `).get(artistId) as { c: number }).c
  const byName = db.prepare(`
    SELECT name, COUNT(*) AS count FROM events
    WHERE artist_id = ? AND created_at >= ${since}
    GROUP BY name ORDER BY count DESC
  `).all(artistId) as Array<{ name: string; count: number }>
  const byDay = db.prepare(`
    SELECT date(created_at, 'localtime') AS day, COUNT(*) AS count FROM events
    WHERE artist_id = ? AND created_at >= ${since}
    GROUP BY day ORDER BY day ASC
  `).all(artistId) as Array<{ day: string; count: number }>
  return { total, byName, byDay }
}

/** 管理员开关：画师门面统计显隐（platform_config key=artist_stats_visible，默认 true） */
export function getArtistStatsVisible(): boolean {
  const row = db.prepare(`SELECT value FROM platform_config WHERE key = ?`).get(ARTIST_STATS_VISIBLE_KEY) as { value: string } | undefined
  return row ? row.value !== 'false' : true
}

/** 管理员开关：写入（INSERT OR REPLACE 语义，无则插有则改） */
export function setArtistStatsVisible(visible: boolean): boolean {
  db.prepare(`
    INSERT INTO platform_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(ARTIST_STATS_VISIBLE_KEY, visible ? 'true' : 'false')
  return visible
}