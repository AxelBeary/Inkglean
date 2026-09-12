// 端点方法 · REQ-042 合规与内容安全端点（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson } from './http'
import type { SubmitReportRequest, SubmitReportResult, ReportItem, ResolveReportResult, RemoveContentResult, BanArtistResult } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── REQ-042 合规与内容安全 ───
export const complianceApi = {
  /** 页脚统一举报入口（公开，匿名可提交） */
  submitReport: (data: SubmitReportRequest): Promise<SubmitReportResult> =>
    postJson('/public/reports', data),
  /** 举报列表（管理员；?status=pending|resolved 可选） */
  getReports: (status?: 'pending' | 'resolved'): Promise<ReportItem[]> =>
    getJson('/admin/reports', { params: status ? { status } : {} }),
  /** 标记举报已处理（写 admin_actions 留痕） */
  resolveReport: (id: number, reason?: string | null): Promise<ResolveReportResult> =>
    postJson(`/admin/reports/${id}/resolve`, { reason: reason ?? null }),
  /** 内容下架（artwork/message，写留痕） */
  removeContent: (type: 'artwork' | 'message', id: number, reason?: string | null): Promise<RemoveContentResult> =>
    postJson(`/admin/content/${type}/${id}/remove`, { reason: reason ?? null }),
  /** 封禁画师（is_banned=1 + 踢下线 + 留痕） */
  banArtist: (id: number, reason?: string | null): Promise<BanArtistResult> =>
    postJson(`/admin/artists/${id}/ban`, { reason: reason ?? null }),
  /** 解封画师（is_banned=0 + 留痕） */
  unbanArtist: (id: number, reason?: string | null): Promise<BanArtistResult> =>
    postJson(`/admin/artists/${id}/unban`, { reason: reason ?? null })
}
