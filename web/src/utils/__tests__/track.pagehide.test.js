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

  it('积压 120 条：pagehide 分片带走全部未发事件，不再只发前 50 条', async () => {
    for (let i = 0; i < 120; i++) trackEvent('t', { i })
    window.dispatchEvent(new Event('pagehide'))

    // 不变量断言（不依赖自动 flush 与 pagehide 的时序竞态）：
    // beacon 分片每片 ≤ 50 条、都带 token；beacon 带走的 + pending fetch 在途的 = 120 条零丢失
    expect(navigator.sendBeacon.mock.calls.length).toBeGreaterThanOrEqual(2)
    const bodies = []
    for (const [, blob] of navigator.sendBeacon.mock.calls) {
      bodies.push(JSON.parse(await blob.text()))
    }
    let beaconTotal = 0
    for (const body of bodies) {
      expect(body.events.length).toBeLessThanOrEqual(50)
      expect(body.token).toBe('anon-token-test')
      for (const ev of body.events) expect(ev.name).toBe('t')
      beaconTotal += body.events.length
    }
    expect(beaconTotal).toBeGreaterThanOrEqual(70) // 旧行为上限只发 50，新行为必须远超
    const inFlight = globalThis.fetch.mock.calls.reduce((sum, call) => {
      const body = JSON.parse(call[1].body)
      return sum + body.events.length
    }, 0)
    expect(beaconTotal + inFlight).toBe(120) // 零丢失
  })

  it('buildBeaconBodies：55 条切 50+5 两片，token 每片携带', () => {
    const events = Array.from({ length: 55 }, (_, i) => ({ name: 't', i }))
    const bodies = buildBeaconBodies(events, 'tok').map(JSON.parse)
    expect(bodies.map(b => b.events.length)).toEqual([50, 5])
    expect(bodies.every(b => b.token === 'tok')).toBe(true)
  })
})
