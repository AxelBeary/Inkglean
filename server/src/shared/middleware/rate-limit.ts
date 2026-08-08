// ============================================
// 共享速率限制器（per-IP，滑动日志）
// 所有公开接口统一使用，防止撞库/刷接口
// P2-1: 固定窗口→滑动日志，消除边界突发
// P1-2: LRU 化——访问即刷新顺序（delete+set 重插末尾），超限精确淘汰最久未访问，
//       消除 60s 定时全扫 O(n) 与超限 clear() 全清导致的误杀
// ============================================

const buckets = new Map<string, number[]>()

/**
 * @param {string} key - 限流键（如 `send-code:1.2.3.4`）
 * @param {number} maxHits - 窗口内最大请求数
 * @param {number} windowMs - 窗口时长（毫秒）
 * @param {number} maxBuckets - 桶数量上限（默认 100_000；测试可传小值验证淘汰）
 * @returns {boolean} true=放行 false=限流
 */
export function rateLimit(
  key: string,
  maxHits: number,
  windowMs: number,
  maxBuckets: number = MAX_BUCKETS
): boolean {
  const now = Date.now()
  const cutoff = now - windowMs

  // LRU 刷新：取出的桶重插到 Map 末尾（最近访问）；新 key 直接插入
  let timestamps = buckets.get(key)
  if (timestamps) {
    buckets.delete(key)
    buckets.set(key, timestamps)
  } else {
    timestamps = []
    buckets.set(key, timestamps)
    // 新增桶后若超上限，精确淘汰最久未访问（替代原 clear() 全清）
    evictOldest(maxBuckets)
  }

  // 清除窗口外的旧记录（行为不变——滑动日志语义）
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift()
  }

  // 判断是否超限（行为不变）
  if (timestamps.length >= maxHits) {
    return false
  }

  timestamps.push(now)
  return true
}

// 桶数量上限：防止突发大量不同 key 导致内存膨胀
const MAX_BUCKETS = 100_000

// LRU 淘汰：超上限时从 Map 头部（最久未访问）逐个删，直到达标
function evictOldest(maxBuckets: number): void {
  while (buckets.size > maxBuckets) {
    const oldestKey = buckets.keys().next().value
    if (oldestKey === undefined) break
    buckets.delete(oldestKey)
  }
}

// 定期清理过期桶（unref 避免阻止进程退出 / 测试挂起）
// 保留：LRU 只处理「超上限」；「不活跃但未超上限」的 key 仍靠定时清理空桶/过期桶
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
  // 超限保护：超出上限时精确淘汰最久未访问（极端情况，正常不会触发）
  if (buckets.size > MAX_BUCKETS) evictOldest(MAX_BUCKETS)
}, 60_000)
_cleanup.unref()
