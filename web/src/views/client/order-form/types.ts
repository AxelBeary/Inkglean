/**
 * order-form/types — 客户端下单表单子组件共享类型（OrderForm 拆分批）
 *
 * 结构口径与后端公开契约一致（GET /public/styles、calculate-style-price 响应），
 * 可选字段用「缺失 = null/undefined」双容忍写法（`x == null` 判空），
 * 与 useOrderForm.js / 测试 mock 的宽松形态兼容。
 */

/** 步骤指示器步骤定义（key 与埋点 step_key 同源） */
export interface StepDef {
  key: string
  label: string
}

/** 画风增项（含普通 add / 用途 usage / 加急 rush 三类） */
export interface StyleAddon {
  id: number
  name: string
  price: number
  /** fixed（¥）或 percent（%） */
  price_mode?: string | null
  /** switch（开关）或 quantity（个数） */
  control_type?: string | null
  max_quantity?: number | null
  unit_label?: string | null
  category?: string | null
}

/** 画风尺寸档位 */
export interface StyleSize {
  id: number
  name: string
  base_price: number
  /** showcase = 展示态（可见不可约） */
  display_status?: string | null
  addons?: StyleAddon[] | null
  /** E13: 档位描述/工期/示意图（公开契约可选字段，缺失=摘要卡对应块不渲染） */
  description?: string | null
  work_days?: number | null
  image?: string | null
  artwork_image_path?: string | null
}

/** 公开画风 */
export interface ArtistStyle {
  id: number
  name: string
  description?: string | null
  cover_image?: string | null
  sizes?: StyleSize[] | null
}

/** 普通增项勾选状态（switch → toggled；quantity → quantity>0） */
export interface AddonSelection {
  toggled: boolean
  quantity: number
}

/** 用途/加急倍率行（名称 + 百分比 + 增量金额分） */
export interface MultiplierLine {
  name: string
  percent: number
  incrementCents: number
}

/** 小计后固定增项明细行 */
export interface FixedAddonItem {
  name: string
  amountCents: number
  quantity?: number | null
}

/** 百分比增项明细行（只按基础价） */
export interface PercentAddonItem {
  name: string
  percent: number
  amountCents: number
}

/** 预估折扣行 */
export interface DiscountLine {
  code: string
  amountCents: number
}

/** calculate-style-price 响应（全整数分口径；与后端唯一引擎同公式） */
export interface StylePricePreview {
  sizeName: string
  baseCents: number
  fixedAddonItems: FixedAddonItem[]
  percentAddonItems: PercentAddonItem[]
  subtotalCents: number
  usage?: MultiplierLine | null
  rush?: MultiplierLine | null
  discount?: DiscountLine | null
  totalCents: number
}

/** 分期预估行（展示用） */
export interface InstallmentItem {
  label: string
  amountCents: number
}

/** 折扣码验证结果 */
export interface DiscountResult {
  discountType: 'percent' | 'fixed'
  discountValue: number
}

/** 参考图文件列表项（el-upload :file-list 口径） */
export interface RefFileItem {
  name: string
  url?: string | null
  uid: string | number
  status?: string | null
}

/** 流程节点（WorkflowOverviewStrip stages 口径） */
export interface WorkflowStageItem {
  id: number | string
  name: string
  basisPoints?: number | null
  takesPayment?: boolean | null
  isFinal?: boolean | null
}
