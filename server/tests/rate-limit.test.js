import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit } from '../src/shared/middleware/rate-limit.js'

describe('P2-1 限流滑动窗口 (Rate Limit Sliding Window)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TC-RL-01: 窗口内超限被拒', () => {
    const key = `test-basic-${Date.now()}`
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
    expect(rateLimit(key, 3, 60_000)).toBe(false)
  })

  it('TC-RL-02: 窗口过期后放行', () => {
    const key = `test-expire-${Date.now()}`
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(true)
    expect(rateLimit(key, 2, 60_000)).toBe(false)

    // 前进 61 秒，窗口过期
    vi.advanceTimersByTime(61_000)
    expect(rateLimit(key, 2, 60_000)).toBe(true)
  })

  it('TC-RL-03: 滑动窗口边界不突发（核心场景）', () => {
    // 固定窗口的缺陷：窗口尾部打满 + 新窗口头部打满 = 2 倍突发
    // 滑动日志：任何连续 60s 窗口内不超过 maxHits
    const key = `test-sliding-${Date.now()}`

    // t=0: 打 3 次
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 5, 60_000)).toBe(true)
    }
    // t=30s: 再打 2 次（共 5 次，满了）
    vi.advanceTimersByTime(30_000)
    expect(rateLimit(key, 5, 60_000)).toBe(true)
    expect(rateLimit(key, 5, 60_000)).toBe(true)
    expect(rateLimit(key, 5, 60_000)).toBe(false) // 满了

    // t=61s: 前 3 个（t=0）过期，但 t=30 的 2 个还在窗口内
    // 滑动窗口释放 3 个名额，不是全部 5 个
    vi.advanceTimersByTime(31_000)
    expect(rateLimit(key, 5, 60_000)).toBe(true)  // 放行 1
    expect(rateLimit(key, 5, 60_000)).toBe(true)  // 放行 2
    expect(rateLimit(key, 5, 60_000)).toBe(true)  // 放行 3
    expect(rateLimit(key, 5, 60_000)).toBe(false) // 又满了（t=30 的 2 个 + 刚打的 3 个）
  })

  it('TC-RL-04: 不同 key 互不影响', () => {
    const keyA = `test-iso-a-${Date.now()}`
    const keyB = `test-iso-b-${Date.now()}`
    expect(rateLimit(keyA, 1, 60_000)).toBe(true)
    expect(rateLimit(keyA, 1, 60_000)).toBe(false)
    expect(rateLimit(keyB, 1, 60_000)).toBe(true) // B 不受 A 影响
  })

  it('TC-RL-05: 渐进过期——逐条释放', () => {
    const key = `test-gradual-${Date.now()}`
    // t=0,1,2 各打一次（间隔 10s）
    expect(rateLimit(key, 3, 60_000)).toBe(true)   // t=0
    vi.advanceTimersByTime(10_000)
    expect(rateLimit(key, 3, 60_000)).toBe(true)   // t=10
    vi.advanceTimersByTime(10_000)
    expect(rateLimit(key, 3, 60_000)).toBe(true)   // t=20
    expect(rateLimit(key, 3, 60_000)).toBe(false)  // 满了

    // t=61: 第一条（t=0）过期，释放 1 个名额
    vi.advanceTimersByTime(41_000)
    expect(rateLimit(key, 3, 60_000)).toBe(true)   // 放行
    expect(rateLimit(key, 3, 60_000)).toBe(false)  // 又满了

    // t=71: 第二条（t=10）过期
    vi.advanceTimersByTime(10_000)
    expect(rateLimit(key, 3, 60_000)).toBe(true)
  })
})
