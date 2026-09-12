// API 边界 DTO · 订单核心实体 + 客户端订单 + 订单写请求体（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { PagedResult } from './common'
import type { StyleAddonSelection } from './pricing'
import type { WorkflowStageDTO } from './workflow'

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

// ─── 请求体类型（对照后端 JSON Schema） ───

/** 订单写路径乐观锁附加字段（D-1/R-5） */
export interface VersionedOptions {
  version?: number
}

/** PUT /artist/orders/:id/status 附加字段（R-2 确认带款取消 + 乐观锁） */
export interface UpdateStatusOptions extends VersionedOptions {
  confirmPaidCancel?: boolean
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
