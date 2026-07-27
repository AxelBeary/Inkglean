// ============================================
// 共享速率限制器（per-IP，内存桶）
// 所有公开接口统一使用，防止撞库/刷接口
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
  const bucket = buckets.get(key) || { hits: 0, resetAt: now + windowMs }
  if (now > bucket.resetAt) { bucket.hits = 0; bucket.resetAt = now + windowMs }
  bucket.hits++
  buckets.set(key, bucket)
  return bucket.hits <= maxHits
}

// 定期清理过期桶（unref 避免阻止进程退出 / 测试挂起）
// 桶数量上限：防止突发大量不同 key 导致内存膨胀
const MAX_BUCKETS = 100_000
const _cleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
  // 超限保护：超出上限时清空（极端情况，正常不会触发）
  if (buckets.size > MAX_BUCKETS) buckets.clear()
}, 60_000)
_cleanup.unref()
