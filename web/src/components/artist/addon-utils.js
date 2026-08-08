// REQ-036 批A: 增项交互直觉化重构 —— 共享工具（池子/胶囊/摘要/弹窗共用）
// 仅放纯函数；组件状态留在各组件内
// ⚠️ 倍率 kind（multiply）为批B后端字段，本批前端只预留 mul 样式分支，不产生 multiply 数据

/** 控件类型中文标签（与 AddonTemplateManager 一致） */
export function controlLabel(t, type) {
  return { switch: t('styleManage.tplControlSwitch'), quantity: t('styleManage.tplControlQuantity'), radio: t('styleManage.tplControlRadio') }[type] || type
}

/** 控件类型 el-tag type（与 AddonTemplateManager 一致） */
export function controlTagType(type) {
  return { switch: 'info', quantity: 'primary', radio: 'warning' }[type] || 'info'
}

/** 数量型单位标签：优先模板 unit_label，默认「位」（原型用词） */
export function unitLabelOf(sa) {
  return sa.template_unit_label || sa.unit_label || '位'
}

/**
 * 增项价格文本（池子胶囊 / 摘要 chip / 预览明细）
 * - 数量型: ¥80/位（per_unit）
 * - 其他:   ¥50
 * - 倍率批B后: +50%（kind=multiply 时调用方自己拼，本函数不处理）
 */
export function formatAddonPrice(price, pricingMode, unitLabel) {
  const n = price ?? 0
  if (pricingMode === 'per_unit') {
    return `¥${n}/${unitLabel || '位'}`
  }
  return `¥${n}`
}

/**
 * 画风增项当前生效价格（价格优先级：本尺寸 > 画风价 > 本身价）
 * @param {object} sa style_addons 行（含 price_override / template_default_price / template_pricing_mode）
 * @param {number|null} sizePriceOverride 本尺寸差异价（可选）
 */
export function effectivePrice(sa, sizePriceOverride) {
  const price = sizePriceOverride ?? sa.price_override ?? sa.template_default_price
  return price ?? 0
}

/** 摘要/胶囊形态：qty=数量 / add=加法 / mul=倍率（批B预留） */
export function addonKind(sa) {
  if (sa.template_pricing_mode === 'per_unit') return 'qty'
  // 批B kind=multiply 出现后前端按此分支渲染倍率样式；本批无 multiply 数据，永不命中
  if (sa.template_kind === 'multiply') return 'mul'
  return 'add'
}
