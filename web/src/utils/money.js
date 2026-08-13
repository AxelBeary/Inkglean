// 巡检修复批 D14: 金额分 → 元 统一工具（原 7 处组件内重复实现，抽为单一来源）
/**
 * 金额分 → 元字符串（后端返分，前端 /100；与旧各组件本地 formatCents 同款，零行为变化）
 * @param {number|string|null|undefined} cents 金额（分）
 * @returns {string} 两位小数字符串
 */
export function formatCents(cents) {
  // a3: Number 归一化——'abc'/NaN 等非法输入统一按 0 处理，不再输出 'NaN'
  const n = Number(cents)
  return ((Number.isNaN(n) ? 0 : n) / 100).toFixed(2)
}

/**
 * 元 → 分（b1: 各组件散落的 Math.round(x*100) 收口；非法输入按 0）
 * @param {number|string|null|undefined} yuan 金额（元）
 * @returns {number} 分（整数）
 */
export function yuanToCents(yuan) {
  const n = Number(yuan)
  return Math.round((Number.isNaN(n) ? 0 : n) * 100)
}

/** 金额分 → 「¥元」字符串（¥ 前缀 + formatCents；负数输出 ¥-12.00，与旧各点 `¥{{ (x/100).toFixed(2) }}` 等价） */
export function formatYuan(cents) {
  return `¥${formatCents(cents)}`
}

/**
 * 元源金额 → 「¥元」字符串（整数裁剪：整数 ¥80，非整数两位小数 ¥80.50）
 * NaN/null/undefined 按 0 处理；负数输出 ¥-12.00（¥ 在负号前，与 formatYuan 形态一致）
 * @param {number|string|null|undefined} yuan 金额（元）
 * @returns {string}
 */
export function formatYuanValue(yuan) {
  const n = Number(yuan ?? 0)
  const v = Number.isNaN(n) ? 0 : n
  if (v < 0) return `¥${v.toFixed(2)}`
  return Number.isInteger(v) ? `¥${v}` : `¥${v.toFixed(2)}`
}

/**
 * 增项价格展示文本（自 addon-utils.formatPrice 迁入，命名 formatAddonPrice）
 * - percent: +N%（整数百分比）
 * - quantity: ¥N/单位（813-fq-tail-shared 战役 S：单位文案由调用方按 i18n 传入，
 *   保持纯函数、不再内置中文「位」；unitLabel 缺省为 '' 时省略斜杠单位，避免「¥80/」半截）
 * - fixed: ¥N
 */
export function formatAddonPrice(price, priceMode, { controlType = null, unitLabel = '' } = {}) {
  const n = price ?? 0
  if (priceMode === 'percent') return `+${n}%`
  if (controlType === 'quantity') return unitLabel ? `¥${n}/${unitLabel}` : `¥${n}`
  return `¥${n}`
}

/**
 * 金额（分）→ 展示文本（自 addon-utils.formatCents 迁入，命名 formatYuanTrimmed）：¥ 前缀 + 整数裁剪
 * 整数不带小数（¥80），非整数保留两位（¥80.50）；与 formatCents（裸两位小数）语义不同，勿互替
 */
export function formatYuanTrimmed(cents) {
  const yuan = (cents ?? 0) / 100
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(2)}`
}
