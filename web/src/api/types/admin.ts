// API 边界 DTO · 管理员后台（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { PublicArtistDTO } from './auth'
import type { PagedResult } from './common'

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
