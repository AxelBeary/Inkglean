// ============================================
// 共享速率限制器（per-IP，滑动日志）
// 所有公开接口统一使用，防止撞库/刷接口
// P2-1: 固定窗口→滑动日志，消除边界突发
// ============================================

const buckets = new Map()

/**
 * @param {string} key - 限流键（如 `send-code:1.2.3.4`）
 * @param {number} maxHits - 窗口内最大请求数
 * @param {number} windowMs - 窗口时长（毫秒）
 * @returns {boolean} true=放行 false=限流
 */
export function rateLimit(key, maxHits, windowMs) {
  const now = Date.now()
  const cutoff = now - windowMs

  // 取或初始化时间戳数组
  let timestamps = buckets.get(key)
  if (!timestamps) {
    timestamps = []
    buckets.set(key, timestamps)
  }

  // 清除窗口外的旧记录
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift()
  }

  // 判断是否超限
  if (timestamps.length >= maxHits) {
    return false
  }

  timestamps.push(now)
  return true
}

// 定期清理过期桶（unref 避免阻止进程退出 / 测试挂起）
// 桶数量上限：防止突发大量不同 key 导致内存膨胀
const MAX_BUCKETS = 100_000
const _cleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, timestamps] of buckets) {
    // 清除过期时间戳
    while (timestamps.length > 0 && timestamps[0] <= now - 60_000) {
      timestamps.shift()
    }
    // 空桶删除
    if (timestamps.length === 0) buckets.delete(k)
  }
  // 超限保护：超出上限时清空（极端情况，正常不会触发）
  if (buckets.size > MAX_BUCKETS) buckets.clear()
}, 60_000)
_cleanup.unref()
