// ============================================
// 核心实体类型定义（T5）
// 渐进迁移：v0.21 仅定义，不强制所有模块使用
// ============================================

/** 画师状态 */
export type ArtistStatus = 'open' | 'full' | 'break' | 'hidden'

/** 画师 */
export interface Artist {
  id: number
  qq_number: string
  name: string
  subdomain: string
  artist_code: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  avatar: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  bio: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  status: ArtistStatus
  contact_qq: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  token_version: number
  // REQ-027: TOTP 动态口令绑定（v41）
  totp_secret: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  totp_verified: number
  totp_failed_attempts: number
  totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null|totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  deleted_at: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  weibo_url: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  bilibili_url: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  notify_enabled: number
  template_id: string
  palette_id: string
  custom_page_path: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  dashboard_default_panel: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  revision_note: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  custom_links: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  accent_color: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  platform_urls: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  inspiration_tags: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  order_template_id: string
  batch_limit: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  buffer_limit: number
  auto_promote: number
  hide_queue_position: number
  hide_promote_notify: number
  buffer_short_form: number
  announcement: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  announcement_expires_at: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  monthly_quota: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  multi_style_enabled: number
  created_at: string
}

/** 价格档位（历史类型：v50 后 price_tiers 已 DROP，仅遗留测试/admin 兼容引用） */
export interface Tier {
  id: number
  artist_id: number
  name: string
  price: number
  description: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  example_image: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  work_days: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  sort_order: number
  visibility: string
}

/** 订单状态 */
export type OrderStatus = 'pending' | 'confirmed' | 'wip' | 'revision' | 'done' | 'delivered' | 'cancelled'

/** 订单优先级 */
export type OrderPriority = 'high' | 'medium' | 'low'

/** 订单（SPEC-PRICE-2 v50：移除 tier_id/旧倍率列，新增 style_size_id） */
export interface Order {
  id: number
  order_no: string
  artist_id: number
  style_size_id: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  client_qq: string
  client_name: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  description: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  priority: OrderPriority
  status: OrderStatus
  source: 'self' | 'manual'
  client_notify: number
  queue_position: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  completed_at: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  price_snapshot: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  total_price_cents: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  queue_zone: 'formal' | 'buffer'
  current_stage_id: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  deadline: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  paid_total_cents: number
  // D-1（R-5/P3-1）: 乐观锁版本号——写路径守卫（version = version + 1）
  version: number
  created_at: string
  updated_at: string
}

/** 工作流节点 */
export interface WorkflowStage {
  id: number
  artist_id: number
  name: string
  description: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  sort_order: number
  takes_payment: number
  basis_points: number
  speech_template: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  random_template: number
}

/**
 * 倍率
 */
export interface Multiplier {
  id: number
  artist_id: number
  type: 'usage' | 'rush'
  name: string
  multiplier: number
  description: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  sort_order: number
  enabled: number
}

/** 价格明细行 */
export interface PriceBreakdownItem {
  type: 'tier' | 'addon' | 'usage' | 'rush'
  name: string
  amount: number
  quantity: number
  multiplier: number
}

/** 计算结果 */
export interface PriceResult {
  basePrice: number
  addonTotal: number
  subtotal: number
  usageMultiplier: number
  rushMultiplier: number
  totalPrice: number
  totalPriceCents: number
  installments: Array<{ label: string; basisPoints: number; amount: number }>
  breakdown: PriceBreakdownItem[]
}

/** 订单详情（getOrder 增强结构：Order 基础字段 + 关联数组 + 画师字段；order.routes 与 fastify.d.ts 共用）
 * SPEC-PRICE-2：tier_name/tier_price/tier_work_days 字段名保留（前端渐进过渡），内容 = 画风/尺寸标签、尺寸基础价、尺寸工期 */
export interface OrderDetail extends Order {
  final_price_cents?: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  start_date?: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  quote_snapshot?: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  focus_image_path?: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  artist_name?: string
  artist_subdomain?: string
  tier_name?: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  tier_price?: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  tier_work_days?: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  references?: Array<{ file_path: string; original_name?: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null; source?: string }>
  deliverables?: Array<{ id: number; file_path: string; original_name?: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null; file_size?: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null }>
  notes?: Array<{ id?: number; image_path: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null }>
  extraItems?: Array<{ name: string; price_cents: number }>
}
/** 订单列表/队列行（o.* + 画风尺寸关联字段；字段名 tier_* 为过渡兼容；order.routes 与 admin.routes 共用） */
export interface ArtistOrderRow {
  id: number
  order_no: string
  status: string
  client_name: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  client_qq: string
  tier_name: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  tier_price: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  queue_position: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  current_stage_id: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  start_date: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  focus_image_path: string |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  paid_total_cents: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  final_price_cents: number |totp_locked_until: number | null
  // REQ-040: TOTP 自助重绑冷却期
  totp_rebound_at: string | null
  [key: string]: unknown
}

