import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, cleanupExpiredBuckets } from '../src/shared/middleware/rate-limit.js'

/**
 * audit-a R-3: 限流清理器按桶自身 windowMs 清理，长窗口不再被 60s 硬编码退化
 * 采用导出 cleanupExpiredBuckets 确定性验证（模块加载时的 setInterval 用真实定时器，
 * fake timers 触发不到，直接调清理函数最可靠）
 */

describe('audit-a R-3 长窗口限流清理', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TC-RL-08: 5 分钟窗口桶推进 90s 后运行清理，计数仍在（限流仍生效）', () => {
    const key = `test-long-window-${Math.random()}`
    const maxHits = 5
    const windowMs = 5 * 60_000

    for (let i = 0; i < maxHits; i++) {
      expect(rateLimit(key, maxHits, windowMs)).toBe(true)
    }
    expect(rateLimit(key, maxHits, windowMs)).toBe(false)

    // 推进 90s（> 旧硬编码 60s，< 5min 窗口）：旧实现会把计数全清掉
    vi.advanceTimersByTime(90_000)
    cleanupExpiredBuckets()

    // 修复后：历史计数保留，仍限流
    expect(rateLimit(key, maxHits, windowMs)).toBe(false)
  })

  it('TC-RL-09: 长窗口到期后清理器放行', () => {
    const key = `test-long-expire-${Math.random()}`
    const windowMs = 5 * 60_000
    expect(rateLimit(key, 2, windowMs)).toBe(true)
    expect(rateLimit(key, 2, windowMs)).toBe(true)
    expect(rateLimit(key, 2, windowMs)).toBe(false)

    vi.advanceTimersByTime(5 * 60_000 + 1_000)
    cleanupExpiredBuckets()
    expect(rateLimit(key, 2, windowMs)).toBe(true)
  })

  it('TC-RL-10: 60s 短窗口仍按自身窗口清理（既有语义回归）', () => {
    const key = `test-short-window-${Math.random()}`
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(false)

    vi.advanceTimersByTime(61_000)
    cleanupExpiredBuckets()
    expect(rateLimit(key, 2, 60_000)).toBe(true)
  })

  it('TC-RL-11: 桶窗口切换后清理器按最新 windowMs 清（不误删长窗口）', () => {
    const key = `test-window-switch-${Math.random()}`
    // 先以 60s 窗口打 1 次，再切到 5min 窗口打满
    expect(rateLimit(key, 1, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 5 * 60_000)).toBe(true)
    expect(rateLimit(key, 3, 5 * 60_000)).toBe(true)
    expect(rateLimit(key, 3, 5 * 60_000)).toBe(false)

    vi.advanceTimersByTime(90_000)
    cleanupExpiredBuckets()
    // 首条 60s 记录本已过期，但其余 3 条 5min 记录仍保留 → 继续限流
    expect(rateLimit(key, 3, 5 * 60_000)).toBe(false)
  })
})
