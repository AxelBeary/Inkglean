// API 边界 DTO · REQ-042 合规与内容安全（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── REQ-042 合规与内容安全 ───

/** 敏感词提示（作品/留言/主页公告命中；不硬拦） */
export interface SensitiveWarning {
  sensitiveWords: string[]
}

/** 举报目标类型 */
export type ReportTargetType = 'artist_home' | 'artwork' | 'message' | 'other'

/** POST /api/public/reports 请求体 */
export interface SubmitReportRequest {
  targetType: ReportTargetType
  targetId?: number | null
  description: string
  contact?: string | null
}

/** POST /api/public/reports 响应（201） */
export interface SubmitReportResult {
  id: number | undefined
}

/** 举报行（管理端列表） */
export interface ReportItem {
  id: number
  target_type: ReportTargetType
  target_id: number | null
  description: string
  contact: string | null
  status: 'pending' | 'resolved'
  resolved_by: number | null
  resolved_at: string | null
  created_at: string
}

/** POST /api/admin/reports/:id/resolve 响应 */
export interface ResolveReportResult {
  success: boolean
  report: ReportItem
}

/** POST /api/admin/content/:type/:id/remove 响应 */
export interface RemoveContentResult {
  success: boolean
}

/** POST /api/admin/artists/:id/ban | /unban 响应 */
export interface BanArtistResult {
  success: boolean
  isBanned: 0 | 1}
