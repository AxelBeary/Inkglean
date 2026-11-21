// issue #81 A 路：下载链路的 blob URL 释放时机回归
// 覆盖：① click 同步返回时不注销、60s 后注销且恰好一次；② fetch 非 2xx 抛错且完全不碰 blob URL。
// 背景（施工书 A 路契约 1）：这不是根因修复——本机 Chromium 1/10/50MB 同步释放均完整落盘；
// 延迟 60s 是为消除非 Chromium 内核上「提前注销」的脆弱面，故此处的断言守的是「不再同步注销」。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadAsset } from '../download'

const REVOKE_DELAY_MS = 60_000

describe('downloadAsset 的 blob URL 释放时机', () => {
  const createObjectURL = vi.fn((_obj: Blob | MediaSource) => 'blob:mock-download')
  const revokeObjectURL = vi.fn((_url: string) => {})
  const fetchMock = vi.fn<typeof fetch>()
  let anchorClickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // 实现写在这里而不是 vi.fn(impl)：afterEach 的 restoreAllMocks 会重置 vi.fn 的实现，逐条重建最稳
    createObjectURL.mockReset().mockImplementation(() => 'blob:mock-download')
    revokeObjectURL.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // happy-dom 未实现 createObjectURL/revokeObjectURL，直接以可配置属性注入（同 ImageResize.test.ts 手法）
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    // 真点 anchor 会让 happy-dom 尝试导航到 blob URL，这里只关心「点了没有」
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })

  it('同步不注销 blob URL，60s 后注销且恰好一次', async () => {
    // 用字符串体（不是 Blob 体）：只借 Response 的 ok/blob 形状，body 类型越基础越不容易踩 happy-dom 边界
    fetchMock.mockResolvedValue(new Response('fake-png', { status: 200 }))

    const pending = downloadAsset('https://example.test/signed', 'final.png')
    await pending

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    // 关键回归点：click 返回后立刻注销的旧行为必须消失
    expect(revokeObjectURL).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS - 1)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-download')

    // 再等两个周期也不许重复注销（没有多处挂定时器）
    await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS * 2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('传输超时会中止请求并抛 DOWNLOAD_TIMEOUT，不落盘也不占用 blob URL', async () => {
    // 永不 resolve 的 fetch，只有超时中止能让它退出——这正是「下载中标记永久卡死」的成因
    const hanging = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    fetchMock.mockImplementation(hanging as unknown as typeof fetch)

    const pending = downloadAsset('https://example.test/slow', 'final.png')
    const assertion = expect(pending).rejects.toThrow('DOWNLOAD_TIMEOUT')
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion

    expect(hanging).toHaveBeenCalledTimes(1)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(anchorClickSpy).not.toHaveBeenCalled()
  })

  it('fetch 非 2xx 仍抛错，且不创建也不注销 blob URL', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }))

    await expect(downloadAsset('https://example.test/gone', 'final.png')).rejects.toThrow('HTTP 404')

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(anchorClickSpy).not.toHaveBeenCalled()
  })
})
