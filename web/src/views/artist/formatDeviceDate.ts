/**
 * F0287: 账号安全页设备/密钥时间的展示格式化。
 * 口径与同仓 F0277 parseDeadlineDate 完全一致：
 *   - 含 'T' 的串（ISO-Z / 带时区偏移）原样交给 new Date，浏览器按绝对时刻解析；
 *   - 仅 SQLite 空格格式（'YYYY-MM-DD HH:MM:SS'）补 T+Z 按 UTC 解析。
 * 切勿先剥 Z 再判断 includes('T')——那样 ISO-Z 串会丢掉时区被当本地时间，反向偏 8 小时。
 */
/** 仅做时间串归一化（供单测断言解析出的绝对时刻） */
export function normalizeDeviceDate(dateStr: string): string {
  return dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z'
}

export function formatDeviceDate(dateStr: string): string {
  if (!dateStr) return ''
  const normalized = normalizeDeviceDate(dateStr)
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
