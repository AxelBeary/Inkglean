import db from '../../db/connection.js'
import * as artistService from '../artist/artist.service.js'
import * as guestbookService from '../guestbook/guestbook.service.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 合规与内容安全服务（REQ-042）
// 举报 / 处理留痕 / 内容下架 / 画师封禁
// 全部动作写 admin_actions（created_at 由 DEFAULT 提供，reason 可选）
// ============================================

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
  created_at: string
}

/** 新建举报（公开，匿名可提交；contact 可选） */
export function createReport(
  input: { targetType: string; targetId?: number | null; description: string; contact?: string | null }
): ReportRow | undefined {
  const safeContact = sanitizeStoredText(input.contact)
  const result = db.prepare(`
    INSERT INTO reports (target_type, target_id, description, contact)
    VALUES (?, ?, ?, ?)
  `).run(
    input.targetType,
    input.targetId ?? null,
    sanitizeStoredText(input.description),
    safeContact.trim() ? safeContact.trim().slice(0, 100) : null
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
export function resolveReport(reportId: number, adminId: number, reason?: string | null): ReportRow | null {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow | undefined
  if (!report) return null
  db.transaction(() => {
    db.prepare(`
      UPDATE reports SET status = 'resolved', resolved_by = ?, resolved_at = datetime('now')
      WHERE id = ?
    `).run(adminId, reportId)
    writeAdminAction(adminId, 'report_resolve', 'report', reportId, reason)
  })()
  return db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow
}

/** 内容下架（type=artwork → 现有删除语义；type=message → 现有管理员软删除）；写留痕 */
export function removeContent(
  type: 'artwork' | 'message',
  targetId: number,
  adminId: number,
  reason?: string | null
): { success: boolean } {
  if (type === 'artwork') {
    // 最小破坏：artworks 无隐藏字段 → 走现有删除（物理删），再留痕
    const artwork = artistService.getArtworkById(targetId)
    if (!artwork) return { success: false }
    artistService.deleteArtwork(targetId)
    writeAdminAction(adminId, 'content_remove', 'artwork', targetId, reason)
    return { success: true }
  }
  // message：复用现有管理员软删除（deleted_by_admin=1），公开端立即不可见
  const msg = guestbookService.adminDeleteMessage(targetId)
  if (!msg) return { success: false }
  writeAdminAction(adminId, 'content_remove', 'message', targetId, reason)
  return { success: true }
}

/** 封禁/解封（不动 status 三态）；封禁时递增 token_version 强制下线；写留痕 */
export function setArtistBanned(
  artistId: number,
  banned: boolean,
  adminId: number,
  reason?: string | null
): boolean {
  const artist = artistService.getArtistById(artistId)
  if (!artist) return false
  db.transaction(() => {
    db.prepare('UPDATE artists SET is_banned = ? WHERE id = ?').run(banned ? 1 : 0, artistId)
    if (banned) {
      // 封禁即踢下线：旧 token 立即失效（解封后需重新登录）
      artistService.bumpTokenVersion(artistId)
    }
    writeAdminAction(adminId, banned ? 'artist_ban' : 'artist_unban', 'artist', artistId, reason)
  })()
  return true
}

/** 写处理留痕（created_at 由表 DEFAULT 提供） */
export function writeAdminAction(
  adminId: number,
  action: string,
  targetType: string,
  targetId: number,
  reason?: string | null
): void {
  const safeReason = sanitizeStoredText(reason)
  db.prepare(`
    INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(adminId, action, targetType, targetId, safeReason.trim() ? safeReason.trim().slice(0, 500) : null)
}

/** 查询处理留痕（管理端审计/排查用；时间倒序） */
export function getAdminActions(limit = 100): AdminActionRow[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500)
  return db.prepare(
    'SELECT * FROM admin_actions ORDER BY created_at DESC, id DESC LIMIT ?'
  ).all(safeLimit) as AdminActionRow[]
}
