// SPEC-PRICE-2 共享纯函数（池子/胶囊/摘要/弹窗/预览共用）
// 后端契约（v50）：addon_templates 三维——
//   control_type ∈ {switch, quantity}（开关类/个数类）
//   price_mode   ∈ {fixed, percent}（固定金额 ¥N / 百分比 +N%）
//   category     ∈ {add, usage, rush}（普通增项 / 用途 / 加急）
// style_addons 返回 template_* 快照字段（template_price_mode / template_category / ...）
// 铁律：分类只读后端真实字段，禁止任何名称约定推导。
// 仅放纯函数；组件状态留在各组件内。
import { formatAddonPrice, yuanToCents } from '../../utils/money.js'

/** i18n 翻译函数最小签名 */
type TFunc = (key: string) => string

/** style_addons 行宽松形状（含 template_* 快照字段与 price_override） */
export interface StyleAddonRow {
  id: number
  is_enabled?: number | boolean | null
  template_name?: string | null
  template_price_mode?: string | null
  template_control_type?: string | null
  template_unit_label?: string | null
  template_category?: string | null
  template_default_price?: number | null
  unit_label?: string | null
  category?: string | null
  price_override?: number | null
}

/** 控件类型中文标签 */
export function controlLabel(t: TFunc, type: string) {
  return ({ switch: t('styleManage.tplControlSwitch'), quantity: t('styleManage.tplControlQuantity') } as Record<string, string>)[type] || type
}

/** 控件类型 el-tag type */
export function controlTagType(type: string) {
  return ({ switch: 'info', quantity: 'primary' } as Record<string, string>)[type] || 'info'
}

/** 增项类别：读后端真实字段（template_category / category），兜底 add */
export function addonCategory(sa?: { template_category?: string | null; category?: string | null } | null): 'add' | 'usage' | 'rush' {
  const cat = sa?.template_category ?? sa?.category
  return cat === 'usage' || cat === 'rush' ? cat : 'add'
}

/** 类别标签（池内分组标题 / 胶囊分类徽标） */
export function categoryLabel(t: TFunc, cat: string) {
  return ({ add: t('styleManage.catAdd'), usage: t('styleManage.catUsage'), rush: t('styleManage.catRush') } as Record<string, string>)[cat] || cat
}

/** 数量型单位标签：优先模板 unit_label，默认「位」 */
export function unitLabelOf(sa?: { template_unit_label?: string | null; unit_label?: string | null } | null, t?: TFunc | null) {
  return sa?.template_unit_label || sa?.unit_label || (t ? t('styleManage.unitDefault') : '位')
}

/**
 * 画风增项当前生效价格（价格优先级：本尺寸 > 画风价 > 本身价）
 * @param sa style_addons 行（含 price_override / template_default_price）
 * @param sizePriceOverride 本尺寸差异价（可选）
 */
export function effectivePrice(sa: StyleAddonRow, sizePriceOverride?: number | null) {
  const price = sizePriceOverride ?? sa.price_override ?? sa.template_default_price
  return price ?? 0
}

/** 增项生效价展示文本（组合 effectivePrice + formatPrice） */
export function addonPriceText(sa: StyleAddonRow, sizePriceOverride: number | null | undefined, t?: TFunc | null) {
  return formatAddonPrice(effectivePrice(sa, sizePriceOverride), sa.template_price_mode, {
    controlType: sa.template_control_type,
    unitLabel: unitLabelOf(sa, t)
  })
}

/** 摘要/胶囊形态（三种计价形态视觉区分）：pct=百分比 / qty=数量 / add=加法 */
export function addonChipKind(sa: StyleAddonRow) {
  if (sa.template_price_mode === 'percent') return 'pct'
  if (sa.template_control_type === 'quantity') return 'qty'
  return 'add'
}

/**
 * 尺寸预览计算（顾客视角，与后端 calculateStylePrice 严格同公式、全程整数分）：
 * 最终价格 = (基础价 + Σ固定增项 + Σ百分比增项[只基于基础价]) × 用途 × 加急 × 折扣
 * 预览场景不含折扣；用途/加急由顾客下单时各选一个 → 作为可选项返回展示。
 * 数量型增项数量由顾客下单时决定 → 预估按 ×1 计入并在 UI 标注。
 */
export function computeSizePreview(
  style: { addons?: StyleAddonRow[] } | null | undefined,
  size: { base_price?: number | null; _overrides?: Record<number, { is_hidden?: number | boolean | null; price_override?: number | null }> | null } | null | undefined
) {
  const baseCents = Math.round((size?.base_price || 0) * 100)
  const ov = size?._overrides || {}
  const visible = (style?.addons || []).filter(sa => !!sa.is_enabled && !(ov[sa.id]?.is_hidden))

  const fixedItems: { id: number; name: string | null | undefined; quantity: number; isQuantityControl: boolean; unitCents: number; amountCents: number }[] = []
  const percentItems: { id: number; name: string | null | undefined; percent: number; amountCents: number }[] = []
  const usageOptions: { id: number; name: string | null | undefined; percent: number }[] = []
  const rushOptions: { id: number; name: string | null | undefined; percent: number }[] = []
  let fixedCents = 0
  let percentCents = 0

  for (const sa of visible) {
    const price = effectivePrice(sa, ov[sa.id]?.price_override ?? null)
    const cat = addonCategory(sa)
    const percent = Math.round(price)

    if (cat === 'usage') {
      usageOptions.push({ id: sa.id, name: sa.template_name, percent })
      continue
    }
    if (cat === 'rush') {
      rushOptions.push({ id: sa.id, name: sa.template_name, percent })
      continue
    }
    if (sa.template_price_mode === 'percent') {
      // 铁律：百分比增项金额 = 百分比 × 基础价（不基于含其他增项的小计）
      const amountCents = Math.round(baseCents * percent / 100)
      percentCents += amountCents
      percentItems.push({ id: sa.id, name: sa.template_name, percent, amountCents })
    } else {
      // 数量型预估按 ×1（顾客下单时选数量）；开关型恒 ×1
      const unitCents = yuanToCents(price)
      fixedCents += unitCents
      fixedItems.push({
        id: sa.id,
        name: sa.template_name,
        quantity: 1,
        isQuantityControl: sa.template_control_type === 'quantity',
        unitCents,
        amountCents: unitCents
      })
    }
  }

  return {
    baseCents,
    fixedItems,
    percentItems,
    subtotalCents: baseCents + fixedCents + percentCents,
    usageOptions,
    rushOptions
  }
}
