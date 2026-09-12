// API 边界 DTO · 画师公开主页 / 须知 / 画师端 profile（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { Artwork } from './artwork'
import type { PublicArtistDTO } from './auth'

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

// ─── 须知 ───

export interface CommissionRule {
  artist_id: number
  content: string
  updated_at: string
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
