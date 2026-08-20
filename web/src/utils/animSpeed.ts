/**
 * 后台动画速度（819-G：0.5×~2× 七档，step 0.25，默认 1×）+ 减少动效开关
 *
 * 单一事实源：Preferences.vue（el-slider / el-switch 写）与 ArtistLayout.vue（挂载时应用）
 * 共用本模块，避免两处映射口径漂移（对齐 818-A fontSize.js 模式）。
 *
 * 存储契约：
 *   - localStorage `huiyue_admin_anim_speed` 存字符串 '0.5'~'2'（七档，step 0.25）；
 *     旧值/无值/非法一律归一化到默认 1。默认 1 也显式设 dataset.animSpeed='1'
 *     （1≠0 基线，不设会回退到 :root 基准时长）。
 *   - localStorage `huiyue_admin_reduce_motion` 存 '1'/'0'；开启时
 *     document.documentElement.dataset.reduceMotion='on'，关闭时摘掉。
 *   - CSS 选择器锁 html[data-artist-theme]：客户端路由与登录页零影响。
 *     问候逐字洇墨走 JS 逐字时序、登录 240s 天光漂移走硬编码时长，均不依赖 --dur-*。
 */
import { safeGetItem, safeSetItem, safeRemoveItem } from './storage'

export const ANIM_SPEED_KEY = 'huiyue_admin_anim_speed'
export const ANIM_SPEED_MIN = 0.5
export const ANIM_SPEED_MAX = 2
export const ANIM_SPEED_STEP = 0.25
export const ANIM_SPEED_DEFAULT = 1
/** 七档枚举（与 artist-tokens.css 的选择器一一对应） */
export const ANIM_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export const REDUCE_MOTION_KEY = 'huiyue_admin_reduce_motion'

/** 归一化为 0.5~2 且 step 0.25 的档位；旧值/无值/非法一律落回默认 1 */
export function normalizeAnimSpeed(value: string | number | null | undefined): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return ANIM_SPEED_DEFAULT
  const stepped = Math.round(n / ANIM_SPEED_STEP) * ANIM_SPEED_STEP
  // 浮点余数清理（0.75/1.25 等 step 值直接比较）
  const rounded = Math.round(stepped * 1000) / 1000
  if (rounded < ANIM_SPEED_MIN || rounded > ANIM_SPEED_MAX) return ANIM_SPEED_DEFAULT
  return rounded
}

/** 读取 localStorage 并归一化（存储不可用时 safeGetItem 返回 null → 默认 1） */
export function readAnimSpeed(): number {
  return normalizeAnimSpeed(safeGetItem(ANIM_SPEED_KEY))
}

/** 写入 localStorage（统一存档位字符串 '0.5'~'2'），返回归一化后的档位 */
export function writeAnimSpeed(speed: string | number | null | undefined): number {
  const n = normalizeAnimSpeed(speed)
  safeSetItem(ANIM_SPEED_KEY, String(n))
  return n
}

/** 应用到 documentElement.dataset.animSpeed（默认 1 也显式设置），返回归一化档位 */
export function applyAnimSpeed(speed: string | number | null | undefined): number {
  const n = normalizeAnimSpeed(speed)
  document.documentElement.dataset.animSpeed = String(n)
  return n
}

/** 清理：移除存储并摘掉 dataset（保留给异常/未来清理场景） */
export function clearAnimSpeed(): void {
  safeRemoveItem(ANIM_SPEED_KEY)
  delete document.documentElement.dataset.animSpeed
}

/** 读取减少动效开关（'1'=开；其他/无值/存储不可用 = 关） */
export function readReduceMotion(): boolean {
  return safeGetItem(REDUCE_MOTION_KEY) === '1'
}

/** 写入减少动效开关，返回是否开启 */
export function writeReduceMotion(on: unknown): boolean {
  const enabled = !!on
  safeSetItem(REDUCE_MOTION_KEY, enabled ? '1' : '0')
  return enabled
}

/** 应用减少动效开关：开 → dataset.reduceMotion='on'，关 → 摘掉 */
export function applyReduceMotion(on: unknown): boolean {
  if (on) {
    document.documentElement.dataset.reduceMotion = 'on'
  } else {
    delete document.documentElement.dataset.reduceMotion
  }
  return !!on
}

/** 清理：移除存储并摘掉 dataset */
export function clearReduceMotion(): void {
  safeRemoveItem(REDUCE_MOTION_KEY)
  delete document.documentElement.dataset.reduceMotion
}
