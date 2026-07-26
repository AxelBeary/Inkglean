/**
 * P2-1: 时区工具函数
 * SQLite CURRENT_TIMESTAMP 存储 UTC（格式 'YYYY-MM-DD HH:MM:SS'），
 * 前端 new Date() 默认按本地时间解析，导致偏差。
 * 此工具将 UTC 字符串正确转为本地时间显示。
 */

/**
 * 将 SQLite UTC 时间字符串格式化为本地时间
 * @param {string} str - SQLite 时间字符串（UTC）
 * @param {object} [options] - Intl.DateTimeFormat 选项
 * @returns {string} 本地化时间字符串
 */
export function formatDateTime(str, options) {
  if (!str) return ''
  const normalized = str.includes('T') ? str : str.replace(' ', 'T') + 'Z'
  const date = new Date(normalized)
  if (isNaN(date.getTime())) return str

  // R2-3: 使用浏览器默认 locale，不再硬编码 zh-CN
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  })
}

/**
 * 短格式（月-日 时:分）
 */
export function formatDateTimeShort(str) {
  return formatDateTime(str, { year: undefined })
}
