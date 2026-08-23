// ============================================
// 输入校验工具（跨 feature 共用）
// ============================================

const LIMITS: Record<string, number> = {
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
 * 画师子域名保留词（与 admin 建号 / setup / invite 三处共用，防系统路径与
 * getAllArtists 的 subdomain='system' 隐身行冲突）。改动后三处写入口同步生效。
 */
export const RESERVED_SUBDOMAINS: readonly string[] = [
  'admin', 'api', 'www', 'uploads', 'static', 'login', 'assets', 'dashboard', 'app', 'system'
]

/**
 * P1-B: 按 code point 截断字符串（避免 emoji/中文 surrogate pair 被切半）
 */
function countCodePoints(str: string): number {
  return [...str].length
}

/**
 * 截断字符串到安全长度，返回清理后的值
 */
export function clamp(value: unknown, type: string): string | null {
  if (value == null) return null
  const str = String(value).trim()
  const max = LIMITS[type] || 500
  if (countCodePoints(str) <= max) return str
  // 按 code point 截断，不会在 surrogate pair 中间切开
  return [...str].slice(0, max).join('')
}

/**
 * 校验 QQ 号格式（5-15位数字）
 */
export function isValidQq(qq: unknown): boolean {
  return /^\d{5,15}$/.test(String(qq || ''))
}

/**
 * 校验画师身份码格式（2-20位大写字母/数字）
 * 用于订单号前缀，如 ALICE、QY、ART01
 * 823 标识/身份码规则对齐批：上限 10→20（与主页标识同长）——身份码由标识大写派生，
 * 订单号取最后一个短横拆流水号（generateOrderNo lastIndexOf），对码长零依赖
 */
export function isValidArtistCode(code: unknown): boolean {
  return /^[A-Z0-9]{2,20}$/.test(String(code || ''))
}
