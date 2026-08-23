import axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { safeRemoveItem, safeSessionSetItem } from '../utils/storage'
import { TOTP_BIND_REQUIRED_NOTICE_KEY } from '../constants/auth'
import type {
  ActivityResult,
  AddNoteRequest,
  AddonTemplate,
  AddonTemplateInput,
  AddPaymentRequest,
  AddPaymentResult,
  AddReferenceRequest,
  AdminAddonTemplate,
  AdminAddonTemplateInput,
  AdminAddonTemplateUpdate,
  AdminArtistItem,
  AdminGuestbookMessage,
  AdminMessageFilters,
  AdminOrdersResult,
  ArtistListItem,
  ArtistOrderItem,
  ArtistOrdersResult,
  ArtistProfileResult,
  ArtistPricingOverviewItem,
  ArtistPublicProfile,
  ArtistStats,
  ArtistStatus,
  ArtistTrackingResult,
  ArtStyleInput,
  ArtStyleWithDetails,
  Artwork,
  ArtworkWithWarning,
  ArtworkWithTags,
  AuthMeResult,
  AuthVerifyResult,
  AdminInviteCodeQuery,
  AdminInviteCodesResult,
  BanArtistResult,
  CommissionRule,
  CreateArtistRequest,
  CreateDiscountCodeRequest,
  CreateManualOrderRequest,
  CreateOrderRequest,
  CreateStandaloneIncomeRequest,
  CreateStandaloneIncomeResult,
  CustomerTokenResult,
  DefaultWorkflowNode,
  DeletedArtistItem,
  DeleteAdminAddonTemplateResult,
  DeleteAddonTemplateResult,
  DeleteArtistResult,
  DeleteArtworkResult,
  DeleteDiscountResult,
  DeletePlatformResult,
  DeleteStageResult,
  DeletedResult,
  DeliverRequest,
  DeliverResult,
  DiscountCode,
  DiscountCodesResult,
  EmptyRecycleBinResult,
  EnrichedOrderDetail,
  ExtraItemRequest,
  GlobalStats,
  GenerateInviteCodesRequest,
  GenerateInviteCodesResult,
  GreetingInput,
  GreetingResult,
  GreetingTemplate,
  GuestbookMessage,
  HasMoreResult,
  HealthResult,
  InviteRegisterRequest,
  SpecialDay,
  SpecialDayInput,
  SpecialDayListItem,
  InviteRegisterResult,
  InviteStatusResult,
  InviteTotpConfirmRequest,
  InviteTotpConfirmResult,
  InviteCodeUsesResult,
  LikeArtworkResult,
  LogoutResult,
  OkResult,
  OnboardingState,
  PlatformAnnouncement,
  OrderCreateResult,
  OrderDeliveryResult,
  OrderDetail,
  OrderLogsResult,
  OrderPriority,
  OrderStatus,
  OrderTrackResult,
  PagedResult,
  PaymentsResult,
  RemoveContentResult,
  ReportItem,
  ResolveReportResult,
  RestoreArtistResult,
  PlatformDTO,
  PlatformInput,
  PostMessageRequest,
  PostMessageResult,
  PublicArtStyle,
  PublicArtistDTO,
  PublicGalleryResult,
  PublicMessagesResult,
  PublicPricingResult,
  PublishArtworkRequest,
  PublishArtworkResult,
  QueueOrderItem,
  RecycleBinResult,
  RefreshSignaturesResult,
  RevokeInviteCodeResult,
  ReturningClientsResult,
  RevenueResult,
  SavePaymentNode,
  SavePaymentResult,
  SaveAnnouncementRequest,
  SaveToolsClientRequest,
  SaveToolsClientResult,
  SetArtworkTagsResult,
  SetFocusImageRequest,
  SimpleSuccessResult,
  SystemVersionResult,
  SizeAddonOverride,
  SizeOverrideSetItem,
  StandaloneIncomesResult,
  IncomeSummaryResult,
  StatsMode,
  StyleAddonSetItem,
  StyleAddonWithTemplate,
  StylePriceResult,
  StyleSize,
  StyleSizeInput,
  SubmitReportRequest,
  SubmitReportResult,
  TodoResult,
  ScheduleResult,
  DashboardPrefs,
  ToggleDiscountResult,
  ToolsClientResult,
  ToolsClientsResult,
  TotpActionResult,
  TotpBindInitResult,
  TrackingConfig,
  TrackingSummary,
  TransferAdminRequest,
  TransferAdminResult,
  UpdateDiscountCodeRequest,
  UpdatePriceRequest,
  UpdateStatusOptions,
  UploadFileResult,
  UploadImageResult,
  ValidateDiscountRequest,
  ValidateDiscountResult,
  VersionedOptions,
  WorkflowResult,
  WorkflowStageDTO
} from './types'

// ============================================
// API 请求封装
// ============================================

const API_TIMEOUT_MS = 15000

const api = axios.create({
  baseURL: '/api',
  timeout: API_TIMEOUT_MS,
  withCredentials: true // 发送 httpOnly cookie
})

/** 后端错误响应体（AppError 统一形状 { code, error, detail }） */
interface ApiErrorBody {
  code?: string
  error?: string
  detail?: Record<string, unknown>
}

/** getAllOrders in-flight 去重槽（同 q 共享一次全量分页循环） */
let allOrdersInflight: { key: string; promise: Promise<ArtistOrderItem[]> } | null = null

/** 错误拦截器抛出的错误对象（附加 status/code，调用方可特判 404 等场景） */
export interface ApiError extends Error {
  status?: number
  code?: string
  detail?: Record<string, unknown>
}

// 响应拦截器：统一错误处理 + i18n 翻译
api.interceptors.response.use(
  res => res.data,
  async (err: AxiosError<ApiErrorBody>) => {
    const data = err.response?.data
    const code = data?.code
    let msg = data?.error || ''

    // REQ-038 补牢（812 用户实测报障）：服务端判未初始化（如 DB 重置/全新部署）而本地缓存仍 setup_initialized=1 时，
    // 路由守卫会信任缓存不跳转，用户卡死在裸 503 报错页。逃逸口：清陈旧缓存并跳开箱向导
    if (err.response?.status === 503 && code === 'SETUP_REQUIRED') {
      safeRemoveItem('setup_initialized')
      try {
        // 动态导入避免循环依赖（router 链依赖本模块）
        const routerMod = await import('../router/index')
        // 815 拍板 #6：向导路由可能已被物理销毁（已初始化后启动移除），逃逸口重新注册回来
        if (!routerMod.default.hasRoute('SetupWizard')) {
          routerMod.default.addRoute(routerMod.SETUP_ROUTE)
        }
        if (routerMod.default.currentRoute.value.name !== 'SetupWizard') {
          routerMod.default.push({ name: 'SetupWizard' })
        }
      } catch { /* 跳转失败不吞错误，继续走下方错误提示链路 */ }
    }

    // 尝试用 i18n 翻译错误码
    if (code) {
      try {
        const { i18n } = await import('../i18n/index')
        const t = i18n.global.t
        const key = `errors.${code}`
        // detail 作为 i18n 命名插值参数（如 STAGES_RESET_BLOCKED 的 {count}）
        const params = data.detail && typeof data.detail === 'object' ? data.detail : undefined
        // 无参数时走单参重载（vue-i18n 类型不接受 undefined 参数；运行语义不变）
        const translated = params ? t(key, params) : t(key)
        // 如果翻译成功（不是返回 key 本身），使用翻译后的消息
        if (translated !== key) {
          msg = translated
          // 如果有 detail，附加上下文
          if (data.detail?.name) msg = `${data.detail.name}：${msg}`
          if (data.detail?.code) msg = `${msg}（${data.detail.code}）`
        }
      } catch (err) {
        // L1: i18n 加载失败，使用原始消息（补 console.warn，避免静默吞错）
        // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 i18n 翻译失败静默吞错
        console.warn('[api] i18n error translation failed, using raw message', err)
      }
    }

    // D3: 无错误码/无 error 字段（网络错误等）时，兜底文案走 i18n 键
    if (!msg) {
      try {
        const { i18n } = await import('../i18n/index')
        msg = i18n.global.t('common.networkError')
      } catch {
        // i18n 加载失败（极端兜底）：退回简单英文文案，避免空白提示
        msg = 'Network error, please try again later'
      }
    }

    // 401 时清除本地认证状态并跳转登录页
    // P1-3 修复：登录相关错误码不触发登出，只提示
    // G-6（衔接批 F-9）: 退役三码 CODE_INVALID/CODE_EXPIRED/CODE_TOO_MANY_ATTEMPTS 已从白名单移除；
    // 保留/新增码与 server/src/shared/errors.ts 现状核对一致（REQ-027 TOTP 登录返回 TOTP_*）
    const LOGIN_CODES = ['QQ_NOT_REGISTERED', 'TOTP_NOT_BOUND', 'TOTP_INVALID', 'TOTP_LOCKED', 'MISSING_CREDENTIALS']
    // REQ-041: STEP_UP_REQUIRED（入口/动作级需二次验证）与 Passkey 认证失败不应踢出登录态——
    // 验证对话框内失败只提示，用户仍可重试；其余 401 维持既有登出语义
    const NO_LOGOUT_CODES = new Set([...LOGIN_CODES, 'STEP_UP_REQUIRED', 'WEBAUTHN_AUTHENTICATION_FAILED', 'WEBAUTHN_CHALLENGE_INVALID'])
    if (err.response?.status === 401 && !(code !== undefined && NO_LOGOUT_CODES.has(code))) {
      // P3-10: 存储禁用时 401 清标记也不得抛错（否则登出软跳转被吞）
      safeRemoveItem('artist_logged_in')
      safeRemoveItem('artist_is_admin')
      // 824: TOTP_BIND_REQUIRED（绑定失效/未完成）必须触发登出，但提示文案要带到登录页——
      // 跳登录页前写非敏感会话旗标，Login.vue 挂载时消费并以醒目样式展示后清除；
      // 已在登录页（如 Passkey 入口）时不写旗标，由调用方就地展示同一文案，避免重复噪音。
      const bindRequired = code === 'TOTP_BIND_REQUIRED'
      // 动态导入以避免循环依赖（store/router 依赖本模块）
      try {
        const { useArtistStore } = await import('../stores/artist')
        const { default: router } = await import('../router/index')
        const store = useArtistStore()
        store.$reset()
        if (router.currentRoute.value.name !== 'ArtistLogin') {
          if (bindRequired) safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
          router.push({ name: 'ArtistLogin' })
        }
      } catch (err) {
        // L1: 兜底硬跳转（保留原行为，补 console.warn 避免静默吞错）
        if (bindRequired) safeSessionSetItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
        // eslint-disable-next-line no-console -- 错误处理兜底日志：避免 401 软跳转失败静默吞错
        console.warn('[api] 401 soft-redirect failed, falling back to hard redirect', err)
        window.location.href = '/login'
      }
    }
    // 05D-I1/E1: 错误对象附加 status/code（调用方可特判 404 等场景），不改变既有错误消息行为
    const wrapped: ApiError = new Error(msg)
    if (err.response?.status) wrapped.status = err.response.status
    if (code) wrapped.code = code
    // 登录页重构（2026-08-10）：附带 detail（如 TOTP_LOCKED 的 remainingLockMs），
    // 调用方可做字段级呈现；纯增量，不影响既有 msg/status/code 行为
    if (data?.detail && typeof data.detail === 'object') wrapped.detail = data.detail
    return Promise.reject(wrapped)
  }
)

// ─── 类型化请求 helper（模块私有） ───
// 响应拦截器已把返回解包为 res.data，axios 默认泛型返回 AxiosResponse<T> 与运行时不符；
// 此处用第二个泛型参数 R=T 在类型层面一次性对齐（本模块唯一的类型处理点，零运行时改动）
function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return api.get<T, T>(url, config)
}
function postJson<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.post<T, T>(url, data, config)
}
function patchJson<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.patch<T, T>(url, data, config)
}
function putJson<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return api.put<T, T>(url, data, config)
}
function deleteJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return api.delete<T, T>(url, config)
}

export default api

// ─── REQ-040: WebAuthn Passkey + TOTP 重绑 ───
export const webauthnApi = {
  registerOptions: (): Promise<import('./types').WebAuthnRegisterOptions> =>
    postJson('/auth/webauthn/register-options'),
  registerVerify: (credential: unknown): Promise<import('./types').WebAuthnRegisterVerifyResult> =>
    postJson('/auth/webauthn/register-verify', credential),
  loginOptions: (qqNumber: string): Promise<import('./types').WebAuthnLoginOptions> =>
    postJson('/auth/webauthn/login-options', { qqNumber }),
  loginVerify: (credential: unknown): Promise<import('./types').WebAuthnLoginVerifyResult> =>
    postJson('/auth/webauthn/login-verify', credential),
  getCredentials: (): Promise<import('./types').WebAuthnCredentialsResult> =>
    getJson('/auth/webauthn/credentials'),
  updateCredential: (id: number, deviceName: string): Promise<import('./types').WebAuthnUpdateCredentialResult> =>
    patchJson(`/auth/webauthn/credentials/${id}`, { deviceName }),
  deleteCredential: (id: number): Promise<{ success: boolean }> =>
    deleteJson(`/auth/webauthn/credentials/${id}`)
}

export const totpRebindApi = {
  /** 战役审计修复：Step1 验证当前码（轻量校验，不发放凭据） */
  verifyCurrent: (code: string): Promise<{ ok: boolean }> =>
    postJson('/auth/totp/verify-current', { code }),
  rebindInit: (): Promise<import('./types').RebindInitResult> =>
    postJson('/auth/totp/rebind-init'),
  rebindConfirm: (data: Record<string, unknown>): Promise<import('./types').RebindConfirmResult> =>
    postJson('/auth/totp/rebind-confirm', data)
}

// ─── oimimo 吸纳批一：日历订阅（ICS）——手机日历同步排期与截稿日 ───
export const calendarFeedApi = {
  get: (): Promise<import('./types').CalendarFeedResult> =>
    getJson('/artist/calendar-feed'),
  setEnabled: (enabled: boolean): Promise<import('./types').CalendarFeedResult> =>
    putJson('/artist/calendar-feed', { enabled }),
  rotate: (): Promise<import('./types').CalendarFeedResult> =>
    postJson('/artist/calendar-feed/rotate')
}

// ─── REQ-041: 管理后台二次验证（会话升级） ───
export const stepUpApi = {
  /** 入口级探测：200=已升级且在 30 分钟窗口内；401 STEP_UP_REQUIRED=需弹验证对话框 */
  status: (): Promise<import('./types').StepUpStatusResult> => getJson('/admin/stepup-status'),
  /** 验证并升级会话（TOTP 或 Passkey 二选一），成功重签 token 覆盖 cookie */
  verify: (data: import('./types').StepUpRequest): Promise<import('./types').StepUpResult> =>
    postJson('/auth/step-up', data)
}

// ─── REQ-039: 邀请码注册（公开） ───
export const inviteApi = {
  status: (): Promise<InviteStatusResult> => getJson('/invite/status'),
  register: (data: InviteRegisterRequest): Promise<InviteRegisterResult> => postJson('/invite/register', data),
  totpConfirm: (data: InviteTotpConfirmRequest): Promise<InviteTotpConfirmResult> => postJson('/invite/totp-confirm', data)
}

// ─── 认证 ───
export const authApi = {
  // REQ-027: QQ 号 + TOTP 动态口令登录（替代旧登录码）
  verify: (qqNumber: string, code: string): Promise<AuthVerifyResult> =>
    postJson('/auth/verify', { qqNumber, code }),
  me: (): Promise<AuthMeResult> => getJson('/auth/me'),
  // H-2 修复：补全登出接口，清除 httpOnly cookie
  logout: (): Promise<LogoutResult> => postJson('/auth/logout')
}

// ─── 画师公开主页 ───
export const artistPublicApi = {
  getAll: (): Promise<ArtistListItem[]> => getJson('/artists'),
  getProfile: (subdomain: string): Promise<ArtistPublicProfile> => getJson(`/artists/${subdomain}`),
  getWorkflow: (subdomain: string): Promise<WorkflowResult> => getJson(`/artists/${subdomain}/workflow`),
  // 价格计算器
  getPricing: (subdomain: string): Promise<PublicPricingResult> => getJson(`/public/pricing/${subdomain}`),
  // v0.31 F3: 折扣码验证（公开，限流 20次/5分钟）
  validateDiscount: (data: ValidateDiscountRequest): Promise<ValidateDiscountResult> =>
    postJson('/public/validate-discount', data),
  // v0.32 REQ-023 Phase2: 多画风公开配置 + 价格计算
  getPublicStyles: (subdomain: string): Promise<PublicArtStyle[]> => getJson(`/public/styles/${subdomain}`),
  calculateStylePrice: (data: import('./types').CalculateStylePriceRequest): Promise<StylePriceResult> =>
    postJson('/public/calculate-style-price', data),
  // v0.35 F6: 画廊专用端点（作品 size_tags/描述 + filterSizes 筛选档位）
  getPublicGallery: (subdomain: string): Promise<PublicGalleryResult> => getJson(`/public/gallery/${subdomain}`),
  // v0.42 Step 6: 公开作品分页（10/页 + 加载更多；封面置顶）
  getPublicArtworksPaged: (artistId: number, { page = 1, pageSize = 10 }: { page?: number; pageSize?: number } = {}): Promise<HasMoreResult<Artwork>> =>
    getJson(`/public/artworks/${artistId}`, { params: { page, pageSize } }),
  // F1: 作品点赞（匿名公开）
  likeArtwork: (id: number): Promise<LikeArtworkResult> => postJson(`/public/artworks/${id}/like`),
  unlikeArtwork: (id: number): Promise<LikeArtworkResult> => deleteJson(`/public/artworks/${id}/like`),
  // F4: 留言板（公开）
  getMessages: (subdomain: string, page = 1, pageSize = 20): Promise<PublicMessagesResult> =>
    getJson(`/public/artist/${subdomain}/messages`, { params: { page, pageSize } }),
  postMessage: (subdomain: string, data: PostMessageRequest): Promise<PostMessageResult> =>
    postJson(`/public/artist/${subdomain}/messages`, data),
  // REQ-022 F2: 社交平台列表（公开，仅启用）
  getPlatforms: (): Promise<PlatformDTO[]> => getJson('/platforms')
}

// ─── 画师后台 ───
export const artistApi = {
  // G-1（P2-8）: 会话强校验（布局挂载时调用；以服务端 isAdmin 为准修正本地标记）
  getMe: (): Promise<AuthMeResult> => getJson('/auth/me'),
  getProfile: (): Promise<ArtistProfileResult> => getJson('/artist/profile'),
  updateProfile: (data: Record<string, unknown>): Promise<PublicArtistDTO> => putJson('/artist/profile', data),
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
  getIncomeMonthly: (params: { months?: number } = {}): Promise<import('./types').IncomeMonthlyResult> =>
    getJson('/artist/tools/income-monthly', { params }),
  // oimimo 吸纳补遗：画风收入分布 + 客户消费排名（与 income-monthly 同窗口同口径）
  getIncomeByStyle: (params: { months?: number } = {}): Promise<import('./types').IncomeByStyleResult> =>
    getJson('/artist/tools/income-by-style', { params }),
  getTopClients: (params: { months?: number; limit?: number } = {}): Promise<import('./types').TopClientsResult> =>
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
  getIncomeOverview: (): Promise<import('./types').IncomeOverview> => getJson('/artist/dashboard/income-overview'),
  getDeadlineSoon: (params: { days?: number; limit?: number } = {}): Promise<import('./types').DeadlineSoonResult> =>
    getJson('/artist/dashboard/deadline-soon', { params }),
  // REQ-043 I2: 开张任务卡（后端标记，前端不靠 localStorage）
  getOnboarding: (): Promise<OnboardingState> => getJson('/artist/onboarding'),
  dismissOnboarding: (): Promise<{ dismissed: true }> => postJson('/artist/onboarding/dismiss', {}),
  // REQ-043 I4: 平台公告（零主动打扰，登录态可读）
  getAnnouncement: (): Promise<PlatformAnnouncement | null> => getJson('/artist/announcement'),
  // R51: 截稿日
  getUpcomingDeadlines: (): Promise<import('./types').DeadlineRow[]> => getJson('/artist/orders/upcoming-deadlines'),
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

// ─── 客户端订单 ───
export const orderApi = {
  // D-2（R-9）: options 透传幂等键 header（同一次提交重试复用同 key）
  create: (data: CreateOrderRequest, options: AxiosRequestConfig = {}): Promise<OrderCreateResult> =>
    postJson('/orders', data, options),
  // F1 围剿：客户访问凭高熵令牌（QQ+订单号弱双因子已退役）
  track: (orderNo: string, token: string): Promise<OrderTrackResult> =>
    getJson(`/orders/track/${orderNo}`, { params: { token } }),
  delivery: (orderNo: string, token: string): Promise<OrderDeliveryResult> =>
    getJson(`/orders/delivery/${orderNo}`, { params: { token } }),
  /** 815 拍板 #4：一次性下载——开始（签发一次性 URL）与确认（完整接收后锁定） */
  deliveryDownloadStart: (orderNo: string, fileId: number, token: string): Promise<{ url: string }> =>
    postJson(`/orders/delivery/${orderNo}/file/${fileId}/download-start?token=${encodeURIComponent(token)}`),
  deliveryDownloadConfirm: (orderNo: string, fileId: number, token: string): Promise<{ locked: boolean }> =>
    postJson(`/orders/delivery/${orderNo}/file/${fileId}/download-confirm?token=${encodeURIComponent(token)}`)
}

// ─── 上传 ───
// P2-#14: 上传请求覆盖 timeout（50MB 交付物在慢速网络需 >15s）
const UPLOAD_TIMEOUT_MS = 120_000

/** 上传专用选项（仅合并调用方 header，如 G-7 的 x-anon-token） */
interface UploadOptions {
  headers?: Record<string, string>
}

export const uploadApi = {
  image: (file: Blob): Promise<UploadImageResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/image', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  // G-7（P2-13 前端侧）: 参考图上传需 x-anon-token（后端 F-10 契约），options 合并调用方 header
  reference: (file: Blob, options: UploadOptions = {}): Promise<UploadImageResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/reference', fd, {
      headers: { 'Content-Type': 'multipart/form-data', ...(options.headers || {}) },
      timeout: UPLOAD_TIMEOUT_MS
    })
  },
  deliverable: (file: Blob): Promise<UploadFileResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/deliverable', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  },
  // R19: 备注附图（需登录，notes/{artistId}/ 目录，签名 URL 返回）
  noteImage: (file: Blob): Promise<UploadFileResult> => {
    const fd = new FormData()
    fd.append('file', file)
    return postJson('/upload/note-image', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: UPLOAD_TIMEOUT_MS })
  }
}

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


