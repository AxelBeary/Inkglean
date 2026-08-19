// useSignatureRefresh 后台标签回可见补刷测试（R-15）
// 覆盖：切后台超阈值回可见立即刷新、未超阈值不刷新、卸载后监听清理、定时刷新仍正常
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  refreshSignatures: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  artistApi: { refreshSignatures: (...args: unknown[]) => h.refreshSignatures(...args) }
}))

import { useSignatureRefresh } from '../useSignatureRefresh.js'

function mountHost(overrides: Record<string, unknown> = {}) {
  let ctx!: ReturnType<typeof useSignatureRefresh>
  const wrapper = mount({
    setup() {
      ctx = useSignatureRefresh({
        collect: () => ['a.png', 'b.png'],
        apply: () => {},
        ...overrides
      })
      return {}
    },
    template: '<div />'
  })
  return { wrapper, ctx }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('useSignatureRefresh 可见性补刷（R-15）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T00:00:00'))
    h.refreshSignatures.mockReset()
    h.refreshSignatures.mockResolvedValue({ urls: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('回可见时距上次刷新超过 8 分钟 → 立即刷新', async () => {
    const { wrapper } = mountHost()
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400)

    expect(h.refreshSignatures).toHaveBeenCalledWith(['a.png', 'b.png'])
    wrapper.unmount()
  })

  it('回可见但未超阈值 → 不刷新', async () => {
    const { wrapper } = mountHost()
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400)

    expect(h.refreshSignatures).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('卸载后监听被清理，回可见不再触发', async () => {
    const { wrapper } = mountHost()
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
    wrapper.unmount()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400)

    expect(h.refreshSignatures).not.toHaveBeenCalled()
  })

  it('定时刷新仍按 interval 工作（回归保护）', async () => {
    const { wrapper } = mountHost()
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 100)
    expect(h.refreshSignatures).toHaveBeenCalled()
    wrapper.unmount()
  })
})
