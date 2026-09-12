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
