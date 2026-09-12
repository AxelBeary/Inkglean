import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { revokeAllDesktopDevices } from '../auth/devices.service.js'
import type { Artist } from '../../types/entities.js'

// ============================================
// 画师服务 - 查找与可见性、登录留痕、就绪判定、会话作废
// （从 artist.service.ts 拆出，F-09 巨型文件清偿；纯搬移，逻辑零变更）
// ============================================

export function getArtistBySubdomain(subdomain: string): Artist | undefined {
  return db.prepare('SELECT * FROM artists WHERE subdomain = ? AND deleted_at IS NULL').get(subdomain) as Artist | undefined
}

/**
 * BUG-3 修复：公开路由可见画师守卫
 * hidden/封禁画师 → 抛 ARTIST_NOT_FOUND 404（对照 artist.routes.ts 公开路由范式）
 * 供 /api/public/* 端点统一使用，防止 hidden 画师未完全隐身
 */
export function requireVisibleArtist(subdomain: string): Artist {
  const artist = getArtistBySubdomain(subdomain)
  if (!artist || (artist as Artist).status === 'hidden' || artist.is_banned) {
    throw new AppError(E.ARTIST_NOT_FOUND, 404)
  }
  return artist
}

export function getArtistByQq(qqNumber: string): Artist | undefined {
  return db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber) as Artist | undefined
}

export function getArtistById(id: number): Artist | undefined {
  // 不过滤 deleted_at — 认证中间件需要找到已删除画师以拒绝其 token
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id) as Artist | undefined
}

export function getAllArtists(): Artist[] {
  // 安全加固批 F1: 显式列——剔除 totp_secret/totp_failed_attempts/totp_locked_until（密钥体系）、
  // token_version/deleted_at（内部）、weibo_url/bilibili_url/platform_urls（历史遗留零引用）。
  // 保留 totp_verified：管理后台画师列表据此显示「绑定/重绑」按钮（ArtistManage.vue）。
  // 保留 quick_actions：画师 profile 消费（Preferences.vue/QuickActions.vue）。
  return db.prepare(`
    SELECT id, qq_number, name, subdomain, avatar, bio, status, contact_qq, notify_enabled, guestbook_enabled,
           created_at, artist_code, template_id, custom_page_path, palette_id,
           dashboard_default_panel, revision_note, custom_links, accent_color,
           order_template_id, inspiration_tags, batch_limit, buffer_limit, auto_promote,
           hide_queue_position, hide_promote_notify, buffer_short_form, announcement,
           announcement_expires_at, monthly_quota, quick_actions, discount_enabled,
           multi_style_enabled, totp_verified, is_banned, last_login_at, last_login_ip
    FROM artists WHERE deleted_at IS NULL AND subdomain != 'system' ORDER BY created_at ASC
  `).all() as Artist[]
}

/**
 * 登录留痕批（v72）：刷新画师上次登录时间 + 来源 IP（每次登录覆盖旧值）。
 * 三个登录口成功后调用：TOTP 登录 / Passkey 登录 / 邀请码首绑确认。
 * 字段仅管理后台展示（publicArtistDTO 默认剔除，不经 /api/auth/me 等口外泄）。
 */
export function recordLastLogin(artistId: number, ip: string): void {
  db.prepare('UPDATE artists SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
    .run(new Date().toISOString(), ip, artistId)
}

/**
 * 开业就绪判定（方案 A，2026-08-21 用户拍板）：
 *  ① 至少 1 张作品（artworks）
 *  ② 至少 1 个启用画风且其下至少 1 个尺寸（art_styles.is_active=1 + style_sizes）
 * 未达标 → 小店不上平台首页目录（GET /api/artists）；直接访问 /artist/:subdomain 不受影响。
 * 目录口径为两条 DISTINCT 聚合取交集，避免逐画师 N+1。
 */
export function getReadyArtistIds(): Set<number> {
  const artworkRows = db.prepare(
    'SELECT DISTINCT artist_id FROM artworks'
  ).all() as Array<{ artist_id: number }>
  const priceRows = db.prepare(`
    SELECT DISTINCT s.artist_id AS artist_id
    FROM art_styles s
    JOIN style_sizes z ON z.art_style_id = s.id
    WHERE s.is_active = 1
  `).all() as Array<{ artist_id: number }>
  const priceSet = new Set(priceRows.map(r => r.artist_id))
  return new Set(artworkRows.map(r => r.artist_id).filter(id => priceSet.has(id)))
}

/** 单画师就绪判定（与开张任务卡 tier 口径共用，防两处漂移） */
export function isArtistReady(artistId: number): boolean {
  const hasArtwork = db.prepare(
    'SELECT id FROM artworks WHERE artist_id = ? LIMIT 1'
  ).get(artistId) !== undefined
  if (!hasArtwork) return false
  return db.prepare(`
    SELECT s.id
    FROM art_styles s
    JOIN style_sizes z ON z.art_style_id = s.id
    WHERE s.artist_id = ? AND s.is_active = 1
    LIMIT 1
  `).get(artistId) !== undefined
}

/**
 * 递增 token_version，使该画师所有已签发的 token 失效
 * 用于：登出、权限变更、管理员强制下线、TOTP 重绑/重置（重置即未绑定态，会话全部作废）
 * REQ-014 桌面记账式会话（v73）：全端踢人=撕光桌面设备账本，不得留活账；
 * 单台踢出走 revokeDesktopDevice（见 devices.service），不经此处。
 */
export function bumpTokenVersion(artistId: number): void {
  db.prepare(
    'UPDATE artists SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
  ).run(artistId)
  revokeAllDesktopDevices(artistId)
}

/**
 * BUG-3 修复：按 artist_id 判断画师是否对公开端点可见
 * hidden/封禁/已删除 → 不可见（对照 requireVisibleArtist 语义）
 * audit-a P2-7: 导出供订单公开路由（track）复用，避免复制隐藏逻辑
 */
export function isArtistVisibleById(artistId: number): boolean {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
  if (!artist || artist.deleted_at) return false
  if (artist.status === 'hidden') return false
  if (artist.is_banned) return false
  return true
}
