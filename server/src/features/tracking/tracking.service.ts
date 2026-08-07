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