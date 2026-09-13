// ============================================
// 对外安全的画师 DTO（安全加固批 F1）
// 剔除所有服务端密钥/内部字段，绝不返回给客户端：
//   totp_secret / totp_failed_attempts / totp_locked_until（TOTP 密钥体系）
//   token_version（会话版本，内部吊销机制）
//   deleted_at（软删除标记）
//   weibo_url / bilibili_url / platform_urls（历史遗留列，前端零引用，外链已走 social_platforms + custom_links）
// totp_verified 保留（绑定状态非密钥本身，管理端可能展示）
// last_login_at / last_login_ip（登录留痕批 v72）：仅管理后台可见，管理端接口显式重新附带；
//   此处在 DTO 层剔除，避免经 /api/auth/me、/api/artist/profile 等口外泄给画师本人/访客
// home_takedown_reason（内容下架批 v76）：**只剔除原因**，不剔 home_takedown_at——
//   「是否被平台下架」是管理列表需要直接展示的状态位，平铺无害；
//   「原因」是自由文本性质的处置描述，不平铺进任意响应体，需要它的端点照 last_login_ip 同款显式重附
//   （画师本人看自己那条原因走 /api/artist/profile 的显式嵌套字段，不经本 DTO 平铺）
// ============================================
import type { Artist } from '../types/entities.js'

export function publicArtistDTO(a: Artist | Record<string, unknown> | null | undefined): Record<string, unknown> | null | undefined {
  if (!a) return a as Record<string, unknown> | null | undefined
  const {
    totp_secret,
    totp_failed_attempts,
    totp_locked_until,
    token_version,
    deleted_at,
    weibo_url,
    bilibili_url,
    platform_urls,
    last_login_at,
    last_login_ip,
    home_takedown_reason,
    ...safe
  } = a as Record<string, unknown>
  void totp_secret; void totp_failed_attempts; void totp_locked_until
  void token_version; void deleted_at; void weibo_url; void bilibili_url; void platform_urls
  void last_login_at; void last_login_ip; void home_takedown_reason
  return safe
}
