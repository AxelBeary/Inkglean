import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { validateDiscountCode, computeDiscountCents } from './discount.service.js'

// ============================================
// SPEC-PRICE-2 唯一计价引擎（2026-08-09 价格模型统一重构）
//
// 最终价格 = (基础价 + 固定增项金额合计 + 百分比增项金额合计) × 用途倍率 × 加急倍率 × 折扣
//
// 铁律（用户拍板，顺序不可颠倒）：
//  1. 固定增项分别计算后相加（数量型 = 单价 × 数量）
//  2. 百分比增项分别计算后相加，每项金额 = 百分比 × 基础价（只基于基础价，不基于小计）
//  3. 用途/加急倍率在小计形成后依次相乘（先用途后加急）
//  4. 折扣最后应用
//  5. 全程整数分（cents）运算，防 IEEE 754：金额分 = Math.round(基准分 × percent / 100)，
//     percent 为整数，乘法结果在 Number 安全整数范围内，无浮点金额乘法
//
// 用途/加急 = addon_templates.category（usage/rush），各可配多个、每单各只生效一个（后端强制互斥）
// 旧 price_multipliers / price_tiers 双轨已在迁移 v50 清退
// ============================================

// ─── 类型 ───

interface AddonSelection {
  styleAddonId: number
  quantity?: number
}

interface CalculateStylePriceOpts {
  styleSizeId: number
  addons?: AddonSelection[]
  discountCode?: string | null
}

/** 价格来源层级（展示用）：尺寸覆盖 > 画风覆盖 > 模板默认 */
type PriceSource = 'size_override' | 'style_override' | 'template_default'

export interface FixedAddonLine {
  name: string
  quantity: number
  unitCents: number
  amountCents: number
  source: PriceSource
}

export interface PercentAddonLine {
  name: string
  quantity: number
  percent: number
  amountCents: number
  source: PriceSource
}

/** 用途/加急倍率行：incrementCents = 该倍率带来的加价增量（展示/明细用） */
export interface MultiplierLine {
  name: string
  percent: number
  incrementCents: number
}

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

/** 增项解析行（模板快照 COALESCE 模板表，解绑增项独立可用） */
interface ResolvedAddon {
  id: number
  is_enabled: number
  price_override: number | null
  name: string
  control_type: string
  price_mode: string
  default_price: number
  category: string
  max_quantity: number | null
}

// ─── 核心计算 ───

export function calculateStylePrice(artistId: number, opts: CalculateStylePriceOpts): StylePriceResult {
  const { styleSizeId, addons = [], discountCode = null } = opts

  // 1. 验证尺寸存在且属于该画师的活跃画风
  const size = db.prepare(`
    SELECT ss.*, s.artist_id, s.is_active, s.name AS style_name
    FROM style_sizes ss
    JOIN art_styles s ON s.id = ss.art_style_id
    WHERE ss.id = ?
  `).get(styleSizeId) as {
    id: number; art_style_id: number; name: string; base_price: number
    artist_id: number; is_active: number; style_name: string; display_status: string
  } | undefined

  if (!size) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404)
  if (size.artist_id !== artistId) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404)
  if (!size.is_active) throw new AppError(E.STYLE_NOT_FOUND, 404, { hint: '画风已停用' })
  // v49 (REQ-036): 尺寸三态——showcase/closed 不允许算价（防 F12 直调）
  if (size.display_status && size.display_status !== 'available') {
    throw new AppError(E.STYLE_SIZE_NOT_AVAILABLE, 400, { displayStatus: size.display_status })
  }

  // 2. 基础价入整数分（公式链起点，后续所有百分比金额以此为基准）
  const baseCents = Math.round(size.base_price * 100)
  const styleId = size.art_style_id

  // 3. 增项遍历（去重 + 归属/启用/尺寸隐藏校验 + 分类累计）
  const fixedAddonItems: FixedAddonLine[] = []
  const percentAddonItems: PercentAddonLine[] = []
  let fixedTotalCents = 0
  let percentTotalCents = 0
  let usageSelection: { line: ResolvedAddon; percent: number } | null = null
  let rushSelection: { line: ResolvedAddon; percent: number } | null = null

  const seenIds = new Set<number>()
  for (const sel of addons) {
    if (seenIds.has(sel.styleAddonId)) {
      throw new AppError(E.VALIDATION, 400, { reason: 'styleAddonId ' + sel.styleAddonId + ' 重复提交' })
    }
    seenIds.add(sel.styleAddonId)

    const sa = db.prepare(`
      SELECT sa.id, sa.is_enabled, sa.price_override,
             COALESCE(sa.tpl_name, at.name) AS name,
             COALESCE(sa.tpl_control_type, at.control_type) AS control_type,
             COALESCE(sa.tpl_price_mode, at.price_mode) AS price_mode,
             COALESCE(sa.tpl_default_price, at.default_price) AS default_price,
             COALESCE(sa.tpl_category, at.category) AS category,
             COALESCE(sa.tpl_max_quantity, at.max_quantity) AS max_quantity
      FROM style_addons sa
      LEFT JOIN addon_templates at ON at.id = sa.addon_template_id
      WHERE sa.id = ? AND sa.art_style_id = ?
    `).get(sel.styleAddonId, styleId) as ResolvedAddon | undefined

    if (!sa) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { styleAddonId: sel.styleAddonId })
    if (!sa.is_enabled) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { hint: '该增项在此画风下已禁用' })

    // 尺寸隐藏检查
    const override = db.prepare(
      'SELECT * FROM size_addon_overrides WHERE style_size_id = ? AND style_addon_id = ?'
    ).get(styleSizeId, sel.styleAddonId) as { price_override: number | null; is_hidden: number } | undefined
    if (override?.is_hidden) {
      throw new AppError(E.VALIDATION, 400, { reason: '增项 "' + sa.name + '" 在此尺寸下不可用' })
    }

    // 价格优先级：尺寸覆盖 > 画风覆盖 > 模板默认价
    let unitPrice: number
    let source: PriceSource
    if (override?.price_override != null) {
      unitPrice = override.price_override
      source = 'size_override'
    } else if (sa.price_override != null) {
      unitPrice = sa.price_override
      source = 'style_override'
    } else {
      unitPrice = sa.default_price
      source = 'template_default'
    }
    if (unitPrice < 0) throw new AppError(E.VALIDATION, 400, { hint: '增项 "' + sa.name + '" 价格不能为负' })

    // 数量解析（switch 恒 1；quantity 校验上限）
    let quantity = 1
    if (sa.control_type === 'quantity') {
      quantity = sel.quantity ?? 1
      const qtyMax = sa.max_quantity ?? 99
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > qtyMax) {
        throw new AppError(E.VALIDATION, 400, { field: 'quantity', hint: `数量范围 1-${qtyMax}` })
      }
    }

    // ─── 分类入公式链 ───
    if (sa.category === 'usage' || sa.category === 'rush') {
      // SPEC-PRICE-2：用途/加急必须是百分比计价，且各只生效一个（互斥校验）
      if (sa.price_mode !== 'percent') {
        throw new AppError(E.VALIDATION, 400, { hint: '用途/加急增项必须是百分比计价' })
      }
      const pct = Math.round(unitPrice)
      const selection = { line: sa, percent: pct }
      if (sa.category === 'usage') {
        if (usageSelection) throw new AppError(E.ADDON_SELECTION_MUTEX, 400)
        usageSelection = selection
      } else {
        if (rushSelection) throw new AppError(E.ADDON_SELECTION_MUTEX, 400)
        rushSelection = selection
      }
      continue
    }

    // category=add：按计价方式分别累计（百分比金额只基于基础价——铁律 3）
    if (sa.price_mode === 'percent') {
      const pct = Math.round(unitPrice)
      if (pct < 0) throw new AppError(E.VALIDATION, 400, { hint: '增项 "' + sa.name + '" 百分比不能为负' })
      const amountCents = Math.round(baseCents * pct / 100) * quantity
      percentTotalCents += amountCents
      percentAddonItems.push({ name: sa.name, quantity, percent: pct, amountCents, source })
    } else {
      const unitCents = Math.round(unitPrice * 100)
      const amountCents = unitCents * quantity
      fixedTotalCents += amountCents
      fixedAddonItems.push({ name: sa.name, quantity, unitCents, amountCents, source })
    }
  }

  // 4. 小计 = 基础价 + 固定增项合计 + 百分比增项合计（整数分加法，无损）
  const subtotalCents = baseCents + fixedTotalCents + percentTotalCents

  // 5. 用途倍率 → 加急倍率（顺序不可颠倒；因子用整数 (100+pct) 避免浮点）
  let usage: MultiplierLine | null = null
  let afterUsageCents = subtotalCents
  if (usageSelection) {
    afterUsageCents = Math.round(subtotalCents * (100 + usageSelection.percent) / 100)
    usage = { name: usageSelection.line.name, percent: usageSelection.percent, incrementCents: afterUsageCents - subtotalCents }
  }

  let rush: MultiplierLine | null = null
  let afterMultipliersCents = afterUsageCents
  if (rushSelection) {
    afterMultipliersCents = Math.round(afterUsageCents * (100 + rushSelection.percent) / 100)
    rush = { name: rushSelection.line.name, percent: rushSelection.percent, incrementCents: afterMultipliersCents - afterUsageCents }
  }

  // 6. 折扣（最后应用；percent 向下取整 / fixed 不超过总价，语义沿用 discount.service）
  let discount: StylePriceResult['discount'] = null
  let discountCents = 0
  if (discountCode) {
    const dc = validateDiscountCode(artistId, discountCode)
    discountCents = computeDiscountCents(dc, afterMultipliersCents)
    discount = { code: dc.code, type: dc.discount_type, value: dc.discount_value, amountCents: discountCents }
  }

  // 7. 最终总价
  const totalCents = afterMultipliersCents - discountCents

  return {
    styleName: size.style_name,
    sizeName: size.name,
    baseCents,
    fixedAddonItems,
    percentAddonItems,
    subtotalCents,
    usage,
    rush,
    afterMultipliersCents,
    discount,
    totalCents
  }
}
