// ============================================
// 输入校验工具（跨 feature 共用）
// ============================================

const LIMITS = {
  qq: 15,
  name: 50,
  subdomain: 20,
  artistCode: 10,
  description: 2000,
  note: 1000,
  bio: 500,
  rules: 10000,
  url: 500,
  contactQq: 15
}

/**
 * P1-B: 按 code point 截断字符串（避免 emoji/中文 surrogate pair 被切半）
 */
function countCodePoints(str) {
  return [...str].length
}

/**
 * 截断字符串到安全长度，返回清理后的值
 */
export function clamp(value, type) {
  if (value == null) return null
  const str = String(value)
  const max = LIMITS[type] || 500
  if (countCodePoints(str) <= max) return str
  // 按 code point 截断，不会在 surrogate pair 中间切开
  return [...str].slice(0, max).join('')
}

/**
 * 校验 QQ 号格式（5-15位数字）
 */
export function isValidQq(qq) {
  return /^\d{5,15}$/.test(String(qq || ''))
}

/**
 * 校验画师身份码格式（2-10位大写字母/数字）
 * 用于订单号前缀，如 ALICE、QY、ART01
 */
export function isValidArtistCode(code) {
  return /^[A-Z0-9]{2,10}$/.test(String(code || ''))
}
