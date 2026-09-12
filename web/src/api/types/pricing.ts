// API 边界 DTO · 公开价目与价格计算（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── 画风 / 尺寸 / 增项（style.service.ts） ───

/** 公开增项（嵌套于 PublicStyleSize） */
export interface PublicStyleAddon {
  id: number
  addon_template_id: number | null
  name: string
  control_type: string
  price_mode: string
  price: number
  unit_label: string | null
  is_enabled: boolean
  category: string
  max_quantity: number | null
}

/** 公开尺寸（v0.37 带图/描述/天数） */
export interface PublicStyleSize {
  id: number
  name: string
  base_price: number
  sort_order: number
  image: string | null
  image_artwork_id: number | null
  artwork_image_path: string | null
  description: string | null
  work_days: number | null
  display_status: string
  addons: PublicStyleAddon[]
}

/** 公开画风（仅 is_active=1） */
export interface PublicArtStyle {
  id: number
  name: string
  description: string | null
  cover_image: string | null
  sort_order: number
  sizes: PublicStyleSize[]
}

/** GET /public/pricing/:subdomain 响应 */
export interface PublicPricingResult {
  styles: PublicArtStyle[]
  installments: InstallmentPlanItem[]
  discountEnabled: boolean
}

/** 付款节点计划项（getPaymentPlan） */
export interface InstallmentPlanItem {
  label: string
  basisPoints: number
}

// ─── 价格计算（style-pricing.service.ts） ───

/** 算价请求中的增项选择项 */
export interface StyleAddonSelection {
  styleAddonId: number
  quantity?: number
}

/** POST /public/calculate-style-price 请求体 */
export interface CalculateStylePriceRequest {
  subdomain: string
  styleSizeId: number
  addons?: StyleAddonSelection[]
  discountCode?: string | null
}

/** 固定计价增项明细行 */
export interface FixedAddonLine {
  name: string
  quantity: number
  unitCents: number
  amountCents: number
  source: string
}

/** 百分比计价增项明细行 */
export interface PercentAddonLine {
  name: string
  quantity: number
  percent: number
  amountCents: number
  source: string
}

/** 用途/加急倍率行（incrementCents = 该倍率带来的加价增量） */
export interface MultiplierLine {
  name: string
  percent: number
  incrementCents: number
}

/** POST /public/calculate-style-price 响应 */
export interface StylePriceResult {
  styleName: string
  sizeName: string
  baseCents: number
  fixedAddonItems: FixedAddonLine[]
  percentAddonItems: PercentAddonLine[]
  subtotalCents: number
  usage: MultiplierLine | null
  rush: MultiplierLine | null
  afterMultipliersCents: number
  discount: { code: string; type: string; value: number; amountCents: number } | null
  totalCents: number
}
