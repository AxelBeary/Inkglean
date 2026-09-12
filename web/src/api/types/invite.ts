// API 边界 DTO · REQ-039 邀请码注册与管理（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

import type { AuthVerifyResult } from './auth'

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
