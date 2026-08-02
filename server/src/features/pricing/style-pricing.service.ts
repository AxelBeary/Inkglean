import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { validateDiscountCode, computeDiscountCents } from './discount.service.js'

// ============================================
// 多画风价格计算引擎 - calculate-style-price
// REQ-023 Phase 2
// 公式：总价 = (尺寸基础价 + Σ增项总价) × Π通用倍率 - 折扣金额
// 折扣顺序：先倍率后折扣（REQ-023 已定）
// ============================================

// ─── 类型 ───

interface AddonSelection {
  styleAddonId: number
  quantity?: number
  optionLabel?: string
}

interface CalculateStylePriceOpts {
  styleSizeId: number
  addons?: AddonSelection[]
  usageMultiplierId?: number | null
  rushMultiplierId?: number | null
  discountCode?: string | null
}

interface AddonLineItem {
  name: string
  quantity: number
  unitPrice: number
  amount: number
  source: 'size_override' | 'style_override' | 'template_default'
}

export interface StylePriceResult {
  styleName: string
  sizeName: string
  basePrice: number
  addonItems: AddonLineItem[]
  subtotal: number
  usageMultiplier: { name: string; factor: number } | null
  rushMultiplier: { name: string; factor: number } | null
  multiplierTotal: number
  discount: { code: string; type: string; value: number; amount: number } | null
  totalPrice: number
  totalPriceCents: number
}

// ─── 核心计算 ───

export function calculateStylePrice(artistId: number, opts: CalculateStylePriceOpts): StylePriceResult {
  const { styleSizeId, addons = [], usageMultiplierId = null, rushMultiplierId = null, discountCode = null } = opts

  // 1. 验证尺寸存在且属于该画师的活跃画风
  const size = db.prepare(`
    SELECT ss.*, s.artist_id, s.is_active, s.name AS style_name
    FROM style_sizes ss
    JOIN art_styles s ON s.id = ss.art_style_id
    WHERE ss.id = ?
  `).get(styleSizeId) as {
    id: number; art_style_id: number; name: string; base_price: number; sort_order: number
    artist_id: number; is_active: number; style_name: string
  } | undefined

  if (!size) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404)
  if (size.artist_id !== artistId) throw new AppError(E.STYLE_SIZE_NOT_FOUND, 404)
  if (!size.is_active) throw new AppError(E.STYLE_NOT_FOUND, 404, { hint: '画风已停用' })

  const basePrice = size.base_price
  const styleId = size.art_style_id

  // 2. 增项计算
  const addonItems: AddonLineItem[] = []
  let addonTotal = 0

  // 去重校验
  const seenIds = new Set<number>()
  for (const sel of addons) {
    if (seenIds.has(sel.styleAddonId)) {
      throw new AppError(E.VALIDATION, 400, { reason: 'styleAddonId ' + sel.styleAddonId + ' 重复提交' })
    }
    seenIds.add(sel.styleAddonId)

    // 查画风增项（含模板信息）
    const sa = db.prepare(`
      SELECT sa.*, at.name AS tpl_name, at.control_type, at.pricing_mode,
             at.default_price AS tpl_default_price, at.options AS tpl_options, at.unit_label
      FROM style_addons sa
      JOIN addon_templates at ON at.id = sa.addon_template_id
      WHERE sa.id = ? AND sa.art_style_id = ?
    `).get(sel.styleAddonId, styleId) as {
      id: number; art_style_id: number; addon_template_id: number
      is_enabled: number; price_override: number | null; options_override: string | null
      tpl_name: string; control_type: string; pricing_mode: string
      tpl_default_price: number; tpl_options: string | null; unit_label: string | null
    } | undefined

    if (!sa) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { styleAddonId: sel.styleAddonId })
    if (!sa.is_enabled) throw new AppError(E.STYLE_ADDON_NOT_FOUND, 404, { hint: '该增项在此画风下已禁用' })

    // 检查尺寸隐藏
    const override = db.prepare(
      'SELECT * FROM size_addon_overrides WHERE style_size_id = ? AND style_addon_id = ?'
    ).get(styleSizeId, sel.styleAddonId) as { id: number; price_override: number | null; is_hidden: number } | undefined

    if (override?.is_hidden) {
      throw new AppError(E.VALIDATION, 400, { reason: '增项 "' + sa.tpl_name + '" 在此尺寸下不可用' })
    }

    // 价格优先级：尺寸覆盖 > 画风覆盖 > 模板默认价
    let unitPrice: number
    let source: AddonLineItem['source']
    if (override?.price_override != null) {
      unitPrice = override.price_override
      source = 'size_override'
    } else if (sa.price_override != null) {
      unitPrice = sa.price_override
      source = 'style_override'
    } else {
      unitPrice = sa.tpl_default_price
      source = 'template_default'
    }

    // 按控件类型计价
    let quantity = 1
    let lineTotal: number

    if (sa.control_type === 'switch') {
      // switch: price × 1
      lineTotal = unitPrice
    } else if (sa.control_type === 'quantity') {
      // quantity: price × quantity
      quantity = sel.quantity ?? 1
      if (quantity < 1 || quantity > 99) {
        throw new AppError(E.VALIDATION, 400, { field: 'quantity', hint: '数量范围 1-99' })
      }
      lineTotal = unitPrice * quantity
    } else if (sa.control_type === 'radio') {
      // radio: 选中选项的 price
      if (!sel.optionLabel) {
        throw new AppError(E.VALIDATION, 400, { field: 'optionLabel', hint: 'radio 类型必须选择选项' })
      }
      // 选项来源：options_override > tpl_options
      const optionsJson = sa.options_override ?? sa.tpl_options
      if (!optionsJson) {
        throw new AppError(E.VALIDATION, 400, { hint: '增项 "' + sa.tpl_name + '" 未配置选项' })
      }
      let options: Array<{ label: string; price: number }>
      try {
        options = JSON.parse(optionsJson)
      } catch {
        throw new AppError(E.VALIDATION, 400, { hint: '增项选项格式错误' })
      }
      const matched = options.find(o => o.label === sel.optionLabel)
      if (!matched) {
        throw new AppError(E.VALIDATION, 400, { hint: '选项 "' + sel.optionLabel + '" 不存在' })
      }
      unitPrice = matched.price
      lineTotal = matched.price
      source = (sa.options_override != null || override?.price_override != null) ? source : source
      // radio 选项价格直接来自选项，source 保持价格层级的来源
    } else {
      lineTotal = unitPrice
    }

    addonTotal += lineTotal
    addonItems.push({
      name: sa.tpl_name,
      quantity,
      unitPrice,
      amount: lineTotal,
      source
    })
  }

  // 3. 小计
  const subtotal = basePrice + addonTotal

  // 4. 用途倍率（取最高，不叠加——与现有 calculatePrice 逻辑一致）
  let usageMultiplier: { name: string; factor: number } | null = null
  let usageFactor = 1.0
  if (usageMultiplierId) {
    const um = db.prepare(
      "SELECT * FROM price_multipliers WHERE id = ? AND artist_id = ? AND type = 'usage' AND enabled = 1"
    ).get(usageMultiplierId, artistId) as { id: number; name: string; multiplier: number } | undefined
    if (!um) throw new AppError(E.MULTIPLIER_NOT_FOUND, 404)
    usageFactor = um.multiplier
    usageMultiplier = { name: um.name, factor: um.multiplier }
  }

  // 5. 加急倍率
  let rushMultiplier: { name: string; factor: number } | null = null
  let rushFactor = 1.0
  if (rushMultiplierId) {
    const rm = db.prepare(
      "SELECT * FROM price_multipliers WHERE id = ? AND artist_id = ? AND type = 'rush' AND enabled = 1"
    ).get(rushMultiplierId, artistId) as { id: number; name: string; multiplier: number } | undefined
    if (!rm) throw new AppError(E.MULTIPLIER_NOT_FOUND, 404)
    rushFactor = rm.multiplier
    rushMultiplier = { name: rm.name, factor: rm.multiplier }
  }

  // 6. 倍率后总价
  const multiplierTotal = subtotal * usageFactor * rushFactor
  const multiplierTotalCents = Math.round(multiplierTotal * 100)

  // 7. 折扣（先倍率后折扣）
  let discount: { code: string; type: string; value: number; amount: number } | null = null
  let discountCents = 0
  if (discountCode) {
    const dc = validateDiscountCode(artistId, discountCode)
    discountCents = computeDiscountCents(dc, multiplierTotalCents)
    discount = {
      code: dc.code,
      type: dc.discount_type,
      value: dc.discount_value,
      amount: Math.round(discountCents) / 100
    }
  }

  // 8. 最终总价
  const totalPriceCents = multiplierTotalCents - discountCents
  const totalPrice = Math.round(totalPriceCents) / 100

  return {
    styleName: size.style_name,
    sizeName: size.name,
    basePrice,
    addonItems,
    subtotal: Math.round(subtotal * 100) / 100,
    usageMultiplier,
    rushMultiplier,
    multiplierTotal: Math.round(multiplierTotal * 100) / 100,
    discount,
    totalPrice,
    totalPriceCents
  }
}
