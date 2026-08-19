// reconnect 订阅测试（R-16：断网重连恢复钩子）
// 覆盖：online 事件触发订阅回调、visibilitychange 回可见触发、隐藏不触发、退订后不再触发
import { describe, it, expect, vi, afterEach } from 'vitest'
import { subscribeReconnect } from '../reconnect.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('subscribeReconnect（R-16）', () => {
  it('window online 事件 → 订阅回调被调；退订后不再触发', () => {
    const cb = vi.fn<() => void>()
    const unsubscribe = subscribeReconnect(cb)

    window.dispatchEvent(new Event('online'))
    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
    window.dispatchEvent(new Event('online'))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('visibilitychange 回可见 → 触发；隐藏态不触发', () => {
    const cb = vi.fn<() => void>()
    const unsubscribe = subscribeReconnect(cb)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(cb).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(cb).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('多个订阅者各自触发；单个回调抛错不影响其余订阅者', () => {
    const bad = vi.fn((): void => { throw new Error('boom') })
    const good = vi.fn<() => void>()
    subscribeReconnect(bad)
    const unsub = subscribeReconnect(good)

    window.dispatchEvent(new Event('online'))
    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
    unsub()
  })
})
