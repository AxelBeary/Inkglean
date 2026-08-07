// 巡检修复批 D14: 金额分 → 元 统一工具（原 7 处组件内重复实现，抽为单一来源）
/**
 * 金额分 → 元字符串（后端返分，前端 /100；与旧各组件本地 formatCents 同款，零行为变化）
 * @param {number|string|null|undefined} cents 金额（分）
 * @returns {string} 两位小数字符串
 */
export function formatCents(cents) {
  return ((cents || 0) / 100).toFixed(2)
}
