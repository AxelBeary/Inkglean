// 端点方法 · 管理员后台端点（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import { getJson, postJson, putJson, deleteJson } from './http'
import type { PublicArtistDTO, ArtistStatus, Artwork, CommissionRule, AdminGuestbookMessage, SimpleSuccessResult, PlatformDTO, DeletePlatformResult, WorkflowStageDTO, WorkflowResult, SavePaymentResult, DeleteStageResult, DefaultWorkflowNode, GreetingTemplate, SpecialDay, SpecialDayListItem, SpecialDayInput, AddonTemplate, AdminAddonTemplate, AdminAddonTemplateInput, AdminAddonTemplateUpdate, DeleteAdminAddonTemplateResult, AdminOrdersResult, StatsMode, TrackingSummary, TrackingConfig, AdminArtistItem, DeleteArtistResult, DeletedArtistItem, RestoreArtistResult, SystemVersionResult, GlobalStats, TotpBindInitResult, TotpActionResult, TransferAdminResult, RecycleBinResult, EmptyRecycleBinResult, ArtistPricingOverviewItem, HealthResult, SavePaymentNode, GreetingInput, CreateArtistRequest, TransferAdminRequest, PlatformInput, AdminMessageFilters, GenerateInviteCodesRequest, GenerateInviteCodesResult, AdminInviteCodeQuery, AdminInviteCodesResult, InviteCodeUsesResult, RevokeInviteCodeResult, PlatformAnnouncement, SaveAnnouncementRequest } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

// ─── 管理员 ───
export const adminApi = {
  getArtists: (): Promise<AdminArtistItem[]> => getJson('/admin/artists'),
  createArtist: (data: CreateArtistRequest): Promise<PublicArtistDTO> => postJson('/admin/artists', data),
  deleteArtist: (id: number): Promise<DeleteArtistResult> => deleteJson(`/admin/artists/${id}`),
  // 0817：已移除画师清单 + 恢复（软删兜底闭环，用户拍板）
  getDeletedArtists: (): Promise<DeletedArtistItem[]> => getJson('/admin/artists/deleted'),
  restoreArtist: (id: number): Promise<RestoreArtistResult> => postJson(`/admin/artists/${id}/restore`),
  // 0818 方案 A：系统更新检查（只读；force=1 绕过服务端 15 分钟缓存）
  getSystemVersion: (force = false): Promise<SystemVersionResult> =>
    getJson('/admin/system/version', { params: force ? { force: 1 } : {} }),
  // REQ-027: TOTP 绑定/重置
  totpBindInit: (id: number): Promise<TotpBindInitResult> => postJson(`/admin/artists/${id}/totp/bind-init`),
  totpBindConfirm: (id: number, code: string): Promise<TotpActionResult> =>
    postJson(`/admin/artists/${id}/totp/bind-confirm`, { code }),
  totpReset: (id: number): Promise<TotpActionResult> => postJson(`/admin/artists/${id}/totp/reset`),
  getStats: (): Promise<GlobalStats> => getJson('/admin/stats'),
  // 815 第三批 I 路: 系统增项模板（artist_id IS NULL，全画师共用）
  getAddonTemplates: (): Promise<AdminAddonTemplate[]> => getJson('/admin/addon-templates'),
  createAddonTemplate: (data: AdminAddonTemplateInput): Promise<AddonTemplate> =>
    postJson('/admin/addon-templates', data),
  updateAddonTemplate: (id: number, data: AdminAddonTemplateUpdate): Promise<AddonTemplate> =>
    putJson(`/admin/addon-templates/${id}`, data),
  deleteAddonTemplate: (id: number): Promise<DeleteAdminAddonTemplateResult> =>
    deleteJson(`/admin/addon-templates/${id}`),
  getArtistOrders: (id: number): Promise<AdminOrdersResult> => getJson(`/admin/artists/${id}/orders`),
  updateArtistStatus: (id: number, status: ArtistStatus): Promise<PublicArtistDTO> =>
    putJson(`/admin/artists/${id}/status`, { status }),
  transferAdmin: (data: TransferAdminRequest): Promise<TransferAdminResult> => postJson('/admin/transfer', data),
  // 问候语 — 通用库
  getGreetings: (slot?: string): Promise<GreetingTemplate[]> => getJson('/admin/greetings', { params: { slot } }),
  createGreeting: (data: GreetingInput): Promise<GreetingTemplate> => postJson('/admin/greetings', data),
  updateGreeting: (id: number, data: Partial<GreetingInput> & { isEnabled?: boolean }): Promise<GreetingTemplate> => putJson(`/admin/greetings/${id}`, data),
  deleteGreeting: (id: number): Promise<SimpleSuccessResult> => deleteJson(`/admin/greetings/${id}`),
  // 问候语 — 画师专属库
  getArtistGreetings: (artistId: number): Promise<GreetingTemplate[]> => getJson(`/admin/artists/${artistId}/greetings`),
  createArtistGreeting: (artistId: number, data: GreetingInput): Promise<GreetingTemplate> =>
    postJson(`/admin/artists/${artistId}/greetings`, data),
  updateArtistGreeting: (artistId: number, gid: number, data: Partial<GreetingInput> & { isEnabled?: boolean }): Promise<GreetingTemplate> =>
    putJson(`/admin/artists/${artistId}/greetings/${gid}`, data),
  deleteArtistGreeting: (artistId: number, gid: number): Promise<SimpleSuccessResult> =>
    deleteJson(`/admin/artists/${artistId}/greetings/${gid}`),
  // 问候语 — 特别日（E5 波 4）
  getSpecialDays: (): Promise<SpecialDayListItem[]> => getJson('/admin/special-days'),
  createSpecialDay: (data: SpecialDayInput): Promise<SpecialDay> => postJson('/admin/special-days', data),
  updateSpecialDay: (id: number, data: { isEnabled: boolean }): Promise<SpecialDay> =>
    putJson(`/admin/special-days/${id}`, data),
  deleteSpecialDay: (id: number): Promise<SimpleSuccessResult> => deleteJson(`/admin/special-days/${id}`),
  getSpecialDayGreetings: (id: number): Promise<GreetingTemplate[]> => getJson(`/admin/special-days/${id}/greetings`),
  // 流程与比例 — 默认模板
  getDefaultWorkflow: (): Promise<DefaultWorkflowNode[]> => getJson('/admin/default-workflow'),
  updateDefaultWorkflow: (nodes: Array<Record<string, unknown>>): Promise<DefaultWorkflowNode[]> =>
    putJson('/admin/default-workflow', { nodes }),
  resetDefaultWorkflow: (): Promise<DefaultWorkflowNode[]> => postJson('/admin/default-workflow/reset'),
  // 流程与比例 — 画师
  getArtistWorkflow: (artistId: number): Promise<WorkflowResult> => getJson(`/admin/artists/${artistId}/workflow`),
  adminAddStage: (artistId: number, data: { name: string; description?: string | null }): Promise<WorkflowStageDTO | null> =>
    postJson(`/admin/artists/${artistId}/workflow`, data),
  adminUpdateStage: (artistId: number, sid: number, data: { name?: string; description?: string | null; speechTemplate?: string | null; randomTemplate?: boolean }): Promise<WorkflowStageDTO> =>
    putJson(`/admin/artists/${artistId}/workflow/${sid}`, data),
  adminDeleteStage: (artistId: number, sid: number): Promise<DeleteStageResult> =>
    deleteJson(`/admin/artists/${artistId}/workflow/${sid}`),
  adminReorderStages: (artistId: number, orderedIds: number[]): Promise<WorkflowResult> =>
    putJson(`/admin/artists/${artistId}/workflow/reorder`, { orderedIds }),
  adminSavePayment: (artistId: number, nodes: SavePaymentNode[]): Promise<SavePaymentResult> =>
    putJson(`/admin/artists/${artistId}/workflow/payment`, { nodes }),
  // 画师全设置代理
  getArtistProfile: (id: number): Promise<PublicArtistDTO> => getJson(`/admin/artists/${id}/profile`),
  updateArtistProfile: (id: number, data: Record<string, unknown>): Promise<PublicArtistDTO> =>
    putJson(`/admin/artists/${id}/profile`, data),
  // 桌面设备账本（管理端全列，含 device_uuid/last_login_ip；GET 裸数组按最近活跃倒序；单台踢出=撕账，不动网页会话）
  getArtistDevices: (id: number): Promise<import('../types').AdminDesktopDevice[]> => getJson(`/admin/artists/${id}/devices`),
  revokeArtistDevice: (id: number, deviceId: number): Promise<{ success: boolean }> =>
    deleteJson(`/admin/artists/${id}/devices/${deviceId}`),
  // SPEC-PRICE-2 (v50): 旧档位 CRUD 已退役；管理员价格概览（画风/尺寸只读）
  getArtistPricingOverview: (id: number): Promise<ArtistPricingOverviewItem[]> => getJson(`/admin/artists/${id}/pricing-overview`),
  getArtistArtworks: (id: number): Promise<Artwork[]> => getJson(`/admin/artists/${id}/artworks`),
  createArtistArtwork: (id: number, data: Record<string, unknown>): Promise<Artwork> =>
    postJson(`/admin/artists/${id}/artworks`, data),
  deleteArtistArtwork: (id: number, aid: number): Promise<SimpleSuccessResult> =>
    deleteJson(`/admin/artists/${id}/artworks/${aid}`),
  getArtistRules: (id: number): Promise<CommissionRule | null> => getJson(`/admin/artists/${id}/rules`),
  updateArtistRules: (id: number, content: string): Promise<CommissionRule | null> =>
    putJson(`/admin/artists/${id}/rules`, { content }),
  // 回收站（事故修复：孤儿文件可恢复）
  getRecycleBin: ({ page, pageSize }: { page?: number; pageSize?: number } = {}): Promise<RecycleBinResult> =>
    getJson('/admin/recycle-bin', { params: { page, pageSize } }),
  emptyRecycleBin: (): Promise<EmptyRecycleBinResult> => deleteJson('/admin/recycle-bin'),
  // F4: 留言管理（跨画师）；REQ-022 F5: 可选筛选 { artistId, status, replied }
  getMessages: (filters: AdminMessageFilters = {}): Promise<AdminGuestbookMessage[]> =>
    getJson('/admin/messages', { params: filters }),
  deleteMessage: (id: number): Promise<SimpleSuccessResult> => deleteJson(`/admin/messages/${id}`),
  // REQ-022 F2: 社交平台管理（增删改 + 停用/启用）
  getPlatforms: (): Promise<PlatformDTO[]> => getJson('/admin/platforms'),
  createPlatform: (data: PlatformInput): Promise<PlatformDTO> => postJson('/admin/platforms', data),
  updatePlatform: (id: number, data: PlatformInput): Promise<PlatformDTO> => putJson(`/admin/platforms/${id}`, data),
  deletePlatform: (id: number): Promise<DeletePlatformResult> => deleteJson(`/admin/platforms/${id}`),
  // HC: 系统自检
  getHealth: (): Promise<HealthResult> => getJson('/admin/health'),
  // REQ-033 埋点看板
  getTrackingSummary: (days = 30): Promise<TrackingSummary> => getJson('/admin/tracking/summary', { params: { days } }),
  getTrackingConfig: (): Promise<TrackingConfig> => getJson('/admin/tracking-config'),
  setTrackingConfig: (statsMode: StatsMode): Promise<TrackingConfig> => putJson('/admin/tracking-config', { statsMode }),
  /** 820-L: 统计功能管理员总开关（未开则画师后台隐藏整个统计导航，默认关闭） */
  setStatsEnabled: (statsEnabled: boolean): Promise<TrackingConfig> =>
    putJson('/admin/tracking-config', { statsEnabled }),
  // REQ-039: 邀请码管理（生成/列表/吊销）；多次使用码 + 服务端分页/筛选
  generateInviteCodes: (data: GenerateInviteCodesRequest): Promise<GenerateInviteCodesResult> =>
    postJson('/admin/invite-codes', data),
  getInviteCodes: (query: AdminInviteCodeQuery = {}): Promise<AdminInviteCodesResult> =>
    getJson('/admin/invite-codes', { params: query }),
  getInviteCodeUses: (id: number): Promise<InviteCodeUsesResult> =>
    getJson(`/admin/invite-codes/${id}/uses`),
  revokeInviteCode: (id: number): Promise<RevokeInviteCodeResult> => postJson(`/admin/invite-codes/${id}/revoke`),
  // REQ-043 I4: 平台公告编辑（内容消毒入库，step-up 由后端自动挂载）
  saveAnnouncement: (data: SaveAnnouncementRequest): Promise<PlatformAnnouncement> =>
    putJson('/admin/announcement', data)
}
