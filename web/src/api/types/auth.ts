// API 边界 DTO · 认证与画师公共 DTO（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { ArtistStatus } from './artist'

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
  // F0180（B6）: 以下字段为后端 publicArtistDTO 实际平铺返回、但此前遗漏在 TS 镜像外的列
  //（后端只剔除 dto.ts 注释所列敏感列，其余 Artist 列全部下发）——按 entities.ts 口径补齐。
  /** REQ-040（v57）: TOTP 自助重绑冷却期起点 */
  totp_rebound_at: string | null
  /** REQ-042（v59）: 封禁独立态（1=封禁：主页下架+登录拒绝，不动 status 三态） */
  is_banned: number
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
  // F0180（B6）: 同批补齐——v61/v70/v60/v69/v76 已下发但旧镜像缺失的列
  /** 视觉批 P2（v61）: 看板模块开关 JSON（已被 dashboard_prefs 吞并，冻结只读） */
  dashboard_modules: string | null
  /** 自定义首页批一（v70）: 仪表盘布局偏好 JSON（schema v1；null=默认布局） */
  dashboard_prefs: string | null
  /** REQ-043（v60）: 开张任务卡后端标记（自然达成 / 主动「不再提示」） */
  onboarded_at: string | null
  onboarding_dismissed_at: string | null
  /** oimimo 吸纳批一（v69）: 日历订阅（ICS）开关；令牌即凭证，可旋转 */
  calendar_feed_enabled: number
  calendar_feed_token: string | null
  /** 内容级下架（v76）: 平台独占写入的下架态（reason 不平铺，仅显式端点回传） */
  home_takedown_at: string | null
  created_at: string
}

/** GET /auth/me、GET /artist/profile 等登录态接口的画师信息基座 */
export type AuthMeResult = PublicArtistDTO & { isAdmin: boolean }

/** POST /auth/logout 响应 */
export interface LogoutResult {
  message: string
}
