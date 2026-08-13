import db from '../../db/connection.js'
import { sanitizeStoredText } from '../../shared/sanitize.js'

// ============================================
// 留言板服务（F4）
// ============================================

/** 留言板消息行 */
export interface GuestbookMessage {
  id: number
  artist_id: number
  nickname: string
  content: string
  language: string
  status: string
  artist_reply: string | null
  replied_at: string | null
  deleted_by_admin: number
  created_at: string
}

export function getMessageById(id: number): GuestbookMessage | undefined {
  return db.prepare('SELECT * FROM guestbook_messages WHERE id = ?').get(id) as GuestbookMessage | undefined
}

/** 客户提交留言（默认 pending，v0.31: 后端写入 language） */
export function createMessage(artistId: number, nickname: string, content: string, language: string = 'zh-CN'): GuestbookMessage | undefined {
  // F-5（P3-18）: 留言内容入库前最小清洗（纵深防御，前端 DOMPurify 仍是渲染层主力）
  const safeContent = sanitizeStoredText(content)
  // d2 P2: nickname 与 content 同口径清洗（公开留言列表原样出站，消毒不对称会留下存储型 XSS 升级面）
  const safeNickname = sanitizeStoredText(nickname)
  const result = db.prepare(
    'INSERT INTO guestbook_messages (artist_id, nickname, content, language) VALUES (?, ?, ?, ?)'
  ).run(artistId, safeNickname, safeContent, language)
  return getMessageById(result.lastInsertRowid as number)
}

/** 公开查询：仅 approved 且未被管理员删除，按 created_at DESC 分页；v0.31: 可选 language 过滤 */
export function getPublicMessages(artistId: number, page: number = 1, pageSize: number = 20, language?: string): { messages: GuestbookMessage[]; total: number; page: number; pageSize: number } {
  const offset = (page - 1) * pageSize
  let where = "WHERE artist_id = ? AND status = 'approved' AND deleted_by_admin = 0"
  const params: Array<string | number> = [artistId]
  if (language) {
    where += ' AND language = ?'
    params.push(language)
  }
  const messages = db.prepare(
    `SELECT * FROM guestbook_messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as GuestbookMessage[]
  const total = (db.prepare(
    `SELECT COUNT(*) as c FROM guestbook_messages ${where}`
  ).get(...params) as { c: number }).c
  return { messages, total, page, pageSize }
}

/**
 * 画师查询：自己所有留言（含 pending/rejected/管理员软删），按 created_at DESC 分页
 * F-2（P3-21）: 由全量数组改为分页结构 { items, total, page, pageSize }（对齐公开端分页风格）
 */
export function getArtistMessages(artistId: number, page: number = 1, pageSize: number = 20): { items: GuestbookMessage[]; total: number; page: number; pageSize: number } {
  const offset = (page - 1) * pageSize
  const total = (db.prepare(
    'SELECT COUNT(*) AS c FROM guestbook_messages WHERE artist_id = ?'
  ).get(artistId) as { c: number }).c
  const items = db.prepare(
    'SELECT * FROM guestbook_messages WHERE artist_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?'
  ).all(artistId, pageSize, offset) as GuestbookMessage[]
  return { items, total, page, pageSize }
}

/** 通过留言（归属校验：不匹配返回 null） */
export function approveMessage(artistId: number, messageId: number): GuestbookMessage | null | undefined {
  const msg = getMessageById(messageId)
  if (!msg || msg.artist_id !== artistId) return null
  db.prepare("UPDATE guestbook_messages SET status = 'approved' WHERE id = ?").run(messageId)
  return getMessageById(messageId)
}

/** 拒绝留言（静默，归属校验） */
export function rejectMessage(artistId: number, messageId: number): GuestbookMessage | null | undefined {
  const msg = getMessageById(messageId)
  if (!msg || msg.artist_id !== artistId) return null
  db.prepare("UPDATE guestbook_messages SET status = 'rejected' WHERE id = ?").run(messageId)
  return getMessageById(messageId)
}

/** 画师回复（归属校验） */
export function replyMessage(artistId: number, messageId: number, reply: string): GuestbookMessage | null | undefined {
  const msg = getMessageById(messageId)
  if (!msg || msg.artist_id !== artistId) return null
  // F-5（P3-18）: 回复入库前最小清洗（与留言内容同口径）
  const safeReply = sanitizeStoredText(reply)
  db.prepare(
    'UPDATE guestbook_messages SET artist_reply = ?, replied_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(safeReply, messageId)
  return getMessageById(messageId)
}

/** 管理员强制删除（软删除，不物理删） */
export function adminDeleteMessage(messageId: number): GuestbookMessage | null | undefined {
  const msg = getMessageById(messageId)
  if (!msg) return null
  db.prepare('UPDATE guestbook_messages SET deleted_by_admin = 1 WHERE id = ?').run(messageId)
  return getMessageById(messageId)
}

/** 管理员筛选参数（REQ-022 F5：按画师/审核状态/是否已回复筛选） */
export interface AdminMessageFilters {
  artistId?: number
  status?: string
  replied?: number
}

/** 管理员查询：跨画师全部留言（含 artist_name），按 created_at DESC；可选 artistId/status/replied 筛选 */
export function getAdminMessages(filters: AdminMessageFilters = {}): Array<GuestbookMessage & { artist_name: string | null }> {
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (filters.artistId !== undefined) {
    clauses.push('m.artist_id = ?')
    params.push(filters.artistId)
  }
  if (filters.status) {
    clauses.push('m.status = ?')
    params.push(filters.status)
  }
  if (filters.replied === 1) {
    clauses.push('m.artist_reply IS NOT NULL')
  } else if (filters.replied === 0) {
    clauses.push('m.artist_reply IS NULL')
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`
    SELECT m.*, a.name AS artist_name
    FROM guestbook_messages m
    LEFT JOIN artists a ON m.artist_id = a.id
    ${where}
    ORDER BY m.created_at DESC
  `).all(...params) as Array<GuestbookMessage & { artist_name: string | null }>
}
