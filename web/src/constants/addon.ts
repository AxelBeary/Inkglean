/**
 * 增项（addon）价格魔数单源（P1 汇总波 C16）
 * AddonCreateDialog / AddonSettingsDialog / AddonTemplateManager 曾各自硬编码。
 */

/** 百分比计价上限（% ；后端 schema 铁律） */
export const ADDON_PERCENT_MAX = 1000
/** 固定价计价上限（分） */
export const ADDON_FIXED_PRICE_MAX = 999999
/** 新增/重置时的默认价格（百分比档默认 50） */
export const ADDON_DEFAULT_PRICE = 50
