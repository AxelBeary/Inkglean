import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { validateDiscountCode, computeDiscountCents, type DiscountCode } from './discount.service.js'

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

// ─── 增项解析（F-7 第一段） ───

/** 解析后的普通增项行（价格优先级已定、数量已校验；金额由 buildPriceLines 计算） */
export interface ResolvedAddonItem {
  name: string
  price_mode: string
  unitPrice: number
  source: PriceSource
  quantity: number
}

/** 解析结果：普通增项分组 + 用途/加急各至多一个（互斥已在解析期强制） */
export interface ResolvedAddonSelection {
  addons: ResolvedAddonItem[]
  usage: { name: string; percent: number } | null
  rush: { name: string; percent: number } | null
}

/**
 * 解析增项选择（F-7（P3-31）: 原 calculateStylePrice 步骤 3 拆出）
 * 职责：去重 + 归属/启用/尺寸隐藏校验 + 数量解析 + 价格优先级 + 用途/加急分组互斥
 * 铁律转为段内校验：用途/加急各只生效一个 → 违反抛 ADDON_SELECTION_MUTEX（不再是注释约定）
 */
export function resolveSelectedAddons(styleId: number, styleSizeId: number, selections: AddonSelection[]): ResolvedAddonSelection {
  const addons: ResolvedAddonItem[] = []
  let usageSelection: { name: string; percent: number } | null = null
  let rushSelection: { name: string; percent: number } | null = null

  const seenIds = new Set<number>()
  for (const sel of selections) {
    if (seenIds.has(sel.styleAddonId)) {
      throw new AppError(E.VALIDATION, 400, { reason: 'styleAddonId ' + sel.styleAddonId + ' 重复提交' })
    }
    seenIds.add(sel.styleAddonId)

    const sa = db.prepare(`
      SELECT sa.id, sa.is_enabled, sa.price_override,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_name ELSE at.name END AS name,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_control_type ELSE at.control_type END AS control_type,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_price_mode ELSE at.price_mode END AS price_mode,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_default_price ELSE at.default_price END AS default_price,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_category ELSE at.category END AS category,
             CASE WHEN sa.addon_template_id IS NULL THEN sa.tpl_max_quantity ELSE at.max_quantity END AS max_quantity
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
      const selection = { name: sa.name, percent: pct }
      if (sa.category === 'usage') {
        if (usageSelection) throw new AppError(E.ADDON_SELECTION_MUTEX, 400)
        usageSelection = selection
      } else {
        if (rushSelection) throw new AppError(E.ADDON_SELECTION_MUTEX, 400)
        rushSelection = selection
      }
      continue
    }

    // category=add：按计价方式分派给 buildPriceLines（百分比金额只基于基础价——见下一段断言）
    if (sa.price_mode === 'percent') {
      const pct = Math.round(unitPrice)
      if (pct < 0) throw new AppError(E.VALIDATION, 400, { hint: '增项 "' + sa.name + '" 百分比不能为负' })
    }
    addons.push({ name: sa.name, price_mode: sa.price_mode, unitPrice, source, quantity })
  }

  return { addons, usage: usageSelection, rush: rushSelection }
}

// ─── 公式链构建（F-7 第二段，纯函数） ───

export interface PriceLinesResult {
  fixedAddonItems: FixedAddonLine[]
  percentAddonItems: PercentAddonLine[]
  subtotalCents: number
}

/**
 * F-7 铁律断言：百分比增项金额必须以基础价为基数（不允许基于小计/其他增项）。
 * 独立重算校验——未来若把金额计算改成基于小计，此处会抛错而不是靠注释提醒。
 * 导出供单测直接验证断言本身。
 */
export function assertPercentAmountOnBase(name: string, percent: number, quantity: number, baseCents: number, amountCents: number): void {
  const expected = Math.round(baseCents * percent / 100) * quantity
  if (!Number.isInteger(percent) || percent < 0 || amountCents !== expected) {
    throw new AppError(E.PRICING_CALC_FAILED, 500, {
      field: name,
      reason: `百分比增项「${name}」基数校验失败（金额须=基础价×${percent}%×${quantity}）`
    })
  }
}

/**
 * 构建公式链（F-7（P3-31）: 原 calculateStylePrice 步骤 4 拆出，纯整数分运算）
 * 基础价 → 固定增项（单价×数量） → 百分比增项（只按基础价，段内断言） → 小计
 */
export function buildPriceLines(baseCents: number, selection: ResolvedAddonSelection): PriceLinesResult {
  const fixedAddonItems: FixedAddonLine[] = []
  const percentAddonItems: PercentAddonLine[] = []
  let fixedTotalCents = 0
  let percentTotalCents = 0

  for (const addon of selection.addons) {
    if (addon.price_mode === 'percent') {
      const percent = Math.round(addon.unitPrice)
      const amountCents = Math.round(baseCents * percent / 100) * addon.quantity
      assertPercentAmountOnBase(addon.name, percent, addon.quantity, baseCents, amountCents)
      percentTotalCents += amountCents
      percentAddonItems.push({ name: addon.name, quantity: addon.quantity, percent, amountCents, source: addon.source })
    } else {
      const unitCents = Math.round(addon.unitPrice * 100)
      const amountCents = unitCents * addon.quantity
      fixedTotalCents += amountCents
      fixedAddonItems.push({ name: addon.name, quantity: addon.quantity, unitCents, amountCents, source: addon.source })
    }
  }

  const subtotalCents = baseCents + fixedTotalCents + percentTotalCents
  return { fixedAddonItems, percentAddonItems, subtotalCents }
}

// ─── 倍率与折扣（F-7 第三段，纯函数） ───

/** 已解析的折扣（金额在应用段基于倍率后总价计算） */
export interface ResolvedDiscount {
  code: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
}

export interface MultiplierDiscountResult {
  usage: MultiplierLine | null
  rush: MultiplierLine | null
  afterMultipliersCents: number
  discount: StylePriceResult['discount']
  totalCents: number
}

/**
 * 应用倍率与折扣（F-7（P3-31）: 原 calculateStylePrice 步骤 5-7 拆出，纯函数）
 * 顺序铁律：用途倍率 → 加急倍率 → 折扣（最后应用）；因子用整数 (100+pct) 避免浮点。
 * 顺序由本函数的结构强制：usage 基于小计、rush 基于用途后、discount 基于倍率后。
 */
export function applyMultipliersAndDiscount(
  subtotalCents: number,
  usage: { name: string; percent: number } | null,
  rush: { name: string; percent: number } | null,
  discount: ResolvedDiscount | null
): MultiplierDiscountResult {
  let usageLine: MultiplierLine | null = null
  let afterUsageCents = subtotalCents
  if (usage) {
    afterUsageCents = Math.round(subtotalCents * (100 + usage.percent) / 100)
    usageLine = { name: usage.name, percent: usage.percent, incrementCents: afterUsageCents - subtotalCents }
  }

  let rushLine: MultiplierLine | null = null
  let afterMultipliersCents = afterUsageCents
  if (rush) {
    afterMultipliersCents = Math.round(afterUsageCents * (100 + rush.percent) / 100)
    rushLine = { name: rush.name, percent: rush.percent, incrementCents: afterMultipliersCents - afterUsageCents }
  }

  let discountLine: StylePriceResult['discount'] = null
  let discountCents = 0
  if (discount) {
    // percent 向下取整 / fixed 不超过总价，语义沿用 discount.service
    discountCents = computeDiscountCents(discount as DiscountCode, afterMultipliersCents)
    discountLine = { code: discount.code, type: discount.discount_type, value: discount.discount_value, amountCents: discountCents }
  }

  return {
    usage: usageLine,
    rush: rushLine,
    afterMultipliersCents,
    discount: discountLine,
    totalCents: afterMultipliersCents - discountCents
  }
}

// ─── 核心计算（编排三段） ───

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

  // F-7（P3-31）: 三段拆分——解析增项 → 构建公式链 → 倍率/折扣
  const selection = resolveSelectedAddons(styleId, styleSizeId, addons)
  const { fixedAddonItems, percentAddonItems, subtotalCents } = buildPriceLines(baseCents, selection)

  // 折扣码先解析（应用段基于倍率后总价计算金额；错误码在应用前抛出，行为不变）
  let discount: ResolvedDiscount | null = null
  if (discountCode) {
    const dc = validateDiscountCode(artistId, discountCode)
    discount = { code: dc.code, discount_type: dc.discount_type, discount_value: dc.discount_value }
  }

  const final = applyMultipliersAndDiscount(subtotalCents, selection.usage, selection.rush, discount)

  return {
    styleName: size.style_name,
    sizeName: size.name,
    baseCents,
    fixedAddonItems,
    percentAddonItems,
    subtotalCents,
    usage: final.usage,
    rush: final.rush,
    afterMultipliersCents: final.afterMultipliersCents,
    discount: final.discount,
    totalCents: final.totalCents
  }
}
