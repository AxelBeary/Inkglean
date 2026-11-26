// 尾巴批 pr-review-upstream-20261123：downloadBlob（三处同型收口后的单源）回归——
// 覆盖：① click 同步返回时不注销、1s 后注销且恰好一次；② download 文件名与 objectUrl 正确挂到 anchor；
// ③ SHR-02：回执 Promise<{ok,error?}> —— 链路成功 ok:true、异常 ok:false 且带 error 不外抛。
// 断言守「不再同步注销」（非 Chromium 内核上提前注销会取消下载），注入手法同 web download.test.ts。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from '../utils/download'

const REVOKE_DELAY_MS = 1_000

describe('downloadBlob 的 blob URL 释放时机', () => {
  const createObjectURL = vi.fn((_obj: Blob | MediaSource) => 'blob:mock-download')
  const revokeObjectURL = vi.fn((_url: string) => {})

  beforeEach(() => {
    // 实现写在 beforeEach 而非 vi.fn(impl)：restoreAllMocks 会重置实现，逐条重建最稳（同 web 手法）
    createObjectURL.mockReset().mockImplementation(() => 'blob:mock-download')
    revokeObjectURL.mockReset()
    // happy-dom 未实现 createObjectURL/revokeObjectURL，直接以可配置属性注入
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })

  it('成功回执 ok:true；同步不注销 blob URL，1s 后注销且恰好一次，文件名与 objectUrl 挂对 anchor', async () => {
    // 真点 anchor 会让 happy-dom 尝试导航到 blob URL，捕获 this 只核属性不导航
    // （数组持有者：TS 流分析不追踪回调内赋值，let+narrow 会被判成 never）
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })

    const result = await downloadBlob(new Blob(['fake-png']), 'price-card.png')

    expect(result).toEqual({ ok: true })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    // getAttribute 绕开 happy-dom 对 blob: 链接的 href 归一化（同 web download.test.ts 只核「点了没有」的教训）
    expect(clicked[0]?.getAttribute('href')).toBe('blob:mock-download')
    expect(clicked[0]?.getAttribute('download')).toBe('price-card.png')

    // 关键回归点：click 返回后立刻注销的旧行为必须消失
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-download')

    // 再等两个周期也不许重复注销（没有多处挂定时器）
    vi.advanceTimersByTime(REVOKE_DELAY_MS * 2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('SHR-02: createObjectURL 抛错 → 回执 ok:false 且带 error，不外抛', async () => {
    const boom = new Error('quota exceeded')
    createObjectURL.mockImplementation(() => { throw boom })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const result = await downloadBlob(new Blob(['x']), 'x.png')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('quota exceeded')
  })

  it('SHR-02: a.click 抛错 → 回执 ok:false 且带 error，不外抛', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked') })

    const result = await downloadBlob(new Blob(['x']), 'x.png')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('blocked')
  })

  // TASK2-04: click 抛错时 1s 延迟 revoke 那行不会执行 → 必须立即注销，否则 Blob URL 泄漏
  it('TASK2-04: a.click 抛错后立即 revoke blob URL（恰好一次，不等 1s）', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked') })

    const result = await downloadBlob(new Blob(['x']), 'leak.png')

    expect(result.ok).toBe(false)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-download')
    // 不再有延迟的第二次注销（catch 已同步注销，未挂定时器）
    vi.advanceTimersByTime(REVOKE_DELAY_MS * 2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})
