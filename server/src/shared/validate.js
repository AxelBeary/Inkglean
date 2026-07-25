// ============================================
// 输入校验工具（跨 feature 共用）
// ============================================

const LIMITS = {
  qq: 15,
  name: 50,
  subdomain: 20,
  description: 2000,
  note: 1000,
  bio: 500,
  rules: 10000,
  url: 500
}

/**
 * 截断字符串到安全长度，返回清理后的值
 */
export function clamp(value, type) {
  if (value == null) return null
  const str = String(value)
  const max = LIMITS[type] || 500
  return str.length > max ? str.slice(0, max) : str
}

/**
 * 校验 QQ 号格式（5-15位数字）
 */
export function isValidQq(qq) {
  return /^\d{5,15}$/.test(String(qq || ''))
}
