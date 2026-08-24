// 巡检修复批 D14: 金额分 → 元 统一工具（原 7 处组件内重复实现，抽为单一来源）
// 817 科学计数法消毒（用户反馈「到处都有」）：全部展示函数内部统一消毒，
// 非法/非有限输入归 0，极大值不输出 e+ 形态（一处修全局受益）

/** 非有限值（NaN/±Infinity/非法字符串）→ 0，否则归一化为数值 */
function toFiniteNumber(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 数值 → 普通定点字符串（绝不输出 e/E）：先 toFixed 定精度，
 * 极大值（≥1e21）toFixed 自身会退化为科学计数法，此处手动展开兜底
 */
function toPlainFixed(n: number, decimals: number): string {
  const s = n.toFixed(decimals)
  if (!s.includes('e') && !s.includes('E')) return s
  const sign = s.startsWith('-') ? '-' : ''
  const [mantissa, expStr] = (sign ? s.slice(1) : s).split(/[eE]/)
  const exp = Number(expStr)
  const [intPart, fracPart = ''] = mantissa.split('.')
  const digits = intPart + fracPart
  const pointPos = intPart.length + exp
  if (pointPos >= digits.length) return sign + digits + '0'.repeat(pointPos - digits.length)
  if (pointPos <= 0) return sign + '0'
  return sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos)
}

/** 整数裁剪输出：整数不带小数、非整数保留两位（均为普通定点，无科学计数法） */
function toPlainTrimmed(n: number): string {
  return Number.isInteger(n) ? toPlainFixed(n, 0) : toPlainFixed(n, 2)
}

/**
 * 金额分 → 元字符串（后端返分，前端 /100；与旧各组件本地 formatCents 同款）
 * @param {number|string|null|undefined} cents 金额（分）
 * @returns {string} 两位小数字符串
 */
export function formatCents(cents: number | string | null | undefined): string {
  // a3: Number 归一化——'abc'/NaN 等非法输入统一按 0 处理，不再输出 'NaN'
  // 817: 极大分值（≥1e23）toFixed 退化科学计数法，走普通定点展开
  return toPlainFixed(toFiniteNumber(cents) / 100, 2)
}

/**
 * 元 → 分（b1: 各组件散落的 Math.round(x*100) 收口；非法输入按 0）
 * @param {number|string|null|undefined} yuan 金额（元）
 * @returns {number} 分（整数）
 */
export function yuanToCents(yuan: number | string | null | undefined): number {
  const n = Number(yuan)
  return Math.round((Number.isNaN(n) ? 0 : n) * 100)
}

/** 金额分 → 「¥元」字符串（¥ 前缀 + formatCents；负数输出 ¥-12.00，与旧各点 `¥{{ (x/100).toFixed(2) }}` 等价） */
export function formatYuan(cents: number | string | null | undefined): string {
  return `¥${formatCents(cents)}`
}

/**
 * 元源金额 → 「¥元」字符串（整数裁剪：整数 ¥80，非整数两位小数 ¥80.50）
 * NaN/null/undefined 按 0 处理；负数输出 ¥-12.00（¥ 在负号前，与 formatYuan 形态一致）
 * @param {number|string|null|undefined} yuan 金额（元）
 * @returns {string}
 */
export function formatYuanValue(yuan: number | string | null | undefined): string {
  const v = toFiniteNumber(yuan ?? 0)
  if (v < 0) return `¥${toPlainFixed(v, 2)}`
  return `¥${toPlainTrimmed(v)}`
}

/**
 * 增项价格展示文本（自 addon-utils.formatPrice 迁入，命名 formatAddonPrice）
 * - percent: +N%（整数百分比）
 * - quantity: ¥N/单位（813-fq-tail-shared 战役 S：单位文案由调用方按 i18n 传入，
 *   保持纯函数、不再内置中文「位」；unitLabel 缺省为 '' 时省略斜杠单位，避免「¥80/」半截）
 * - fixed: ¥N
 */
export function formatAddonPrice(price: number | string | null | undefined, priceMode: string | null | undefined, { controlType = null, unitLabel = '' }: { controlType?: string | null, unitLabel?: string } = {}): string {
  const n = toFiniteNumber(price ?? 0)
  if (priceMode === 'percent') return `+${toPlainTrimmed(n)}%`
  if (controlType === 'quantity') return unitLabel ? `¥${toPlainTrimmed(n)}/${unitLabel}` : `¥${toPlainTrimmed(n)}`
  return `¥${toPlainTrimmed(n)}`
}

/**
 * 金额（分）→ 展示文本（自 addon-utils.formatCents 迁入，命名 formatYuanTrimmed）：¥ 前缀 + 整数裁剪
 * 整数不带小数（¥80），非整数保留两位（¥80.50）；与 formatCents（裸两位小数）语义不同，勿互替
 */
export function formatYuanTrimmed(cents: number | string | null | undefined): string {
  const yuan = toFiniteNumber(cents ?? 0) / 100
  return `¥${toPlainTrimmed(yuan)}`
}
