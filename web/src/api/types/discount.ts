// API 边界 DTO · 折扣码（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 折扣码（discount.service.ts） ───

export interface DiscountCode {
  id: number
  artist_id: number
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  enabled: number
  created_at: string
}

/** GET /artist/discount-codes 响应 */
export interface DiscountCodesResult {
  enabled: boolean
  codes: DiscountCode[]
}

/** PUT /artist/discount-codes/toggle 响应 */
export interface ToggleDiscountResult {
  enabled: boolean
}

export interface DeleteDiscountResult {
  deleted: boolean
}

/** POST /public/validate-discount 请求体 */
export interface ValidateDiscountRequest {
  subdomain: string
  code: string
}

/** POST /public/validate-discount 响应（无效时走错误拦截器） */
export interface ValidateDiscountResult {
  valid: true
  discountType: 'percent' | 'fixed'
  discountValue: number
}

/** POST /artist/discount-codes 请求体 */
export interface CreateDiscountCodeRequest {
  code: string
  discountType?: 'percent' | 'fixed'
  discountValue: number
  maxUses?: number | null
  expiresAt?: string | null
}

/** PUT /artist/discount-codes/:id 请求体（码本身不可改） */
export interface UpdateDiscountCodeRequest {
  discountValue?: number
  maxUses?: number | null
  expiresAt?: string | null
  enabled?: boolean
}
