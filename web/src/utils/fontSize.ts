/**
 * 后台字号（818-A：滑块式 14~20px，7 档整数吸附，默认 15px，用户拍板 2026-08-17）
 *
 * 单一事实源：Preferences.vue（el-slider 写）与 ArtistLayout.vue（挂载时应用）
 * 共用本模块，避免两处映射口径漂移。
 *
 * 存储契约：localStorage `huiyue_admin_font_size` 存数字字符串 '14'~'20'；
 * 旧三档值（large/xlarge/normal）在读时映射——large→15、xlarge→17、
 * normal/无值/非法→15（新默认）。默认 15 也显式设 dataset.fontSize='15'
 * （15≠14 基线，不设会回退到旧默认）。
 */
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage.js'

export const FONT_SIZE_KEY = 'huiyue_admin_font_size'
export const FONT_SIZE_MIN = 14
export const FONT_SIZE_MAX = 20
export const FONT_SIZE_DEFAULT = 15

/** 旧三档 radio 值 → 新数字档（large→15、xlarge→17；normal 走默认 15） */
const LEGACY_VALUE_MAP: Record<string, string> = { large: '15', xlarge: '17' }

/** 归一化为 14~20 整数档；旧值/无值/非法一律落回默认 15 */
export function normalizeFontSize(value: string | number | null | undefined): number {
  if (Object.prototype.hasOwnProperty.call(LEGACY_VALUE_MAP, String(value))) {
    return Number(LEGACY_VALUE_MAP[String(value)])
  }
  const n = Number(value)
  if (Number.isInteger(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) {
    return n
  }
  return FONT_SIZE_DEFAULT
}

/** 读取 localStorage 并归一化（存储不可用时 safeGetItem 返回 null → 默认 15） */
export function readFontSize(): number {
  return normalizeFontSize(safeGetItem(FONT_SIZE_KEY))
}

/** 写入 localStorage（统一存数字字符串 '14'~'20'），返回归一化后的档位 */
export function writeFontSize(size: string | number | null | undefined): number {
  const n = normalizeFontSize(size)
  safeSetItem(FONT_SIZE_KEY, String(n))
  return n
}

/** 应用到 documentElement.dataset.fontSize（默认 15 也显式设置），返回归一化档位 */
export function applyFontSize(size: string | number | null | undefined): number {
  const n = normalizeFontSize(size)
  document.documentElement.dataset.fontSize = String(n)
  return n
}

/** 清理：移除存储并摘掉 dataset（新模型正常路径不再需要，保留给异常/未来清理场景） */
export function clearFontSize(): void {
  safeRemoveItem(FONT_SIZE_KEY)
  delete document.documentElement.dataset.fontSize
}
