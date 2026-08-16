// 817-D 10-4: 关页埋点分片发送回归测试
// 覆盖：积压 > SEND_BATCH_MAX 时 pagehide 按 50 条/片全部带走（此前只发前 50 条，超出即丢）；
//       buildBeaconBodies 按条数/体积分片契约（单条超限仍整条发出，尽力而为）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../storage.js', () => ({
  safeGetItem: vi.fn(() => 'anon-token-test'),
  safeSetItem: vi.fn(),
  safeRemoveItem: vi.fn()
}))

// 模块加载时 localStorage 已有凭证 → ensureAnonToken 不再发 /api/anon-token。
// 首个自动 flush 的 /api/events 请求挂一个永不落地的 promise，避免在 pagehide 前清空队列，
// 还原「自动 flush 在途 + 剩余积压」的真实关页竞态。
globalThis.fetch = vi.fn(() => new Promise(() => {}))

import { trackEvent, buildBeaconBodies } from '../track.js'

describe('track pagehide 分片（817-D 10-4）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'sendBeacon', {
      value: vi.fn(),
      configurable: true,
      writable: true
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('积压 120 条：pagehide 全部带走（3 片 50/50/20），不再只发前 50 条', async () => {
    for (let i = 0; i < 120; i++) trackEvent('t', { i })
    // 自动 flush 在首个满批时已同步取走 50 条并挂在 pending fetch 上，剩余 70 条走 pagehide
    window.dispatchEvent(new Event('pagehide'))

    expect(navigator.sendBeacon).toHaveBeenCalledTimes(2)
    const bodies = []
    for (const [, blob] of navigator.sendBeacon.mock.calls) {
      bodies.push(JSON.parse(await blob.text()))
    }
    expect(bodies.map(b => b.events.length)).toEqual([50, 20])
    for (const body of bodies) {
      expect(body.token).toBe('anon-token-test')
      for (const ev of body.events) expect(ev.name).toBe('t')
    }
  })

  it('buildBeaconBodies：55 条切 50+5 两片，token 每片携带', () => {
    const events = Array.from({ length: 55 }, (_, i) => ({ name: 't', i }))
    const bodies = buildBeaconBodies(events, 'tok').map(JSON.parse)
    expect(bodies.map(b => b.events.length)).toEqual([50, 5])
    expect(bodies.every(b => b.token === 'tok')).toBe(true)
  })
})
