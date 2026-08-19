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

describe('P1-2 限流器 LRU 化 (Rate Limit LRU Eviction)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TC-RL-06: LRU 超限精确淘汰——最早访问的被淘汰，最近访问的保留', () => {
    // maxBuckets 小值验证淘汰；key 数量 > maxBuckets 保证淘汰必然覆盖本组 key
    const key = (n: number): string => `test-lru-${n}`
    const maxBuckets = 3
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(key(i), 1, 60_000, maxBuckets)).toBe(true)
    }
    // 最早访问的 key(0) 已被淘汰：重新访问 → 重新计数 → 放行
    expect(rateLimit(key(0), 1, 60_000, maxBuckets)).toBe(true)
    // 最近访问的 key(9) 保留：桶在、计数满 → 限流
    expect(rateLimit(key(9), 1, 60_000, maxBuckets)).toBe(false)
    // 倒数第二 key(8) 保留
    expect(rateLimit(key(8), 1, 60_000, maxBuckets)).toBe(false)
  })

  it('TC-RL-07: 访问刷新 LRU 顺序——最近访问的不先被淘汰', () => {
    const key = (n: string): string => `test-lru-refresh-${n}`
    const maxBuckets = 2
    expect(rateLimit(key('A'), 1, 60_000, maxBuckets)).toBe(true)
    expect(rateLimit(key('B'), 1, 60_000, maxBuckets)).toBe(true)
    // 再次访问 A：刷新顺序（A 变为最近访问）；桶在 → 限流
    expect(rateLimit(key('A'), 1, 60_000, maxBuckets)).toBe(false)
    // 插入 C：size=3 > 2 → 淘汰最久未访问。刷新生效则淘汰 B（A 已刷新为最近）
    expect(rateLimit(key('C'), 1, 60_000, maxBuckets)).toBe(true)
    // A 保留（限流）、C 保留（限流）、B 被淘汰（重新计数 → 放行）
    expect(rateLimit(key('A'), 1, 60_000, maxBuckets)).toBe(false)
    expect(rateLimit(key('C'), 1, 60_000, maxBuckets)).toBe(false)
    expect(rateLimit(key('B'), 1, 60_000, maxBuckets)).toBe(true)
  })
})
