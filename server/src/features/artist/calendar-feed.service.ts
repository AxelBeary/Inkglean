import crypto from 'crypto'
import db from '../../db/connection.js'

// ============================================
// 日历订阅（ICS）服务 — oimimo 吸纳批一（类2：网页端做到更好）
// 原版受单机架构限制仅局域网可用；拾绘为公网服务，一条带私密令牌的链接
// 即可让手机日历（iOS/Android）在任何网络下同步排期与截稿日。
// 令牌即凭证：128bit+ 随机 base64url，泄露可旋转（旧链接立即失效）。
// ============================================

/** 进入日历的订单状态（与看板「进行中」口径一致；done/delivered/cancelled 不进） */
const FEED_ACTIVE_STATUSES = ['pending', 'confirmed', 'wip', 'revision'] as const

interface FeedOrderRow {
  id: number
  order_no: string
  client_name: string | null
  client_qq: string
  status: string
  start_date: string | null
  deadline: string
}

interface FeedArtistRow {
  id: number
  name: string
  calendar_feed_enabled: number
  calendar_feed_token: string | null
}

/** 画师端日历订阅状态 */
export interface CalendarFeedInfo {
  enabled: boolean
  /** 订阅路径（含令牌），前端拼 window.location.origin 即得完整链接；未启用为 null */
  url: string | null
}

/** 生成新订阅令牌（base64url，URL 安全无需转义） */
function generateFeedToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

/** 订阅路径（公开路由 + 令牌查询参数） */
export function feedUrl(subdomain: string, token: string): string {
  return `/api/public/artist/${subdomain}/calendar.ics?token=${token}`
}

/** 读取画师订阅状态（令牌不落响应，只回拼好的 url） */
export function getFeedInfo(artistId: number): CalendarFeedInfo {
  const artist = db.prepare(
    'SELECT subdomain, calendar_feed_enabled, calendar_feed_token FROM artists WHERE id = ?'
  ).get(artistId) as (FeedArtistRow & { subdomain: string }) | undefined
  if (!artist) return { enabled: false, url: null }
  const enabled = !!artist.calendar_feed_enabled && !!artist.calendar_feed_token
  return {
    enabled,
    url: enabled ? feedUrl(artist.subdomain, artist.calendar_feed_token as string) : null
  }
}

/** 开关订阅：首次开启时生成令牌；关闭只落开关不清令牌（重开沿用原链接） */
export function setFeedEnabled(artistId: number, enabled: boolean): CalendarFeedInfo {
  const row = db.prepare('SELECT calendar_feed_token, subdomain FROM artists WHERE id = ?').get(artistId) as
    | { calendar_feed_token: string | null; subdomain: string }
    | undefined
  if (!row) return { enabled: false, url: null }
  if (enabled && !row.calendar_feed_token) {
    db.prepare('UPDATE artists SET calendar_feed_token = ? WHERE id = ?')
      .run(generateFeedToken(), artistId)
  }
  db.prepare('UPDATE artists SET calendar_feed_enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, artistId)
  return getFeedInfo(artistId)
}

/** 旋转令牌：旧链接立即失效（泄露时的止损手段）；未启用时旋转不落开关 */
export function rotateFeedToken(artistId: number): CalendarFeedInfo {
  db.prepare('UPDATE artists SET calendar_feed_token = ? WHERE id = ?')
    .run(generateFeedToken(), artistId)
  return getFeedInfo(artistId)
}

/** 按公开路由口径取可订阅画师（未删除 + 未封禁 + 已启用 + 有令牌），否则 undefined */
export function getFeedArtist(subdomain: string): (FeedArtistRow & { subdomain: string }) | undefined {
  const artist = db.prepare(
    'SELECT id, name, subdomain, calendar_feed_enabled, calendar_feed_token FROM artists WHERE subdomain = ? AND deleted_at IS NULL AND is_banned = 0'
  ).get(subdomain) as (FeedArtistRow & { subdomain: string }) | undefined
  if (!artist || !artist.calendar_feed_enabled || !artist.calendar_feed_token) return undefined
  return artist
}

/** 令牌恒定时间比对（防时序侧信道） */
export function verifyFeedToken(expected: string, provided: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ─── ICS 序列化（RFC 5545 子集：全天事件，无时区依赖） ───

/** RFC 5545 文本转义：反斜杠 / 分号 / 逗号 / 换行 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** 行长折叠：超 75 八位组的行按 CRLF+空格 续行（中文按字节近似放宽为 35 字符） */
function foldLine(line: string): string {
  if (line.length <= 60) return line
  const parts: string[] = []
  let rest = line
  let first = true
  while (rest.length > 0) {
    const limit = first ? 60 : 59
    parts.push((first ? '' : ' ') + rest.slice(0, limit))
    rest = rest.slice(limit)
    first = false
  }
  return parts.join('\r\n')
}

/** 'YYYY-MM-DD...' → 'YYYYMMDD'（只认日期前缀，库里 deadline 可能带时分秒） */
function toIcsDate(dateLike: string): string {
  return dateLike.slice(0, 10).replaceAll('-', '')
}

/** 日期 +1 天（全天事件 DTEND 为排他日） */
function nextDay(dateLike: string): string {
  const d = new Date(`${dateLike.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replaceAll('-', '')
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  wip: '制作中',
  revision: '修改中'
}

/**
 * 生成画师排期日历（ICS 文本）
 * - 有排期开始日：跨日事件（开始日 → 截稿日）
 * - 仅有截稿日：单日「截稿」提醒事件
 */
export function buildIcs(artist: FeedArtistRow, now: Date = new Date()): string {
  const orders = db.prepare(`
    SELECT id, order_no, client_name, client_qq, status, start_date, deadline
    FROM orders
    WHERE artist_id = ? AND deadline IS NOT NULL AND status IN (${FEED_ACTIVE_STATUSES.map(() => '?').join(',')})
    ORDER BY deadline ASC
  `).all(artist.id, ...FEED_ACTIVE_STATUSES) as FeedOrderRow[]

  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Inkglean//Schedule Feed//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeIcsText(`${artist.name} 的排期`)}`)
  ]

  for (const order of orders) {
    const client = order.client_name?.trim() || order.client_qq
    const statusLabel = STATUS_LABEL[order.status] || order.status
    const hasStart = !!order.start_date && order.start_date.slice(0, 10) <= order.deadline.slice(0, 10)
    const dtstart = hasStart ? toIcsDate(order.start_date as string) : toIcsDate(order.deadline)
    const dtend = nextDay(order.deadline)
    const summary = hasStart
      ? `${client}｜${order.order_no}`
      : `截稿｜${client}｜${order.order_no}`

    lines.push(
      'BEGIN:VEVENT',
      `UID:order-${order.id}@inkglean`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      foldLine(`SUMMARY:${escapeIcsText(summary)}`),
      foldLine(`DESCRIPTION:${escapeIcsText(`单号 ${order.order_no} · ${statusLabel} · 截稿 ${order.deadline.slice(0, 10)}`)}`),
      'END:VEVENT'
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
