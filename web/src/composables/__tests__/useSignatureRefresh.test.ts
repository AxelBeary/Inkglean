// useSignatureRefresh 后台标签回可见补刷测试（R-15）+ G1 口径哨兵（间隔/阈值必须小于后端签名 TTL）
// 覆盖：切后台超阈值回可见立即刷新、未超阈值不刷新、卸载后监听清理、定时刷新仍正常
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  refreshSignatures: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  artistApi: { refreshSignatures: (...args: unknown[]) => h.refreshSignatures(...args) }
}))

import { useSignatureRefresh, SIGNATURE_TTL_MS, DEFAULT_INTERVAL_MS, VISIBLE_REFRESH_THRESHOLD_MS } from '../useSignatureRefresh'

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

  it('回可见时距上次刷新超过阈值（2 分钟）→ 立即刷新', async () => {
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
    // G1：旧值按 8 分钟阈值走 5 分钟；现阈值 2 分钟、间隔 3 分钟，改走 1 分钟（未碰任何刷新点）
    await vi.advanceTimersByTimeAsync(1 * 60 * 1000)
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
    // G1：间隔压至 3 分钟后，卸载前定时器已合法触发数次；本用例只判「卸载后零新增」
    h.refreshSignatures.mockClear()
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400)

    expect(h.refreshSignatures).not.toHaveBeenCalled()
  })

  it('定时刷新仍按 interval 工作（回归保护）', async () => {
    const { wrapper } = mountHost()
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
    expect(h.refreshSignatures).toHaveBeenCalled()
    wrapper.unmount()
  })

  // G1 口径哨兵：后端 H-4 已把签名 TTL 从 15 分钟缩到 5 分钟（file-sign.ts FILE_TTL_MS），
  // 前端间隔/补刷阈值必须严格小于 TTL，否则长停留页面必裂图（本哨兵防口径再次漂移）。
  it('口径哨兵：间隔与补刷阈值均小于后端签名 TTL', () => {
    expect(SIGNATURE_TTL_MS).toBe(5 * 60 * 1000)
    expect(DEFAULT_INTERVAL_MS).toBeLessThan(SIGNATURE_TTL_MS)
    expect(VISIBLE_REFRESH_THRESHOLD_MS).toBeLessThan(SIGNATURE_TTL_MS)
  })
})
