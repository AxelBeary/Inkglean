import db from '../../db/connection.js'
import * as artistService from '../artist/artist.service.js'
import * as guestbookService from '../guestbook/guestbook.service.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 合规与内容安全服务（REQ-042）
// 举报 / 处理留痕 / 内容下架 / 画师封禁
// 全部动作写 admin_actions（created_at 由 DEFAULT 提供，reason 可选）
// v75（P4 后端批）：留痕与举报各补一列取证 IP（admin_ip / report_ip）
// v76（P4 后端批）：主页内容级下架（home_takedown）——处置阶梯的中间格，不碰账号
// ============================================

/**
 * IP 列入库长度上限：IPv6 完整形态最长 45 字符，钳制只为防超长请求头灌库。
 * 取法一律路由层的 request.ip（CF→Caddy 已在反代层换算真实用户 IP，见 docs/OPS.md §12.1
 * 与 tests/cf-real-ip.test.ts）；后端不得自行读裸 CF-Connecting-IP 头，那东西在链路外可任意伪造。
 */
const IP_COLUMN_MAX = 45

/** 举报行 */
export interface ReportRow {
  id: number
  target_type: 'artist_home' | 'artwork' | 'message' | 'other'
  target_id: number | null
  description: string
  contact: string | null
  status: 'pending' | 'resolved'
  resolved_by: number | null
  resolved_at: string | null
  // v75 取证 IP：举报来源（纠纷取证与防恶意举报）。本表只有 /api/admin/reports* 一条读取路径，
  // 天然只在管理端可见——将来新增举报读取口须防回归（tests/compliance.test.ts 逆泄露断言）
  report_ip: string | null
  created_at: string
}

/** 管理动作留痕行 */
export interface AdminActionRow {
  id: number
  admin_id: number
  action: string
  target_type: string | null
  target_id: number | null
  reason: string | null
  // v75 取证 IP：管理员动作来源（REQ-042 §七 验收 4「留痕记录（时间/IP/原因）」的欠账补齐）
  admin_ip: string | null
  created_at: string
}

/** 留痕查询筛选参数（GET /api/admin/admin-actions 用；targetType 与 targetId 须成对才生效） */
export interface AdminActionFilters {
  limit?: number
  action?: string | null
  targetType?: string | null
  targetId?: number | null
}

/** 新建举报（公开，匿名可提交；contact 可选；reportIp = 路由层 request.ip，v75 取证） */
export function createReport(
  input: {
    targetType: string
    targetId?: number | null
    description: string
    contact?: string | null
    reportIp?: string | null
  }
): ReportRow | undefined {
  const safeContact = sanitizeStoredText(input.contact)
  const result = db.prepare(`
    INSERT INTO reports (target_type, target_id, description, contact, report_ip)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    input.targetType,
    input.targetId ?? null,
    sanitizeStoredText(input.description),
    safeContact.trim() ? safeContact.trim().slice(0, 100) : null,
    // 取不到存 NULL，不写 'unknown' 之类占位串：「没取到」与「取到了什么」在追溯时是两件事
    input.reportIp ? String(input.reportIp).slice(0, IP_COLUMN_MAX) : null
  )
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(result.lastInsertRowid)) as ReportRow | undefined
}

/** 管理员查询举报（status 可选：pending/resolved） */
export function getReports(status?: string): ReportRow[] {
  if (status === 'pending' || status === 'resolved') {
    return db.prepare(
      'SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC, id DESC'
    ).all(status) as ReportRow[]
  }
  return db.prepare('SELECT * FROM reports ORDER BY created_at DESC, id DESC').all() as ReportRow[]
}

/** 标记举报已处理（写留痕；不存在返回 null） */
export function resolveReport(
  reportId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): ReportRow | null {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow | undefined
  if (!report) return null
  db.transaction(() => {
    db.prepare(`
      UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(adminId, reportId)
    writeAdminAction(adminId, 'report_resolve', 'report', reportId, reason, adminIp)
  })()
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow
}

/**
 * 内容下架（type=artwork → v76 置 takedown_at，**行保留可恢复**；
 * type=message → 现有管理员软删除 deleted_by_admin=1）；写留痕
 */
export function removeContent(
  type: 'artwork' | 'message',
  targetId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean; already?: boolean } {
  if (type === 'artwork') {
    // v76 语义变更：artworks 已有 takedown_at / takedown_reason 两列（v76 迁移），平台下架改走
    // artistService.takedownArtwork()（写函数归 C 路，本文件只调用不实现）。
    // 旧注释「最小破坏：artworks 无隐藏字段 → 走现有删除」是 v59 时代的权宜判定，现已不成立：
    // 物理删会把标题/描述/点赞数/档位标注连同「可恢复」一起丢掉，与「下架」语义不符
    // （画师自己删作品仍是物理删——那是用户意图，语义不同，见 artist.routes.ts）。
    const artwork = artistService.getArtworkById(targetId)
    if (!artwork) return { success: false }
    // 幂等（与主页下架同口径）：已下架再点一次不重复记账，否则一笔误双击会在留痕里变成两笔处置
    if (artwork.takedown_at != null) return { success: true, already: true }
    // 下架与留痕成对写：留痕缺失的下架等于「平台做过但查不到」，事务保证不留半截账
    db.transaction(() => {
      artistService.takedownArtwork(targetId, reason ?? null)
      writeAdminAction(adminId, 'content_remove', 'artwork', targetId, reason, adminIp)
    })()
    return { success: true }
  }
  // message：复用现有管理员软删除（deleted_by_admin=1），公开端立即不可见
  const msg = guestbookService.adminDeleteMessage(targetId)
  if (!msg) return { success: false }
  writeAdminAction(adminId, 'content_remove', 'message', targetId, reason, adminIp)
  return { success: true }
}

/**
 * 解除作品下架（v76）：清空 takedown_at / takedown_reason，行回到公开端。
 * 与 removeContent 的 artwork 分支成对，留痕 action = content_restore，target_type = artwork。
 */
export function restoreContent(
  artworkId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean } {
  const artwork = artistService.getArtworkById(artworkId)
  if (!artwork) return { success: false }
  db.transaction(() => {
    artistService.restoreArtwork(artworkId)
    writeAdminAction(adminId, 'content_restore', 'artwork', artworkId, reason, adminIp)
  })()
  return { success: true }
}

/**
 * 主页下架（v76，target_type=artist）：只置 artists.home_takedown_at/_reason。
 * 与封禁的分工：不 bump token_version、不动 is_banned/status —— 画师必须能登进来看到原因并整改。
 * 幂等：已是下架态直接返回 already，**不重复写留痕**（否则同一动作会在账本里长出一片重影）。
 */
export function takedownArtistHome(
  artistId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean; already?: boolean } {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return { success: false }
  if (artist.home_takedown_at != null) return { success: true, already: true }
  db.transaction(() => {
    artistService.setHomeTakedown(artistId, reason ?? null)
    writeAdminAction(adminId, 'home_takedown', 'artist', artistId, reason, adminIp)
  })()
  return { success: true }
}

/** 解除主页下架（v76）：清空两列，不动 status / is_banned（本就 hidden 的保持 hidden）；写留痕 */
export function restoreArtistHome(
  artistId: number,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): { success: boolean } {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return { success: false }
  db.transaction(() => {
    artistService.clearHomeTakedown(artistId)
    writeAdminAction(adminId, 'home_restore', 'artist', artistId, reason, adminIp)
  })()
  return { success: true }
}

/** 封禁/解封（不动 status 三态）；封禁时递增 token_version 强制下线；写留痕 */
export function setArtistBanned(
  artistId: number,
  banned: boolean,
  adminId: number,
  reason?: string | null,
  adminIp?: string | null
): boolean {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return false
  db.transaction(() => {
    db.prepare('UPDATE artists SET is_banned = ? WHERE id = ?').run(banned ? 1 : 0, artistId)
    if (banned) {
      // 封禁即踢下线：旧 token 立即失效（解封后需重新登录）
      artistService.bumpTokenVersion(artistId)
    }
    writeAdminAction(adminId, banned ? 'artist_ban' : 'artist_unban', 'artist', artistId, reason, adminIp)
  })()
  return true
}

/** 写处理留痕（created_at 由表 DEFAULT 提供；adminIp = 路由层 request.ip，v75 取证） */
export function writeAdminAction(
  adminId: number,
  action: string,
  targetType: string,
  targetId: number,
  reason?: string | null,
  adminIp?: string | null
): void {
  const safeReason = sanitizeStoredText(reason)
  db.prepare(`
    INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    adminId,
    action,
    targetType,
    targetId,
    safeReason.trim() ? safeReason.trim().slice(0, 500) : null,
    // 未传 IP → NULL（测试直调等无 HTTP 上下文的路径本就没有来源可记）
    adminIp ? String(adminIp).slice(0, IP_COLUMN_MAX) : null
  )
}

/**
 * 留痕筛选 WHERE 构造（getAdminActions / countAdminActions 共用，保证列表与 total 同口径，
 * 否则截断与计数会错位——同 guestbook 强删那处「COUNT 与列表同口径过滤」的教训）
 */
function buildActionFilter(opts: AdminActionFilters): { where: string; params: Array<string | number> } {
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (opts.action) {
    clauses.push('action = ?')
    params.push(opts.action)
  }
  // targetType 与 targetId 成对才生效：只给 target_type 一列命中不了复合索引 idx_admin_actions_target
  if (opts.targetType && opts.targetId != null) {
    clauses.push('target_type = ? AND target_id = ?')
    params.push(opts.targetType, opts.targetId)
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** 留痕条数上限（管理端审计一次别灌全表） */
const ADMIN_ACTIONS_MAX_LIMIT = 500

/**
 * 查询处理留痕（管理端审计/排查用；时间倒序）
 * 向后兼容：既可按老签名 `getAdminActions(limit)` 传数字，也可传筛选对象
 */
export function getAdminActions(options: number | AdminActionFilters = {}): AdminActionRow[] {
  const opts: AdminActionFilters = typeof options === 'number' ? { limit: options } : options
  const rawLimit = Number.isFinite(opts.limit) ? (opts.limit as number) : 100
  const safeLimit = Math.min(Math.max(rawLimit, 1), ADMIN_ACTIONS_MAX_LIMIT)
  const { where, params } = buildActionFilter(opts)
  return db.prepare(
    `SELECT * FROM admin_actions ${where} ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(...params, safeLimit) as AdminActionRow[]
}

/** 留痕命中总数（同筛选口径、不受 limit 截断；查看入口的 total 用） */
export function countAdminActions(options: AdminActionFilters = {}): number {
  const { where, params } = buildActionFilter(options)
  return (db.prepare(`SELECT COUNT(*) AS c FROM admin_actions ${where}`).get(...params) as { c: number }).c
}
