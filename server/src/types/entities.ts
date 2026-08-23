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
  // REQ-040: TOTP 自助重绑冷却期（v57）
  totp_rebound_at: string | null
  // REQ-042: 封禁独立态（v59，不动 status 三态）：1=封禁（主页下架+登录拒绝）
  is_banned: number
  deleted_at: string | null
  weibo_url: string | null
  bilibili_url: string | null
  notify_enabled: number
  // 820-L（v68）: 留言功能画师手动开关——1=开启 0=关闭（隐藏客户主页留言板块+暂停接收，历史不删）
  guestbook_enabled: number
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
  // 视觉批 P2（v61）：看板模块开关 JSON（null=全部显示；键 schedule/guestbook/activity/onboarding）——已被 dashboard_prefs 吞并，冻结只读
  dashboard_modules: string | null
  // 自定义首页批一（v70）：仪表盘布局偏好 JSON（schema v1；null=默认布局）
  dashboard_prefs: string | null
  // REQ-043（v60）: 开张任务卡后端标记（自然达成 / 主动「不再提示」）
  onboarded_at: string | null
  onboarding_dismissed_at: string | null
  // 登录留痕批（v61/v72）: 上次登录时间与来源 IP（仅管理后台展示，publicArtistDTO 剔除）
  last_login_at: string | null
  last_login_ip: string | null
  // oimimo 吸纳批一（v69）: 日历订阅（ICS）开关与私密令牌（令牌即凭证，可旋转）
  calendar_feed_enabled: number
  calendar_feed_token: string | null
  created_at: string
}

/** 价格档位（历史类型：v50 后 price_tiers 已 DROP，仅遗留测试/admin 兼容引用） */
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

/** 订单（SPEC-PRICE-2 v50：移除 tier_id/旧倍率列，新增 style_size_id） */
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
  description: string | null
  sort_order: number
  takes_payment: number
  basis_points: number
  speech_template: string | null
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

/** 订单详情（getOrder 增强结构：Order 基础字段 + 关联数组 + 画师字段；order.routes 与 fastify.d.ts 共用）
 * SPEC-PRICE-2：tier_name/tier_price/tier_work_days 字段名保留（前端渐进过渡），内容 = 画风/尺寸标签、尺寸基础价、尺寸工期 */
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
  /** v128: 修改记录（画师端 enrich 下发；手动修改+打回均计一次，口径用户拍板） */
  revisionRecords?: Array<{ type: 'manual' | 'rollback'; at: string; fromStage?: string; toStage?: string }>
}
/** 订单列表/队列行（o.* + 画风尺寸关联字段；字段名 tier_* 为过渡兼容；order.routes 与 admin.routes 共用） */
export interface ArtistOrderRow {
  id: number
  order_no: string
  status: string
  client_name: string | null
  client_qq: string
  tier_name: string | null
  tier_price: number | null
  queue_position: number | null
  current_stage_id: number | null
  start_date: string | null
  focus_image_path: string | null
  paid_total_cents: number | null
  final_price_cents: number | null
  [key: string]: unknown
}
