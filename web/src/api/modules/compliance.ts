// 端点方法 · REQ-042 合规与内容安全端点（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson } from './http'
import type { SubmitReportRequest, SubmitReportResult, ReportItem, ResolveReportResult, RemoveContentResult, BanArtistResult, HomeTakedownResult, HomeRestoreResult, AdminActionsResult } from '../types'
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
    postJson(`/admin/artists/${id}/unban`, { reason: reason ?? null }),
  /** v76 主页内容级下架（不 bump token_version、不拒登录；幂等回 already） */
  homeTakedown: (id: number, reason?: string | null): Promise<HomeTakedownResult> =>
    postJson(`/admin/artists/${id}/home-takedown`, { reason: reason ?? null }),
  /** v76 主页恢复（清空 home_takedown_at/_reason） */
  homeRestore: (id: number, reason?: string | null): Promise<HomeRestoreResult> =>
    postJson(`/admin/artists/${id}/home-restore`, { reason: reason ?? null }),
  /** v76 作品恢复（与 removeContent 成对；下架不物理删，可一键恢复） */
  restoreArtwork: (id: number, reason?: string | null): Promise<HomeRestoreResult> =>
    postJson(`/admin/content/artwork/${id}/restore`, { reason: reason ?? null }),
  /** v75 管理动作留痕查看（?limit&action&targetType&targetId；行内含 admin_ip） */
  getAdminActions: (params?: { limit?: number; action?: string; targetType?: string; targetId?: number }): Promise<AdminActionsResult> =>
    getJson('/admin/admin-actions', { params: params ?? {} }),
  /**
   * R-2 留痕 CSV 导出 URL（含查询串）。
   *
   * 只出 URL 不代发请求：导出走 blob 下载链路（同 ToolsExport / HealthCheck 口径），
   * 要读 Content-Disposition 的文件名、要单独设超时，塞进 JSON 请求核反而不适配。
   * 参数名与列表口逐字一致，筛什么就导什么。
   */
  adminActionsExportUrl: (params?: { action?: string; targetType?: string; targetId?: number; adminId?: number; from?: string; to?: string }): string => {
    const qs = Object.entries(params ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    return `/api/admin/admin-actions/export${qs ? `?${qs}` : ''}`
  }
}
