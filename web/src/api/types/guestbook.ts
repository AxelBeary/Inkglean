// API 边界 DTO · 留言板（公开 + 画师端 + 管理端筛选）（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { SensitiveWarning } from './compliance'

// ─── 留言板（guestbook） ───

/** 公开留言行（camelCase 映射） */
export interface PublicGuestbookMessage {
  id: number
  nickname: string
  content: string
  language: string
  artistReply: string | null
  repliedAt: string | null
  createdAt: string
}

/** GET /public/artist/:subdomain/messages 响应 */
export interface PublicMessagesResult {
  messages: PublicGuestbookMessage[]
  total: number
  page: number
  pageSize: number
}

/** POST /public/artist/:subdomain/messages 请求体 */
export interface PostMessageRequest {
  nickname: string
  content: string
  language?: string
}

/** POST /public/artist/:subdomain/messages 响应（201） */
export interface PostMessageResult {
  id: number | undefined
  /** REQ-042: 敏感词命中提示（不硬拦，先发后审） */
  warning?: SensitiveWarning
}

/** 画师/管理端留言行（snake_case 实体） */
export interface GuestbookMessage {
  id: number
  artist_id: number
  nickname: string
  content: string
  language: string
  status: 'pending' | 'approved' | 'rejected'
  artist_reply: string | null
  replied_at: string | null
  deleted_by_admin: number
  created_at: string
}

/** 管理员留言行（跨画师，附带画师名） */
export type AdminGuestbookMessage = GuestbookMessage & { artist_name: string }

/** 留言审核/回复通用结果 */
export type GuestbookActionResult = GuestbookMessage

export interface SimpleSuccessResult {
  success: true
}

/** GET /admin/messages 筛选（REQ-022 F5；query 序列化后为字符串） */
export interface AdminMessageFilters {
  artistId?: number
  status?: 'pending' | 'approved' | 'rejected'
  replied?: '0' | '1' | 0 | 1
}
