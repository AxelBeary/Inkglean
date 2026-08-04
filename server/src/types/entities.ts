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
  artist_code: string | null
  avatar: string | null
  bio: string | null
  status: ArtistStatus
  contact_qq: string | null
  token_version: number
  // REQ-027: TOTP 动态口令绑定（v41）
  totp_secret: string | null
  totp_verified: number
  totp_failed_attempts: number
  totp_locked_until: number | null
  deleted_at: string | null
  weibo_url: string | null
  bilibili_url: string | null
  notify_enabled: number
  template_id: string
  palette_id: string
  custom_page_path: string | null
  dashboard_default_panel: string | null
  revision_note: string | null
  custom_links: string | null
  accent_color: string | null
  platform_urls: string | null
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
  multi_style_enabled: number
  created_at: string
}

/** 价格档位 */
export interface Tier {
  id: number
  artist_id: number
  name: string
  price: number
  description: string | null
  example_image: string | null
  work_days: number | null
  sort_order: number
  visibility: string
}

/** 订单状态 */
export type OrderStatus = 'pending' | 'confirmed' | 'wip' | 'revision' | 'done' | 'delivered' | 'cancelled'

/** 订单优先级 */
export type OrderPriority = 'high' | 'medium' | 'low'

/** 订单 */
export interface Order {
  id: number
  order_no: string
  artist_id: number
  tier_id: number | null
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
  usage_multiplier_id: number | null
  rush_multiplier_id: number | null
  queue_zone: 'formal' | 'buffer'
  current_stage_id: number | null
  deadline: string | null
  paid_total_cents: number
  created_at: string
  updated_at: string
}

/** 工作流节点 */
export interface WorkflowStage {
  id: number
  artist_id: number
  name: string
  description: string | null
  sort_order: number
  takes_payment: number
  basis_points: number
  speech_template: string | null
  random_template: number
}

/** 增项 */
export interface Addon {
  id: number
  artist_id: number
  category: 'expression' | 'outfit' | 'background' | 'weapon' | 'other'
  name: string
  price_type: 'fixed' | 'percent'
  price_value: number
  select_mode: 'quantity' | 'toggle' | 'inquiry'
  max_qty: number
  description: string | null
  sort_order: number
  enabled: number
  tierIds?: number[]
}

/** 倍率 */
export interface Multiplier {
  id: number
  artist_id: number
  type: 'usage' | 'rush'
  name: string
  multiplier: number
  description: string | null
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
