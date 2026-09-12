// 端点方法 · 画师后台端点（profile/作品/折扣/留言/散单/订单/队列/仪表盘/画风增项/工具）（F-09 自 web/src/api/index.ts 按域纯搬移拆分，端点 URL / 请求方法 / 参数名 / 注释一字未改）
// 由 api/index.ts（barrel）再导出，调用方 import 路径不变

import type { AxiosRequestConfig } from 'axios'
import { getJson, postJson, putJson, deleteJson } from './http'
import type { PagedResult, HasMoreResult, PublicArtistDTO, AuthMeResult, Artwork, ArtworkWithTags, ArtworkWithWarning, PublishArtworkResult, SetArtworkTagsResult, DeleteArtworkResult, CommissionRule, GuestbookMessage, SimpleSuccessResult, WorkflowStageDTO, WorkflowResult, SavePaymentResult, DeleteStageResult, GreetingResult, DiscountCode, DiscountCodesResult, ToggleDiscountResult, DeleteDiscountResult, AddonTemplate, DeleteAddonTemplateResult, StyleSize, StyleAddonWithTemplate, ArtStyleWithDetails, SizeAddonOverride, DeletedResult, OrderStatus, OrderPriority, OrderDetail, EnrichedOrderDetail, DeliverResult, ArtistOrderItem, QueueOrderItem, ArtistOrdersResult, OrderLogsResult, PaymentsResult, AddPaymentResult, RefreshSignaturesResult, ArtistStats, CustomerTokenResult, RevenueResult, TodoResult, ScheduleResult, DashboardPrefs, ActivityResult, ArtistTrackingResult, ToolsClientsResult, ToolsClientResult, SaveToolsClientResult, OkResult, ReturningClientsResult, StandaloneIncomesResult, CreateStandaloneIncomeResult, IncomeSummaryResult, ArtistProfileResult, VersionedOptions, UpdateStatusOptions, PublishArtworkRequest, CreateDiscountCodeRequest, UpdateDiscountCodeRequest, CreateManualOrderRequest, AddNoteRequest, ExtraItemRequest, AddReferenceRequest, SetFocusImageRequest, UpdatePriceRequest, AddPaymentRequest, DeliverRequest, SavePaymentNode, AddonTemplateInput, ArtStyleInput, StyleSizeInput, StyleAddonSetItem, SizeOverrideSetItem, SaveToolsClientRequest, CreateStandaloneIncomeRequest, OnboardingState, PlatformAnnouncement } from '../types'
// DTO 类型统一从 '../types'（barrel）按名取用；inline import('../types') 为原 import('./types') 的路径等价改写

/** getAllOrders in-flight 去重槽（同 q 共享一次全量分页循环） */
let allOrdersInflight: { key: string; promise: Promise<ArtistOrderItem[]> } | null = null

// ─── 画师后台 ───
export const artistApi = {
  // G-1（P2-8）: 会话强校验（布局挂载时调用；以服务端 isAdmin 为准修正本地标记）
  getMe: (): Promise<AuthMeResult> => getJson('/auth/me'),
  getProfile: (): Promise<ArtistProfileResult> => getJson('/artist/profile'),
  updateProfile: (data: Record<string, unknown>): Promise<PublicArtistDTO> => putJson('/artist/profile', data),
  // H-3: 桌面端登录设备账本（本人视角清单 + 撕账移除；404 = 设备不存在或已被移除）
  getMyDevices: (): Promise<import('../types').DesktopDevicesResult> => getJson('/artist/devices'),
  revokeMyDevice: (deviceId: number): Promise<{ success: boolean }> => deleteJson(`/artist/devices/${deviceId}`),
  // REQ-022 F1: 发布交付物为作品（delivered 门槛，一图一作品）
  publishArtwork: (orderId: number, data: PublishArtworkRequest): Promise<PublishArtworkResult> =>
    postJson(`/artist/orders/${orderId}/publish-artwork`, data),
  // 作品
  getArtworks: (): Promise<ArtworkWithTags[]> => getJson('/artist/artworks'),
  // v0.42 Step 6: 画师端作品分页（20/页 + el-pagination；封面置顶）
  getArtworksPaged: ({ page = 1, pageSize = 20 }: { page?: number; pageSize?: number } = {}): Promise<HasMoreResult<ArtworkWithTags>> =>
    getJson('/artist/artworks/paged', { params: { page, pageSize } }),
  // REQ-042: 创建作品命中敏感词时响应附 warning（先发后审，不硬拦）
  createArtwork: (data: Record<string, unknown>): Promise<ArtworkWithWarning> => postJson('/artist/artworks', data),
  deleteArtwork: (id: number): Promise<DeleteArtworkResult> => deleteJson(`/artist/artworks/${id}`),
  // v0.35 波3 (REQ-024 F6): 作品编辑（标题/自由描述）+ 档位标注（替换语义）
  updateArtwork: (id: number, data: Record<string, unknown>): Promise<ArtworkWithWarning> => putJson(`/artist/artworks/${id}`, data),
  setArtworkTags: (id: number, sizeIds: number[]): Promise<SetArtworkTagsResult> =>
    putJson(`/artist/artworks/${id}/tags`, { sizeIds }),
  // v0.25 A: 封面图（设为封面 / 取消封面；GET artworks 与公开主页返回 is_cover 字段）
  setArtworkCover: (id: number): Promise<Artwork> => putJson(`/artist/artworks/${id}/cover`),
  unsetArtworkCover: (id: number): Promise<Artwork> => deleteJson(`/artist/artworks/${id}/cover`),
  // v0.31: 封面排序（多封面轮播顺序）
  reorderCovers: (orderedIds: number[]): Promise<Artwork[]> => putJson('/artist/artworks/cover-order', { orderedIds }),
  // v0.31 F3: 折扣码管理
  getDiscountCodes: (): Promise<DiscountCodesResult> => getJson('/artist/discount-codes'),
  toggleDiscount: (enabled: boolean): Promise<ToggleDiscountResult> => putJson('/artist/discount-codes/toggle', { enabled }),
  createDiscountCode: (data: CreateDiscountCodeRequest): Promise<DiscountCode> => postJson('/artist/discount-codes', data),
  updateDiscountCode: (id: number, data: UpdateDiscountCodeRequest): Promise<DiscountCode> =>
    putJson(`/artist/discount-codes/${id}`, data),
  deleteDiscountCode: (id: number): Promise<DeleteDiscountResult> => deleteJson(`/artist/discount-codes/${id}`),
  // 须知
  getRules: (): Promise<CommissionRule | null> => getJson('/artist/rules'),
  // F4: 留言审核
  // G-8（F-2 前端适配）: 扩 page/pageSize 可选参数（后端默认 20，pageSize clamp 1-100）
  getMessages: (params: Record<string, string | number | undefined> = {}): Promise<PagedResult<GuestbookMessage>> =>
    getJson('/artist/messages', { params }),
  approveMessage: (id: number): Promise<GuestbookMessage> => putJson(`/artist/messages/${id}/approve`),
  rejectMessage: (id: number): Promise<SimpleSuccessResult> => putJson(`/artist/messages/${id}/reject`),
  // v130: 批量审核（批准/婉拒，单次上限 500 条与后端 schema 对齐）
  bulkMessages: (action: 'approve' | 'reject', ids: number[]): Promise<{ success: boolean; updated: number }> =>
    postJson('/artist/messages/bulk', { action, ids }),
  replyMessage: (id: number, reply: string): Promise<GuestbookMessage> => putJson(`/artist/messages/${id}/reply`, { reply }),
  updateRules: (content: string): Promise<CommissionRule | null> => putJson('/artist/rules', { content }),
  // 05D-I1: 散单记账（原裸 fetch 收口 → 401 自动登出/15s 超时/i18n 翻译统一走拦截器）
  getStandaloneIncomes: (params: { from?: string; to?: string } = {}): Promise<StandaloneIncomesResult> =>
    getJson('/artist/tools/standalone-incomes', { params }),
  createStandaloneIncome: (data: CreateStandaloneIncomeRequest): Promise<CreateStandaloneIncomeResult> =>
    postJson('/artist/tools/standalone-incomes', data),
  deleteStandaloneIncome: (id: number): Promise<OkResult> => deleteJson(`/artist/tools/standalone-incomes/${id}`),
  // t1 围剿：收入汇总（订单收款+散单，口径与导出 CSV 一致）
  getIncomeSummary: (params: { from: string; to: string }): Promise<IncomeSummaryResult> =>
    getJson('/artist/tools/income-summary', { params }),
  // oimimo 吸纳批四：月度收入趋势（与 income-summary 同源同口径，近 N 月连续补 0）
  getIncomeMonthly: (params: { months?: number } = {}): Promise<import('../types').IncomeMonthlyResult> =>
    getJson('/artist/tools/income-monthly', { params }),
  // oimimo 吸纳补遗：画风收入分布 + 客户消费排名（与 income-monthly 同窗口同口径）
  getIncomeByStyle: (params: { months?: number } = {}): Promise<import('../types').IncomeByStyleResult> =>
    getJson('/artist/tools/income-by-style', { params }),
  getTopClients: (params: { months?: number; limit?: number } = {}): Promise<import('../types').TopClientsResult> =>
    getJson('/artist/tools/top-clients', { params }),
  // 订单
  getOrders: (status: string | undefined, { page, pageSize, q, sort }: { page?: number; pageSize?: number; q?: string; sort?: string } = {}): Promise<ArtistOrdersResult> =>
    getJson('/artist/orders', { params: { status, page, pageSize, q, sort } }),
  // 05D-W1/P1: 拉全量订单（下拉选择用；pageSize 上限 200 循环，订单多时稍慢但可选到任意早期订单）
  getAllOrders: async (q?: string): Promise<ArtistOrderItem[]> => {
    // a3: in-flight 去重——并发触发（组件重挂载/多消费者）共享同一次分页循环，避免重复请求与乱序返回
    const key = q ?? ''
    if (allOrdersInflight && allOrdersInflight.key === key) return allOrdersInflight.promise
    const promise = (async () => {
      const pageSize = 200
      const all: ArtistOrderItem[] = []
      const first = await getJson<ArtistOrdersResult | ArtistOrderItem[]>('/artist/orders', { params: { page: 1, pageSize, q } })
      const firstItems = Array.isArray(first) ? first : first.items
      all.push(...firstItems)
      const totalCount = Array.isArray(first) ? firstItems.length : (first.total ?? firstItems.length)
      const pages = Math.ceil(totalCount / pageSize)
      for (let p = 2; p <= pages; p++) {
        const res = await getJson<ArtistOrdersResult | ArtistOrderItem[]>('/artist/orders', { params: { page: p, pageSize, q } })
        const items = Array.isArray(res) ? res : res.items
        if (items.length) all.push(...items)
      }
      return all
    })().finally(() => {
      if (allOrdersInflight?.key === key) allOrdersInflight = null
    })
    allOrdersInflight = { key, promise }
    return promise
  },
  getQueue: (zone?: string): Promise<QueueOrderItem[]> =>
    getJson('/artist/queue', zone ? { params: { zone } } : undefined),
  getOrder: (id: number): Promise<EnrichedOrderDetail> => getJson(`/artist/orders/${id}`),
  // G-4（D-2 契约衔接）: options 透传幂等键 header（手动录单端点当前忽略，随契约升级自动生效）
  createManualOrder: (data: CreateManualOrderRequest, options: AxiosRequestConfig = {}): Promise<OrderDetail> =>
    postJson('/artist/orders/manual', data, options),
  // R-2: 取消已收款订单需 confirmPaidCancel 确认（Batch A 契约：不带则 409 CANCEL_WITH_PAYMENT）；
  // options 透传为 body 附加字段，既有调用方不传时行为不变
  // D-1（R-5）: options.version 可选——乐观锁版本，旧快照写入后端 409 ORDER_CONFLICT
  updateStatus: (id: number, status: OrderStatus | string, options: UpdateStatusOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/status`, { status, ...options }),
  /** 815 拍板 #1：带 5 秒撤销窗口的取消（队列重排延迟结算），返回含 undoWindowMs */
  cancelOrder: (id: number, options: UpdateStatusOptions = {}): Promise<EnrichedOrderDetail & { undoWindowMs: number }> =>
    postJson(`/artist/orders/${id}/cancel`, { ...options }),
  /** 815 拍板 #1：撤销取消（窗口内；过期 410 CANCEL_UNDO_EXPIRED） */
  undoCancelOrder: (id: number): Promise<EnrichedOrderDetail> =>
    postJson(`/artist/orders/${id}/cancel-undo`),
  updatePriority: (id: number, priority: OrderPriority): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/priority`, { priority }),
  reorderQueue: (orderedIds: number[]): Promise<QueueOrderItem[]> =>
    putJson('/artist/queue/reorder', { orderedIds }),
  addNote: (id: number, data: AddNoteRequest): Promise<EnrichedOrderDetail> => postJson(`/artist/orders/${id}/notes`, data),
  // R46: 备注删除（系统备注后端拒绝 403，带图备注由 GC 清理）
  deleteNote: (id: number, noteId: number): Promise<EnrichedOrderDetail> => deleteJson(`/artist/orders/${id}/notes/${noteId}`),
  // SPEC-003: 附加工作项（添加/删除后返回完整订单，final_price_cents 已重算）
  addExtraItem: (id: number, data: ExtraItemRequest): Promise<EnrichedOrderDetail> =>
    postJson(`/artist/orders/${id}/extra-items`, data),
  deleteExtraItem: (id: number, itemId: number): Promise<EnrichedOrderDetail> =>
    deleteJson(`/artist/orders/${id}/extra-items/${itemId}`),
  // SPEC-004: 递补（buffer → formal，返回完整订单）
  // D-1（R-5）: options.version 可选（递补/交付同为订单写路径）
  promoteOrder: (id: number, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    postJson(`/artist/orders/${id}/promote`, options),
  // F1 围剿：画师补发客户追踪链接（重新生成令牌，旧链接立即失效）
  regenerateCustomerToken: (id: number): Promise<CustomerTokenResult> =>
    postJson(`/artist/orders/${id}/regenerate-token`, {}),
  deliver: (id: number, data: DeliverRequest): Promise<DeliverResult> => postJson(`/artist/orders/${id}/deliver`, data), // data.version 可选
  // 方案 B: 无文件交付（修复工作流订单最后节点交付卡死）
  deliverNoFile: (id: number, options: VersionedOptions = {}): Promise<DeliverResult> =>
    postJson(`/artist/orders/${id}/deliver-no-file`, options),
  /** 815 拍板 #4：画师再许可交付文件下载（清零锁定与防护计数） */
  repermitDeliverable: (id: number, fileId: number): Promise<EnrichedOrderDetail> =>
    postJson(`/artist/orders/${id}/deliverables/${fileId}/repermit`),
  addReference: (id: number, data: AddReferenceRequest): Promise<EnrichedOrderDetail> =>
    postJson(`/artist/orders/${id}/references`, data),
  deleteReference: (id: number, refId: number): Promise<EnrichedOrderDetail> =>
    deleteJson(`/artist/orders/${id}/references/${refId}`),
  // R4: 焦点图（off/small/large）
  setFocusImage: (id: number, data: SetFocusImageRequest): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/focus-image`, data),
  updatePrice: (id: number, data: UpdatePriceRequest): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/price`, data), // data.version 可选
  // B7: 额度池收款（记录/流水/撤销=负数记录）
  getPayments: (id: number): Promise<PaymentsResult> => getJson(`/artist/orders/${id}/payments`),
  // D-2（R-9）: options 透传幂等键 header（同一次提交重试复用同 key）
  addPayment: (id: number, data: AddPaymentRequest, options: AxiosRequestConfig = {}): Promise<AddPaymentResult> =>
    postJson(`/artist/orders/${id}/payments`, data, options),
  // v0.31 REQ-021 F1: 操作日志（分页 + ?type= 筛选）
  getOrderLogs: (id: number, { page = 1, pageSize = 50, type }: { page?: number; pageSize?: number; type?: string } = {}): Promise<OrderLogsResult> =>
    getJson(`/artist/orders/${id}/logs`, { params: { page, pageSize, type } }),
  // R33: 签名 URL 批量刷新（防 15min 过期 403）
  refreshSignatures: (paths: string[]): Promise<RefreshSignaturesResult> => postJson('/artist/refresh-signatures', { paths }),
  // R30d: 流程状态机（推进/打回/关闭跟踪；stageId 为目标节点 ID，SPEC-002 必填）
  // D-1（R-5）: options.version 可选（推进/回退/关跟踪/开跟踪同为订单写路径）
  advanceStage: (id: number, stageId: number, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/stage`, { stageId, ...options }),
  stageBack: (id: number, stageId: number, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/stage-back`, { stageId, ...options }),
  stageOff: (id: number, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/stage`, { stageId: null, ...options }),
  trackOn: (id: number, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/track-on`, options),
  // 统计
  getStats: (): Promise<ArtistStats> => getJson('/artist/stats'),
  // REQ-033 埋点看板：画师自己的事件统计（门面区块，管理员开关控制显隐）
  getMyTrackingSummary: (days = 14): Promise<ArtistTrackingResult> =>
    getJson('/artist/tracking/summary', { params: { days } }),
  // v0.18 仪表盘（收入统计/待办合并列表/最近活动流）
  getDashboardRevenue: (period: string): Promise<RevenueResult> => getJson('/artist/dashboard/revenue', { params: { period } }),
  getDashboardTodo: (): Promise<TodoResult> => getJson('/artist/dashboard/todo'),
  getDashboardActivity: (): Promise<ActivityResult> => getJson('/artist/dashboard/activity'),
  /** 近 7 日排期条（视觉批：排期卷轴数据源） */
  getDashboardSchedule: (): Promise<ScheduleResult> => getJson('/artist/dashboard/schedule'),
  /** 自定义首页批一（v70）：仪表盘布局偏好读写（服务端归一化，坏数据落默认永不报错） */
  getDashboardPrefs: (): Promise<DashboardPrefs> => getJson('/artist/dashboard/prefs'),
  putDashboardPrefs: (prefs: Partial<DashboardPrefs>): Promise<DashboardPrefs> => putJson('/artist/dashboard/prefs', prefs),
  /** 自定义首页批二：可选板块数据源（收入概览/截稿倒计时） */
  getIncomeOverview: (): Promise<import('../types').IncomeOverview> => getJson('/artist/dashboard/income-overview'),
  getDeadlineSoon: (params: { days?: number; limit?: number } = {}): Promise<import('../types').DeadlineSoonResult> =>
    getJson('/artist/dashboard/deadline-soon', { params }),
  // REQ-043 I2: 开张任务卡（后端标记，前端不靠 localStorage）
  getOnboarding: (): Promise<OnboardingState> => getJson('/artist/onboarding'),
  dismissOnboarding: (): Promise<{ dismissed: true }> => postJson('/artist/onboarding/dismiss', {}),
  // REQ-043 I4: 平台公告（零主动打扰，登录态可读）
  getAnnouncement: (): Promise<PlatformAnnouncement | null> => getJson('/artist/announcement'),
  // R51: 截稿日
  getUpcomingDeadlines: (): Promise<import('../types').DeadlineRow[]> => getJson('/artist/orders/upcoming-deadlines'),
  // D-1（R-5）: options.version 可选——时间条拖拽两步 PUT 用响应 version 接力
  updateDeadline: (id: number, deadline: string | null, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/deadline`, { deadline, ...options }),
  // v0.26 B: 开工日
  updateStartDate: (id: number, startDate: string | null, options: VersionedOptions = {}): Promise<EnrichedOrderDetail> =>
    putJson(`/artist/orders/${id}/start-date`, { startDate, ...options }),
  // 问候语
  getGreeting: (): Promise<GreetingResult> => getJson('/artist/greeting'),
  // 流程与比例
  getWorkflow: (): Promise<WorkflowResult> => getJson('/artist/workflow'),
  addStage: (data: { name: string; description?: string | null }): Promise<WorkflowStageDTO | null> => postJson('/artist/workflow', data),
  updateStage: (id: number, data: { name?: string; description?: string | null; speechTemplate?: string | null; randomTemplate?: boolean }): Promise<WorkflowStageDTO> =>
    putJson(`/artist/workflow/${id}`, data),
  deleteStage: (id: number): Promise<DeleteStageResult> => deleteJson(`/artist/workflow/${id}`),
  reorderStages: (orderedIds: number[]): Promise<WorkflowResult> => putJson('/artist/workflow/reorder', { orderedIds }),
  savePayment: (nodes: SavePaymentNode[]): Promise<SavePaymentResult> => putJson('/artist/workflow/payment', { nodes }),
  resetWorkflow: (): Promise<WorkflowResult> => postJson('/artist/workflow/reset'),
  // 增项
  // L0 (v0.36 波1): 旧增项模型六个封装已删（零调用点；后端端点同步删除）
  // SPEC-PRICE-2 (v50): 旧倍率 CRUD 已随 price_multipliers 表清退移除；
  // 用途/加急统一为增项库 category 维度（见 addonTemplate 系列）
  // v0.32 REQ-023 Phase1: 增项库（addon_templates）
  getAddonTemplates: (): Promise<AddonTemplate[]> => getJson('/artist/addon-templates'),
  createAddonTemplate: (data: AddonTemplateInput): Promise<AddonTemplate> => postJson('/artist/addon-templates', data),
  updateAddonTemplate: (id: number, data: Partial<AddonTemplateInput>): Promise<AddonTemplate> =>
    putJson(`/artist/addon-templates/${id}`, data),
  deleteAddonTemplate: (id: number): Promise<DeleteAddonTemplateResult> => deleteJson(`/artist/addon-templates/${id}`),
  // v0.32 REQ-023 Phase1: 画风（art_styles + sizes + addons + overrides）
  getArtStyles: (): Promise<ArtStyleWithDetails[]> => getJson('/artist/art-styles'),
  createArtStyle: (data: ArtStyleInput): Promise<ArtStyleWithDetails> => postJson('/artist/art-styles', data),
  updateArtStyle: (id: number, data: ArtStyleInput): Promise<ArtStyleWithDetails> => putJson(`/artist/art-styles/${id}`, data),
  deleteArtStyle: (id: number): Promise<DeletedResult> => deleteJson(`/artist/art-styles/${id}`),
  createStyleSize: (styleId: number, data: StyleSizeInput): Promise<StyleSize> =>
    postJson(`/artist/art-styles/${styleId}/sizes`, data),
  updateStyleSize: (styleId: number, sizeId: number, data: StyleSizeInput): Promise<StyleSize> =>
    putJson(`/artist/art-styles/${styleId}/sizes/${sizeId}`, data),
  deleteStyleSize: (styleId: number, sizeId: number): Promise<DeletedResult> =>
    deleteJson(`/artist/art-styles/${styleId}/sizes/${sizeId}`),
  setStyleAddons: (styleId: number, items: StyleAddonSetItem[]): Promise<StyleAddonWithTemplate[]> =>
    putJson(`/artist/art-styles/${styleId}/addons`, { items }),
  // SPEC-PRICE-2 (v50): 画风增项解绑（移除=解绑，不动增项库）
  removeStyleAddon: (styleId: number, saId: number): Promise<DeletedResult> =>
    deleteJson(`/artist/art-styles/${styleId}/addons/${saId}`),
  // SPEC-PRICE-2 (v50): 尺寸覆盖只读查询（替代 PUT 空 items 伪装读取）
  getSizeOverrides: (styleId: number, sizeId: number): Promise<SizeAddonOverride[]> =>
    getJson(`/artist/art-styles/${styleId}/sizes/${sizeId}/overrides`),
  setSizeOverrides: (styleId: number, sizeId: number, items: SizeOverrideSetItem[]): Promise<SizeAddonOverride[]> =>
    putJson(`/artist/art-styles/${styleId}/sizes/${sizeId}/overrides`, { items }),
  // REQ-035 批A: 客户标记 + 老客召回（后端 tools.routes.ts 已就绪）
  getToolsClients: (qq?: string): Promise<ToolsClientsResult> => getJson('/artist/tools/clients', { params: { qq } }),
  getToolsClient: (qq: string): Promise<ToolsClientResult> => getJson(`/artist/tools/clients/${qq}`),
  saveToolsClient: (qq: string, data: SaveToolsClientRequest): Promise<SaveToolsClientResult> =>
    putJson(`/artist/tools/clients/${qq}`, data),
  deleteToolsClient: (qq: string): Promise<OkResult> => deleteJson(`/artist/tools/clients/${qq}`),
  getReturningClients: (days: number): Promise<ReturningClientsResult> =>
    getJson('/artist/tools/returning-clients', { params: { days } }),
}
