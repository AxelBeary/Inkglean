// ============================================
// API 边界 DTO 类型库（派工C）
// 形状以后端 routes/service 代码为唯一事实源，逐一核对（2026-08-11）
// 命名约定：实体 snake_case 与后端一致；camelCase 为后端显式映射过的形态
// ============================================

// ─── 通用分页 ───

/** 标准分页包裹（guestbook/orders/logs/recycle-bin 等） */
export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** "加载更多"分页包裹（artworks paged：无 page/pageSize，带 hasMore） */
export interface HasMoreResult<T> {
  items: T[]
  total: number
  hasMore: boolean
}

// ─── 认证（auth.routes.ts） ───

/** POST /auth/verify 请求体（REQ-027: QQ 号 + TOTP 动态口令） */
export interface VerifyRequest {
  qqNumber: string
  code: string
}

/** POST /auth/verify 响应 */
export interface AuthVerifyResult {
  isAdmin: boolean
  artist: {
    id: number
    name: string
    subdomain: string
    qqNumber: string
  }
}

/**
 * 对外安全画师 DTO（shared/dto.ts publicArtistDTO）
 * 剔除 totp_secret/token_version/deleted_at/weibo_url/bilibili_url/platform_urls 等敏感列；
 * snake_case 直出（Artist 实体列名），quick_actions 为 JSON 字符串
 */
export interface PublicArtistDTO {
  id: number
  qq_number: string
  name: string
  subdomain: string
  artist_code: string | null
  avatar: string | null
  bio: string | null
  status: ArtistStatus
  contact_qq: string | null
  totp_verified: number
  notify_enabled: number
  /** 820-L（v68）: 留言功能画师手动开关——0=关闭（客户主页隐藏留言板块+暂停接收） */
  guestbook_enabled: number
  template_id: string
  palette_id: string
  custom_page_path: string | null
  dashboard_default_panel: string | null
  revision_note: string | null
  custom_links: string | null
  accent_color: string | null
  inspiration_tags: string | null
  order_template_id: string
  batch_limit: number | null
  buffer_limit: number
  auto_promote: number
  hide_queue_position: number
  hide_promote_notify: number
  buffer_short_form: number
  announcement: string | null
  announcement_expires_at: string | null
  monthly_quota: number | null
  quick_actions: string | null
  discount_enabled: number
  multi_style_enabled: number
  created_at: string
}

/** GET /auth/me、GET /artist/profile 等登录态接口的画师信息基座 */
export type AuthMeResult = PublicArtistDTO & { isAdmin: boolean }

/** POST /auth/logout 响应 */
export interface LogoutResult {
  message: string
}

// ─── 画师公开主页（artist.routes.ts） ───

export type ArtistStatus = 'open' | 'full' | 'break' | 'hidden'

/** 外链项（REQ-022 F2 新结构） */
export interface CustomLink {
  platformId: number | null
  url: string
}

/** GET /artists 列表项（裸数组返回） */
export interface ArtistListItem {
  id: number
  name: string
  subdomain: string
  avatar: string | null
  bio: string | null
  status: ArtistStatus
  customLinks: CustomLink[]
}

/** 月度额度使用情况（S5） */
export interface MonthlyQuotaInfo {
  used: number
  quota: number | null
  remaining: number | null
}

/** 公告（过期由后端过滤，未设置/已过期返回 null） */
export interface Announcement {
  text: string
  expiresAt: string | null
}

/** GET /artists/:subdomain — hidden 状态只返回最小信息（UI-8） */
export interface HiddenArtistProfile {
  id: number
  name: string
  subdomain: string
  status: 'hidden'
}

/** GET /artists/:subdomain — 可见画师完整公开主页 */
export interface VisibleArtistProfile {
  id: number
  name: string
  subdomain: string
  avatar: string | null
  bio: string | null
  status: ArtistStatus
  templateId: string
  paletteId: string
  customLinks: CustomLink[]
  notifyEnabled: boolean
  /** 820-L（v68）: 留言功能开关——false 时客户端隐藏整个留言板块 */
  guestbookEnabled: boolean
  contactQq: string | null
  revisionNote: string | null
  accentColor: string | null
  orderTemplateId: string
  inspirationTags: string[]
  batchLimit: number | null
  bufferLimit: number
  formalCount: number
  bufferCount: number
  slotDisplay: string | null
  /** #54: 额度耗尽时覆盖为 'full'，前端据此显示「已约满」 */
  effectiveStatus: string
  monthlyQuota: number | null
  quotaInfo: MonthlyQuotaInfo | null
  announcement: Announcement | null
  /** SPEC-PRICE-2（v50）：旧档位已清退，恒为空数组（前端过渡兼容） */
  tiers: unknown[]
  artworks: Artwork[]
  rules: string
}

/** GET /artists/:subdomain 响应（hidden 最小形状 | 完整形状） */
export type ArtistPublicProfile = HiddenArtistProfile | VisibleArtistProfile

// ─── 作品（artist.service.ts） ───

export interface Artwork {
  id: number
  artist_id: number
  image_path: string
  title: string | null
  sort_order: number
  like_count: number
  is_cover: number
  description: string | null
  width: number | null
  height: number | null
}

/** 画师端作品行（附带档位标注 ID） */
export type ArtworkWithTags = Artwork & { size_tag_ids: number[] }

/** REQ-042: 作品写路径回显（创建/编辑命中敏感词时附 warning） */
export type ArtworkWithWarning = Artwork & { warning?: SensitiveWarning }

/** POST /artist/orders/:id/publish-artwork 响应（201） */
export interface PublishArtworkResult {
  artworks: Artwork[]
  /** REQ-042: 敏感词命中提示（不硬拦，先发后审） */
  warning?: SensitiveWarning
}

/** PUT /artist/artworks/:id/tags 响应 */
export interface SetArtworkTagsResult {
  sizeIds: number[]
}

/** DELETE /artist/artworks/:id 响应 */
export interface DeleteArtworkResult {
  success: true
}

// ─── 须知 ───

export interface CommissionRule {
  artist_id: number
  content: string
  updated_at: string
}

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

// ─── 社交平台（platform） ───

export interface PlatformDTO {
  id: number
  name: string
  iconKey: string
  fallbackChar: string
  matchDomains: string[]
  sortOrder: number
  enabled: boolean
}

/** DELETE /admin/platforms/:id 响应 */
export interface DeletePlatformResult {
  success: boolean
  reattributed: number
}

// ─── 工作流（workflow.service.ts，camelCase 输出） ───

export interface WorkflowStageDTO {
  id: number
  name: string
  description: string | null
  sortOrder: number
  takesPayment: boolean
  basisPoints: number
  isFinal: boolean
  speechTemplate: string | null
  randomTemplate: boolean
}

/** GET workflow / 公开 workflow 响应 */
export interface WorkflowResult {
  stages: WorkflowStageDTO[]
}

/** PUT workflow/payment 响应（appliesToNewOrdersOnly 仅存量订单有节点时附带） */
export interface SavePaymentResult {
  stages: WorkflowStageDTO[]
  appliesToNewOrdersOnly?: boolean
}

/** 删除节点响应 */
export interface DeleteStageResult {
  success: boolean
}

/** 默认工作流模板行（snake_case） */
export interface DefaultWorkflowNode {
  id: number
  name: string
  description: string | null
  sort_order: number
  takes_payment: number
  basis_points: number
}

// ─── 问候语（greeting.service.ts） ───

export interface GreetingTemplate {
  id: number
  artist_id: number | null
  text: string
  time_slot: string
  is_enabled: number
  /** 关联特别日（E5 波 4）；null=普通时段池文案 */
  special_day_id: number | null
}

/** 特别日行（/admin/special-days） */
export interface SpecialDay {
  id: number
  name: string
  /** 'MM-DD' 年重复日期 */
  date_key: string
  /** null=全平台，否则指定画师 */
  artist_id: number | null
  is_enabled: number
}

/** 特别日列表行（附带关联文案数） */
export interface SpecialDayListItem extends SpecialDay {
  greeting_count: number
}

/** 特别日创建请求 */
export interface SpecialDayInput {
  name: string
  dateKey: string
  artistId?: number | null
}

/** GET /artist/greeting 响应 */
export interface GreetingResult {
  text: string
  slot: string
}

// ─── 折扣码（discount.service.ts） ───

export interface DiscountCode {
  id: number
  artist_id: number
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  enabled: number
  created_at: string
}

/** GET /artist/discount-codes 响应 */
export interface DiscountCodesResult {
  enabled: boolean
  codes: DiscountCode[]
}

/** PUT /artist/discount-codes/toggle 响应 */
export interface ToggleDiscountResult {
  enabled: boolean
}

export interface DeleteDiscountResult {
  deleted: boolean
}

/** POST /public/validate-discount 请求体 */
export interface ValidateDiscountRequest {
  subdomain: string
  code: string
}

/** POST /public/validate-discount 响应（无效时走错误拦截器） */
export interface ValidateDiscountResult {
  valid: true
  discountType: 'percent' | 'fixed'
  discountValue: number
}

// ─── 画风 / 尺寸 / 增项（style.service.ts） ───

/** 公开增项（嵌套于 PublicStyleSize） */
export interface PublicStyleAddon {
  id: number
  addon_template_id: number | null
  name: string
  control_type: string
  price_mode: string
  price: number
  unit_label: string | null
  is_enabled: boolean
  category: string
  max_quantity: number | null
}

/** 公开尺寸（v0.37 带图/描述/天数） */
export interface PublicStyleSize {
  id: number
  name: string
  base_price: number
  sort_order: number
  image: string | null
  image_artwork_id: number | null
  artwork_image_path: string | null
  description: string | null
  work_days: number | null
  display_status: string
  addons: PublicStyleAddon[]
}

/** 公开画风（仅 is_active=1） */
export interface PublicArtStyle {
  id: number
  name: string
  description: string | null
  cover_image: string | null
  sort_order: number
  sizes: PublicStyleSize[]
}

/** GET /public/pricing/:subdomain 响应 */
export interface PublicPricingResult {
  styles: PublicArtStyle[]
  installments: InstallmentPlanItem[]
  discountEnabled: boolean
}

/** 付款节点计划项（getPaymentPlan） */
export interface InstallmentPlanItem {
  label: string
  basisPoints: number
}

// ─── 价格计算（style-pricing.service.ts） ───

/** 算价请求中的增项选择项 */
export interface StyleAddonSelection {
  styleAddonId: number
  quantity?: number
}

/** POST /public/calculate-style-price 请求体 */
export interface CalculateStylePriceRequest {
  subdomain: string
  styleSizeId: number
  addons?: StyleAddonSelection[]
  discountCode?: string | null
}

/** 固定计价增项明细行 */
export interface FixedAddonLine {
  name: string
  quantity: number
  unitCents: number
  amountCents: number
  source: string
}

/** 百分比计价增项明细行 */
export interface PercentAddonLine {
  name: string
  quantity: number
  percent: number
  amountCents: number
  source: string
}

/** 用途/加急倍率行（incrementCents = 该倍率带来的加价增量） */
export interface MultiplierLine {
  name: string
  percent: number
  incrementCents: number
}

/** POST /public/calculate-style-price 响应 */
export interface StylePriceResult {
  styleName: string
  sizeName: string
  baseCents: number
  fixedAddonItems: FixedAddonLine[]
  percentAddonItems: PercentAddonLine[]
  subtotalCents: number
  usage: MultiplierLine | null
  rush: MultiplierLine | null
  afterMultipliersCents: number
  discount: { code: string; type: string; value: number; amountCents: number } | null
  totalCents: number
}

// ─── 公开画廊（style.service.ts F6） ───

export interface PublicGalleryTag {
  style_size_id: number
  size_name: string
  style_id: number
  style_name: string
}

export interface PublicGalleryArtwork {
  id: number
  image_path: string
  title: string | null
  description: string | null
  like_count: number
  is_cover: number
  width: number | null
  height: number | null
  size_tags: PublicGalleryTag[]
}

export interface PublicGallerySize {
  id: number
  name: string
  style_id: number
  style_name: string
  sort_order: number
}

/** GET /public/gallery/:subdomain 响应 */
export interface PublicGalleryResult {
  artworks: PublicGalleryArtwork[]
  filterSizes: PublicGallerySize[]
}

/** 作品点赞/取消点赞响应（F1） */
export interface LikeArtworkResult {
  likeCount: number
}

// ─── 增项库（addon_templates） ───

export interface AddonTemplate {
  id: number
  artist_id: number | null
  name: string
  control_type: string
  price_mode: string
  default_price: number
  unit_label: string | null
  sort_order: number
  category: string
  max_quantity: number | null
  created_at: string
}

/** DELETE /artist/addon-templates/:id 响应（referenced = 是否被画风引用过） */
export interface DeleteAddonTemplateResult {
  deleted: boolean
  referenced: boolean
}

// ─── 系统增项模板（815 第三批 I 路，管理端） ───

/** 管理端系统增项模板行（仅 artist_id IS NULL；referenced = 被画风引用数） */
export interface AdminAddonTemplate extends AddonTemplate {
  referenced: number
}

/** 管理端新建/编辑系统模板写请求（对齐画师侧字段 + sort_order） */
export interface AdminAddonTemplateInput extends AddonTemplateInput {
  sort_order?: number
}

/** 管理端更新系统模板写请求（sync=true 同步 / false 或缺省=冻结） */
export interface AdminAddonTemplateUpdate extends AdminAddonTemplateInput {
  sync?: boolean
}

/** DELETE /api/admin/addon-templates/:id 响应 */
export interface DeleteAdminAddonTemplateResult {
  deleted: boolean
  referenced: number
}

// ─── 画风管理（画师端） ───

export interface ArtStyle {
  id: number
  artist_id: number
  name: string
  description: string | null
  cover_image: string | null
  sort_order: number
  is_active: number
  created_at: string
}

export interface StyleSize {
  id: number
  art_style_id: number
  name: string
  base_price: number
  sort_order: number
  image: string | null
  image_artwork_id: number | null
  description: string | null
  work_days: number | null
  display_status: string
}

/** 画风增项（含模板快照列 + detached 标记） */
export interface StyleAddonWithTemplate {
  id: number
  art_style_id: number
  addon_template_id: number | null
  is_enabled: number
  price_override: number | null
  template_name: string
  template_control_type: string
  template_price_mode: string
  template_default_price: number
  template_unit_label: string | null
  template_category: string
  template_max_quantity: number | null
  detached: boolean
}

export interface ArtStyleWithDetails extends ArtStyle {
  sizes: StyleSize[]
  addons: StyleAddonWithTemplate[]
}

export interface SizeAddonOverride {
  id: number
  style_size_id: number
  style_addon_id: number
  price_override: number | null
  is_hidden: number
}

export interface DeletedResult {
  deleted: boolean
}

// ─── 订单核心实体（types/entities.ts + order.service.ts） ───

export type OrderStatus = 'pending' | 'confirmed' | 'wip' | 'revision' | 'done' | 'delivered' | 'cancelled'
export type OrderPriority = 'high' | 'medium' | 'low'

/** 订单基础行（orders 表全列） */
export interface Order {
  id: number
  order_no: string
  artist_id: number
  style_size_id: number | null
  client_qq: string
  client_name: string | null
  description: string | null
  priority: OrderPriority
  status: OrderStatus
  source: 'self' | 'manual'
  client_notify: number
  queue_position: number | null
  completed_at: string | null
  price_snapshot: number | null
  total_price_cents: number | null
  queue_zone: 'formal' | 'buffer'
  current_stage_id: number | null
  deadline: string | null
  paid_total_cents: number
  version: number
  created_at: string
  updated_at: string
}

/** 订单详情（Order + 关联数组 + 画师字段；SPEC-PRICE-2 过渡字段名 tier_*） */
export interface OrderDetail extends Order {
  final_price_cents?: number | null
  start_date?: string | null
  quote_snapshot?: string | null
  focus_image_path?: string | null
  artist_name?: string
  artist_subdomain?: string
  tier_name?: string | null
  tier_price?: number | null
  tier_work_days?: number | null
  references?: Array<{ file_path: string; original_name?: string | null; source?: string }>
  deliverables?: Array<{ id: number; file_path: string; original_name?: string | null; file_size?: number | null }>
  notes?: Array<{ id?: number; image_path: string | null }>
  extraItems?: Array<{ name: string; price_cents: number }>
}

/** 流程进度信息（getStageInfo，仅订单有 current_stage_id 时附带） */
export interface StageInfo {
  currentStageId: number
  currentStageName: string
  stageProgress: { current: number; total: number }
}

/** 话术 + 客户沟通数据（getSpeechInfo） */
export interface SpeechInfo {
  clientQq: string | null
  totalPriceCents: number | null
  paidCents: number
  unpaidCents: number | null
  speechText: string | null
}

/** 付款节点三态（getOrderInstallments） */
export interface OrderInstallment {
  id: number
  name: string
  amountCents: number
  paidCents: number
  remainingCents: number
  status: string
  locked: boolean
  lockedReason: string | null
}

/** 收款流水行（画师端 getPayments / addPayment） */
export interface PaymentRow {
  id: number
  order_id: number
  installment_id: number | null
  amount_cents: number
  note: string | null
  created_at: string
  created_by: string
}

/** 客户可见收款明细（track 页用） */
export interface ClientPayment {
  id: number
  amountCents: number
  note: string | null
  createdAt: string
}

/**
 * 画师端增强订单（enrichOrderForArtist）：
 * OrderDetail + 签名 URL + stageInfo（可选）+ speechInfo + 额度池字段
 */
export type EnrichedOrderDetail = OrderDetail &
  Partial<StageInfo> &
  SpeechInfo & {
    paidTotalCents: number
    remainingCents: number | null
    installments: OrderInstallment[]
    startDate: string | null
  }

/** 交付端点响应（deliver / deliver-no-file） */
export type DeliverResult = EnrichedOrderDetail & { statusChanged: boolean }

/** 订单列表/队列行（o.* + 画风尺寸关联；focusImageUrl 仅有焦点图时附带） */
export type ArtistOrderItem = Order & {
  tier_name: string | null
  tier_price: number | null
  /** 817-D 7-7：焦点参考图路径（orders 表列，nullable；前端 OrderList/QueueBoard 直接读该字段） */
  focus_image_path?: string | null
  focusImageUrl?: string
}

/** 队列行（额外 camelCase 映射 currentStageId/startDate） */
export type QueueOrderItem = ArtistOrderItem & {
  currentStageId: number | null
  startDate: string | null
}

/** GET /artist/orders 分页响应 */
export type ArtistOrdersResult = PagedResult<ArtistOrderItem>

/** 管理员端订单行（B7: 补充 camelCase 付款字段 + 分期） */
export type AdminOrderItem = ArtistOrderItem & {
  paidTotalCents: number
  finalPriceCents: number
  installments: OrderInstallment[]
}

export type AdminOrdersResult = PagedResult<AdminOrderItem>

/** GET /artist/orders/:id/logs 响应（detail_json 已解析为 detail） */
export interface ActivityLogItem {
  id: number
  order_id: number
  action_type: string
  actor: string
  detail_json: string | null
  created_at: string
  detail: Record<string, unknown> | null
}

export interface OrderLogsResult {
  logs: ActivityLogItem[]
  total: number
  page: number
  pageSize: number
}

/** GET /artist/orders/:id/payments 响应 */
export interface PaymentsResult {
  payments: PaymentRow[]
}

/** POST /artist/orders/:id/payments 响应 */
export interface AddPaymentResult {
  payment: PaymentRow
  paidTotalCents: number
  finalPriceCents: number | null
  installments: OrderInstallment[]
}

/** POST /artist/refresh-signatures 响应（R33） */
export interface RefreshSignaturesResult {
  urls: Record<string, string>
}

/** GET /artist/stats 响应（order-stats.service.ts） */
export interface ArtistStats {
  pendingCount: number
  activeCount: number
  monthRevenue: number
  monthRevenueCents: number
  totalCompleted: number
  todayNewOrderCents: number
  todayNewOrderCount: number
  todayRevenueCents: number
  todayRevenueCount: number
  todayTodoCount: number
}

/** GET /artist/orders/upcoming-deadlines 行（R51） */
export interface DeadlineRow {
  id: number
  order_no: string
  client_name: string | null
  deadline: string
  status: string
}

// ─── 客户端订单（orderApi） ───

/** POST /orders 响应 */
export interface OrderCreateResult {
  orderNo: string
  totalPriceCents: number | null
  message: string
  // F1 围剿：客户访问令牌明文（仅下单成功响应下发一次）+ 完整追踪 URL 片段
  customerToken: string
  trackUrl: string
}

/** 画师重新生成客户令牌响应（POST /artist/orders/:id/regenerate-token） */
export interface CustomerTokenResult {
  customerToken: string
  trackUrl: string
}

/** GET /orders/track/:orderNo 响应 */
export interface OrderTrackResult {
  orderNo: string
  status: OrderStatus
  tierName: string | null
  artistName: string | undefined
  description: string | null
  references: Array<{ url: string; originalName: string | null | undefined }>
  position: number | null
  total: number | null
  workflowStages: WorkflowStageDTO[]
  currentStageId: number | null
  currentStageName: string | null
  deliverables: Array<{ id: number; fileName: string | null | undefined; url: string }>
  extraItems: Array<{ name: string; priceCents: number }>
  finalPriceCents: number | null
  paidTotalCents: number
  installments: OrderInstallment[]
  payments: ClientPayment[]
  deadline: string | null
  queueZone: string
  queueDisplay: string | null
  createdAt: string
  updatedAt: string
}

/** GET /orders/delivery/:orderNo 响应 */
export interface OrderDeliveryResult {
  orderNo: string
  status: OrderStatus
  artistName: string | undefined
  deliverables: Array<{
    id: number
    fileName: string | null | undefined
    fileSize: number | null | undefined
    url: string
    /** 815 拍板 #4：一次性下载锁定状态（已下载过，需画师再许可） */
    downloadLocked?: boolean
  }>
}

// ─── 上传（upload.routes.ts） ───

/** 图片/参考图上传响应（含格式劝告 typeWarning） */
export interface UploadImageResult {
  filePath: string
  url: string
  originalName: string
  mimeType: string
  size: number
  typeWarning: string | null
}

/** 交付文件/备注附图上传响应（无 typeWarning） */
export interface UploadFileResult {
  filePath: string
  url: string
  originalName: string
  mimeType: string
  size: number
}

// ─── 仪表盘（dashboard.service.ts） ───

export interface RevenueBar {
  label: string
  cents: number
  count: number
}

/** GET /artist/dashboard/revenue 响应 */
export interface RevenueResult {
  period: string
  bars: RevenueBar[]
  summary: {
    totalCents: number
    completedCount: number
    changePercent: number | null
  }
}

/** GET /artist/dashboard/todo 待办项 */
export interface TodoItem {
  id: number
  orderNo: string
  clientName: string | null
  status: string
  deadline: string | null
  tag: string
  /** E3: 当前工作流节点名（后端增补字段；旧服务端/无节点时缺失或 null，前端降级为既有措辞） */
  stageName?: string | null
  /** 815 审计 P1-2: 当前工作流节点 id（无节点/旧服务端时缺失或 null） */
  currentStageId?: number | null
  /** 815 审计 P1-2: 下一节点 id（已是末节点/无流程时为 null，待办推进用） */
  nextStageId?: number | null
}

export interface TodoResult {
  items: TodoItem[]
}

/** GET /artist/dashboard/schedule 近 7 日排期条（视觉批卷轴数据源） */
export interface ScheduleBar {
  id: number
  orderNo: string
  clientName: string | null
  status: string
  startDate: string | null
  deadline: string | null
  stageName: string | null
  /** E1 补全（清扫批）：画风/尺寸名，旧单无 style_size_id 时为 null */
  styleName: string | null
  sizeName: string | null
}

export interface ScheduleResult {
  bars: ScheduleBar[]
}

/** 自定义首页批一（v70）：仪表盘布局偏好（服务端归一化 schema v1，GET 永远返回完整合法值） */
export interface DashboardPrefs {
  v: number
  /** 板块顺序（基础 9 块的排列） */
  order: string[]
  /** 隐藏的板块 id */
  hidden: string[]
  /** 宽度档位 half/full */
  width: Record<string, 'half' | 'full'>
  /** 列表卡显示行数 0/3/5（0=全部） */
  density: Record<string, number>
  /** 排期块款式 */
  scheduleStyle: 'bars' | 'ledger' | 'ptags' | 'waybill'
  /** 问候卡款式 */
  greetStyle: 'plain' | 'seal' | 'ribbon' | 'rule'
  /** 页面位置三档 */
  pageAlign: 'left' | 'center' | 'full'
  /** 页面最大宽度（仅 left/center 档生效，1000〜1680） */
  pageMax: number
}

/** 自定义首页批二：收入概览板块数据源（到账与导出 CSV 同源同口径） */
export interface IncomeOverview {
  monthReceivedCents: number
  yearReceivedCents: number
  pendingCents: number
  pendingCount: number
}

/** 自定义首页批二：截稿倒计时条目（daysLeft 负数=已逾期） */
export interface DeadlineSoonItem {
  id: number
  orderNo: string
  clientName: string | null
  deadline: string
  daysLeft: number
}

export interface DeadlineSoonResult {
  items: DeadlineSoonItem[]
}

/** GET /artist/dashboard/activity 活动项 */
export interface ActivityItem {
  id: number
  orderId: number
  orderNo: string
  content: string
  createdAt: string
}

export interface ActivityResult {
  items: ActivityItem[]
}

// ─── 埋点（tracking.service.ts） ───

export type StatsMode = 'off' | 'hidden' | 'on'

export interface NameCount {
  name: string
  count: number
}

export interface DayCount {
  day: string
  count: number
}

/** GET /admin/tracking/summary 响应（含下单漏斗） */
export interface TrackingSummary {
  total: number
  byName: NameCount[]
  byDay: DayCount[]
  funnel: NameCount[]
}

/** GET /artist/tracking/summary 响应（联合：开关关 | 开并附统计） */
export type ArtistTrackingResult =
  | { mode: StatsMode; enabled: false }
  | { mode: StatsMode; enabled: true; total: number; byName: NameCount[]; byDay: DayCount[] }

/** GET /admin/tracking-config 响应 */
export interface TrackingConfig {
  statsMode: StatsMode
  artistStatsVisible: boolean
  /** 820-L: 统计功能管理员总开关（默认 false=关闭，画师后台隐藏整个统计导航） */
  statsEnabled: boolean
}

// ─── 画师工具（tools.service.ts） ───

/** 客户标记（画师私有） */
export interface ClientProfile {
  id: number
  clientQq: string
  tags: string[]
  note: string
}

/** 客户消费汇总 */
export interface ClientSummary {
  clientQq: string
  totalOrders: number
  totalPaidCents: number
  lastOrderAt: string | null
  lastOrderStatus: string | null
}

/** 老客召回行（>days 天未下单） */
export type ReturningClient = ClientSummary & { daysSinceLastOrder: number }

export interface ToolsClientsResult {
  items: ClientProfile[]
}

export interface ToolsClientResult {
  profile: ClientProfile | null
  summary: ClientSummary | null
}

export interface SaveToolsClientResult {
  profile: ClientProfile
}

export interface OkResult {
  ok: true
}

export interface ReturningClientsResult {
  items: ReturningClient[]
}

/** 散单记账行 */
export interface StandaloneIncome {
  id: number
  amountCents: number
  clientName: string
  note: string
  incomeDate: string
}

export interface StandaloneIncomesResult {
  items: StandaloneIncome[]
}

export interface CreateStandaloneIncomeResult {
  item: StandaloneIncome
}

/** GET /artist/tools/income-summary 响应（t1 围剿：概览口径对齐导出 CSV——订单收款+散单） */
export interface IncomeSummaryResult {
  orderIncomeCents: number
  standaloneIncomeCents: number
  totalCents: number
  from: string
  to: string
}

// ─── 管理员（admin.routes.ts / admin.service.ts） ───

/** GET /admin/artists 行（publicArtistDTO + isAdmin + 登录留痕字段）
 * last_login_at/last_login_ip 被 DTO 默认剔除，仅管理端接口显式重新附带（登录留痕批 v72） */
export type AdminArtistItem = PublicArtistDTO & {
  isAdmin: boolean
  last_login_at: string | null
  last_login_ip: string | null
}

export interface DeleteArtistResult {
  success: boolean
  message: string
}

/** GET /admin/artists/deleted 行（0817：已移除画师清单，软删兜底可恢复） */
export interface DeletedArtistItem {
  id: number
  name: string
  subdomain: string
  qqNumber: string
  isBanned: boolean
  deletedAt: string
}

/** POST /admin/artists/:id/restore 响应 */
export interface RestoreArtistResult {
  success: boolean
  message: string
}

/** GET /admin/system/version 响应（0818 拍板方案 A：更新检查只读面板） */
export interface SystemVersionResult {
  current: { version: string; commit: string; deployedAt: string | null }
  latest: { ok: boolean; sha: string | null; date: string | null }
  /** true=已是最新；false=有新提交；null=无法对比（本地 commit 未知或 GitHub 拉取失败） */
  upToDate: boolean | null
  repoUrl: string
}

/** GET /admin/stats 响应 */
export interface GlobalStats {
  artistCount: number
  orderCount: number
  activeOrders: number
}

/** POST /admin/artists/:id/totp/bind-init 响应 */
export interface TotpBindInitResult {
  qrDataUrl: string
  otpauthUri: string
  _dev_secret?: string
}

export interface TotpActionResult {
  success: boolean
  message: string
}

/** POST /admin/transfer 响应 */
export interface TransferAdminResult {
  success: boolean
  newAdminName: string
  newAdminQq: string
}

/** 回收站条目 */
export interface RecycleBinItem {
  fileName: string
  originalPath: string
  size: number
  movedAt: string
}

export type RecycleBinResult = PagedResult<RecycleBinItem>

/** DELETE /admin/recycle-bin 响应 */
export interface EmptyRecycleBinResult {
  success: boolean
  deleted: number
}

/** GET /admin/artists/:id/pricing-overview 行（SPEC-PRICE-2 只读概览） */
export interface ArtistPricingOverviewItem {
  id: number
  name: string
  is_active: number
  sizes: Array<{ id: number; name: string; base_price: number; display_status: string }>
}

/** 单项自检结果（health.service.ts） */
export interface HealthCheckItem {
  id: string
  name: string
  status: string
  summary: string
  detail: Record<string, unknown>
}

/** GET /admin/health 响应 */
export interface HealthResult {
  checks: HealthCheckItem[]
  timestamp: string
}

// ─── 画师端 profile / 作品扩展响应 ───

/** GET /artist/profile 响应（publicArtistDTO + 作品/须知/名额） */
export type ArtistProfileResult = PublicArtistDTO & {
  /** SPEC-PRICE-2（v50）：旧档位已清退，恒为空数组（前端过渡兼容） */
  tiers: unknown[]
  artworks: Artwork[]
  rules: CommissionRule | null
  slotDisplay: string | null
  /** 820-L（v68）: 留言开关（对齐 notify_enabled 口径） */
  guestbookEnabled: boolean
  /** 820-L: 统计功能管理员开关（默认 false=关闭，画师后台隐藏整个统计导航） */
  statsEnabled: boolean
}

// ─── 请求体类型（对照后端 JSON Schema） ───

/** 订单写路径乐观锁附加字段（D-1/R-5） */
export interface VersionedOptions {
  version?: number
}

/** PUT /artist/orders/:id/status 附加字段（R-2 确认带款取消 + 乐观锁） */
export interface UpdateStatusOptions extends VersionedOptions {
  confirmPaidCancel?: boolean
}

/** POST /artist/orders/:id/publish-artwork 请求体 */
export interface PublishArtworkRequest {
  deliverableIds: number[]
  title: string
  description?: string | null
}

/** POST /artist/discount-codes 请求体 */
export interface CreateDiscountCodeRequest {
  code: string
  discountType?: 'percent' | 'fixed'
  discountValue: number
  maxUses?: number | null
  expiresAt?: string | null
}

/** PUT /artist/discount-codes/:id 请求体（码本身不可改） */
export interface UpdateDiscountCodeRequest {
  discountValue?: number
  maxUses?: number | null
  expiresAt?: string | null
  enabled?: boolean
}

/** POST /artist/orders/manual 请求体 */
export interface CreateManualOrderRequest {
  clientQq: string
  clientName?: string | null
  description?: string | null
  priority?: OrderPriority
  clientNotify?: boolean
  references?: string[]
  discountCode?: string | null
  styleSizeId?: number | null
  styleAddons?: StyleAddonSelection[]
}

/** POST /orders 请求体（客户自助下单） */
export interface CreateOrderRequest {
  subdomain: string
  clientQq: string
  agreeRules: boolean
  clientName?: string | null
  description?: string | null
  priority?: OrderPriority
  clientNotify?: boolean
  references?: string[]
  discountCode?: string | null
  styleSizeId?: number | null
  styleAddons?: StyleAddonSelection[]
}

/** POST /artist/orders/:id/notes 请求体 */
export interface AddNoteRequest {
  content: string
  imagePath?: string | null
}

/** POST /artist/orders/:id/extra-items 请求体（SPEC-003） */
export interface ExtraItemRequest {
  name: string
  description?: string | null
  priceCents?: number
}

/** POST /artist/orders/:id/references 请求体 */
export interface AddReferenceRequest {
  filePath: string
  fileName?: string | null
  fileSize?: number | null
}

/** PUT /artist/orders/:id/focus-image 请求体（R4） */
export interface SetFocusImageRequest {
  imagePath?: string | null
  mode: 'off' | 'small' | 'large'
}

/** PUT /artist/orders/:id/price 请求体 */
export interface UpdatePriceRequest extends VersionedOptions {
  finalPriceCents: number
  quoteSnapshot?: string | null
}

/** POST /artist/orders/:id/payments 请求体 */
export interface AddPaymentRequest {
  amountCents: number
  note?: string | null
  installmentId?: number | null
}

/** POST /artist/orders/:id/deliver 请求体（version 可选） */
export interface DeliverRequest extends VersionedOptions {
  filePath: string
  fileName?: string | null
  fileSize?: number | null
}

/** PUT /artist/workflow/payment 节点项 */
export interface SavePaymentNode {
  id: number
  basisPoints: number
}

/** 问候语模板写请求（通用库/画师专属库共用；E5：可挂特别日） */
export interface GreetingInput {
  text: string
  timeSlot?: 'early' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'midnight' | 'any'
  /** 关联特别日；null=解除关联 */
  specialDayId?: number | null
}

/** POST /admin/artists 请求体 */
export interface CreateArtistRequest {
  qqNumber: string
  name: string
  subdomain: string
  bio?: string | null
  artistCode?: string | null
}

/** POST /admin/transfer 请求体 */
export interface TransferAdminRequest {
  newQq: string
  currentCode: string
  newCode: string
}

/** 社交平台写请求（REQ-022 F2） */
export interface PlatformInput {
  name?: string
  iconKey?: string | null
  fallbackChar?: string | null
  matchDomains?: string[]
  sortOrder?: number
  enabled?: boolean
}

/** 增项库写请求（SPEC-PRICE-2） */
export interface AddonTemplateInput {
  name: string
  control_type?: 'switch' | 'quantity'
  price_mode?: 'fixed' | 'percent'
  default_price?: number
  unit_label?: string | null
  category?: 'add' | 'usage' | 'rush'
  max_quantity?: number | null
}

/** 画风写请求 */
export interface ArtStyleInput {
  name?: string
  description?: string | null
  cover_image?: string | null
  sort_order?: number
  is_active?: boolean
}

/** 尺寸写请求（v0.37 F1） */
export interface StyleSizeInput {
  name?: string
  base_price?: number
  sort_order?: number
  image?: string | null
  image_artwork_id?: number | null
  description?: string | null
  work_days?: number | null
  display_status?: 'available' | 'showcase' | 'closed'
}

/** PUT /artist/art-styles/:id/addons 单项 */
export interface StyleAddonSetItem {
  addon_template_id: number
  is_enabled?: boolean
  price_override?: number | null
}

/** PUT .../overrides 单项 */
export interface SizeOverrideSetItem {
  style_addon_id: number
  price_override?: number | null
  is_hidden?: boolean
}

/** 客户标记写请求（REQ-035 批A） */
export interface SaveToolsClientRequest {
  tags?: string[]
  note?: string
}

/** POST /artist/tools/standalone-incomes 请求体 */
export interface CreateStandaloneIncomeRequest {
  amountCents: number
  clientName: string
  note: string
  incomeDate: string
}

/** GET /admin/messages 筛选（REQ-022 F5；query 序列化后为字符串） */
export interface AdminMessageFilters {
  artistId?: number
  status?: 'pending' | 'approved' | 'rejected'
  replied?: '0' | '1' | 0 | 1
}


// ─── REQ-040: WebAuthn Passkey ───

/** WebAuthn 凭据行 */
export interface WebAuthnCredential {
  id: number
  artist_id: number
  credential_id: string
  public_key: string
  counter: number
  device_name: string | null
  created_at: string
  last_used_at: string | null
}

/** POST /api/auth/webauthn/register-options 响应（PublicKeyCredentialCreationOptions 镜像） */
export interface WebAuthnRegisterOptions {
  challenge: string
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ type: string; alg: number }>
  timeout?: number
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>
  authenticatorSelection?: { authenticatorAttachment?: string; residentKey?: string; userVerification?: string }
  attestation?: string
}

/** POST /api/auth/webauthn/register-verify 响应 */
export interface WebAuthnRegisterVerifyResult {
  credential: WebAuthnCredential
}

/** POST /api/auth/webauthn/login-options 响应（PublicKeyCredentialRequestOptions 镜像） */
export interface WebAuthnLoginOptions {
  challenge: string
  timeout?: number
  rpId?: string
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>
  userVerification?: string
}

/** POST /api/auth/webauthn/login-verify 响应 */
export interface WebAuthnLoginVerifyResult {
  isAdmin: boolean
  artist: { id: number; name: string; subdomain: string; qqNumber: string }
}

/** GET /api/auth/webauthn/credentials 响应 */
export interface WebAuthnCredentialsResult {
  credentials: WebAuthnCredential[]
}

/** oimimo 吸纳批一：日历订阅（ICS）状态（GET/PUT /api/artist/calendar-feed） */
export interface CalendarFeedResult {
  enabled: boolean
  /** 含令牌的订阅路径（前端拼 origin 得完整链接）；未启用为 null */
  url: string | null
}

// ─── H-3: 桌面端登录设备账本（GET/DELETE /api/artist/devices） ───
/** GET /api/artist/devices 单行（后端已剔除 artist_id/device_uuid 等敏感列） */
export interface DesktopDevice {
  id: number
  device_name: string | null
  last_active_at: string
  expires_at: string
  created_at: string
  /** 最近登录 IP（后端 last_login_ip 映射；无记录为 null） */
  login_ip: string | null
}
/** GET /api/artist/devices 响应（最近活跃倒序） */
export interface DesktopDevicesResult {
  devices: DesktopDevice[]
}

/** oimimo 吸纳批四：月度收入行（GET /api/artist/tools/income-monthly，与 income-summary 同源同口径） */
export interface IncomeMonthRow {
  /** 月份键 YYYY-MM（本地时区） */
  month: string
  /** 订单收款（分，按到账日归属本地月，含退款负数） */
  orderCents: number
  /** 散单记账（分） */
  standaloneCents: number
  /** 合计（分） */
  totalCents: number
}

/** GET /api/artist/tools/income-monthly 响应 */
export interface IncomeMonthlyResult {
  months: IncomeMonthRow[]
}

/** oimimo 吸纳补遗：画风收入分布行（GET /api/artist/tools/income-by-style） */
export interface IncomeByStyleRow {
  /** 画风名；空串 = 无画风关联（手动录单等），前端落「未分类」桶 */
  styleName: string
  cents: number
}

/** GET /api/artist/tools/income-by-style 响应 */
export interface IncomeByStyleResult {
  styles: IncomeByStyleRow[]
}

/** oimimo 吸纳补遗：客户消费排名行（GET /api/artist/tools/top-clients） */
export interface TopClientRow {
  clientQq: string
  /** 可能为 null（未填昵称），前端回落 QQ */
  clientName: string | null
  totalCents: number
  orderCount: number
}

/** GET /api/artist/tools/top-clients 响应 */
export interface TopClientsResult {
  clients: TopClientRow[]
}

/** PATCH /api/auth/webauthn/credentials/:id 响应 */
export interface WebAuthnUpdateCredentialResult {
  credential: WebAuthnCredential
}

// ─── REQ-040: TOTP 自助重绑 ───

/** POST /api/auth/totp/rebind-init 响应（有 Passkey 路径）
 * a1 猎杀修复：身份验证走登录仪式（前端自行 loginOptions+credentials.get）；
 * 815 审计 P1-1 修复：init 阶段即下发 tempKey + 新密钥二维码，confirm 消费暂存值 */
export interface RebindInitPasskeyResult {
  verifyMethod: 'passkey'
  tempKey: string
  qrDataUrl: string | null
  otpauthUri: string
}

/** POST /api/auth/totp/rebind-init 响应（无 Passkey 路径） */
export interface RebindInitCodeResult {
  verifyMethod: 'code'
  tempKey: string
  qrDataUrl: string | null
  otpauthUri: string
}

export type RebindInitResult = RebindInitPasskeyResult | RebindInitCodeResult

/** POST /api/auth/totp/rebind-confirm 响应 */
export interface RebindConfirmResult {
  success: boolean
  message: string
}

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

// ─── REQ-041: 管理后台二次验证（会话升级） ───

/** POST /api/auth/step-up 请求体 — TOTP 分支 */
export interface StepUpTotpRequest {
  method: 'totp'
  code: string
}

/** POST /api/auth/step-up 请求体 — Passkey 分支（flat 字段，后端组回 credential 校验） */
export interface StepUpPasskeyRequest {
  method: 'passkey'
  credentialId: string
  authenticatorData: string
  signature: string
  clientDataJSON: string
}

export type StepUpRequest = StepUpTotpRequest | StepUpPasskeyRequest

/** POST /api/auth/step-up 响应（成功即重签升级 token 覆盖 cookie） */
export interface StepUpResult {
  success: true
  verifiedAt: string
}

/** GET /api/admin/stepup-status 响应（200 = 已升级且在 30 分钟窗口内；401 STEP_UP_REQUIRED = 需验证） */
export interface StepUpStatusResult {
  verified: true
}

// ─── REQ-039: 邀请码注册 ───

export type InviteCodeStatus = 'unused' | 'used' | 'revoked'

/** GET /api/invite/status 响应 */
export interface InviteStatusResult {
  enabled: boolean
}

/** POST /api/invite/register 请求体 */
export interface InviteRegisterRequest {
  code: string
  qqNumber: string
  name: string
  subdomain: string
}

/** POST /api/invite/register 响应（TOTP 首绑上下文） */
export interface InviteRegisterResult {
  otpauthUri: string
  qqNumber: string
}

/** POST /api/invite/totp-confirm 请求体 */
export interface InviteTotpConfirmRequest {
  qqNumber: string
  code: string
}

/** POST /api/invite/totp-confirm 响应（与 auth verify 同形状） */
export type InviteTotpConfirmResult = AuthVerifyResult

/** POST /api/admin/invite-codes 请求体（maxUses 1-100，默认 1=一次性） */
export interface GenerateInviteCodesRequest {
  count: number
  validDays?: number
  maxUses?: number
}

/** 生成的码行 */
export interface GeneratedInviteCode {
  id: number
  code: string
  expiresAt: string
}

/** POST /api/admin/invite-codes 响应 */
export interface GenerateInviteCodesResult {
  codes: GeneratedInviteCode[]
}

/** GET /api/admin/invite-codes 行（使用人 null=未使用；usedBy/usedAt=最近一次使用者） */
export interface AdminInviteCode {
  id: number
  code: string
  status: InviteCodeStatus
  expiresAt: string
  usedAt: string | null
  createdAt: string
  createdBy: number | null
  usedBy: {
    id: number
    name: string | null
    subdomain: string | null
    qqNumber: string | null
  } | null
  /** 每码可用次数（1=一次性） */
  maxUses: number
  /** 已使用次数 */
  useCount: number
  /** status 仍为 unused 但已到期 */
  expired: boolean
}

/** GET /api/admin/invite-codes 筛选/分页 query（均可选） */
export interface AdminInviteCodeQuery {
  /** unused=未使用（不含过期）；expired=过期未用；used/revoked 精确匹配 */
  status?: InviteCodeStatus | 'expired'
  /** 码模糊搜索 */
  q?: string
  page?: number
  /** 默认 20，上限 100 */
  pageSize?: number
}

/** GET /api/admin/invite-codes 响应（服务端分页） */
export interface AdminInviteCodesResult {
  codes: AdminInviteCode[]
  total: number
  page: number
  pageSize: number
}

/** GET /api/admin/invite-codes/:id/uses 行（倒序，最近在前） */
export interface InviteCodeUse {
  artistId: number
  name: string | null
  qqNumber: string | null
  subdomain: string | null
  usedAt: string
}

/** GET /api/admin/invite-codes/:id/uses 响应 */
export interface InviteCodeUsesResult {
  uses: InviteCodeUse[]
}

/** POST /api/admin/invite-codes/:id/revoke 响应 */
export interface RevokeInviteCodeResult {
  success: true
  code: string
  status: InviteCodeStatus
}

// ═══ REQ-043 I2/I4: 开张任务卡 + 平台公告 ═══

/** GET /api/artist/onboarding 任务项（share=建议项，恒 false，不阻塞完成） */
export interface OnboardingTask {
  key: 'artwork' | 'tier' | 'share'
  done: boolean
}

/** GET /api/artist/onboarding 响应 */
export interface OnboardingState {
  dismissed: boolean
  tasks: OnboardingTask[]
}

/** GET /api/artist/announcement 响应（标题与内容均为空 = 无公告，返回 null） */
export interface PlatformAnnouncement {
  title: string
  content: string
  updatedAt: string | null
}

/** PUT /api/admin/announcement 请求体（标题+内容都为空 = 清空公告） */
export interface SaveAnnouncementRequest {
  title?: string | null
  content?: string | null
}


