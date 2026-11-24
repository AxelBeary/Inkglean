// useSignatureRefresh 后台标签回可见补刷测试（R-15）+ G1 口径哨兵（间隔/阈值必须小于后端签名 TTL）
// 覆盖：切后台超阈值回可见立即刷新、未超阈值不刷新、卸载后监听清理、定时刷新仍正常
// #62 尾巴清收：分片失败整批停止时补用户可见提示——失败连发开始弹一次、连续失败不刷屏、恢复后重置
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  refreshSignatures: vi.fn(),
  messageWarning: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  artistApi: { refreshSignatures: (...args: unknown[]) => h.refreshSignatures(...args) }
}))

// #62：catch 里弹 ElMessage.warning——mock 掉以断言可见反馈（真实 element-plus 在 happy-dom 可渲染，但断言需 mock）
vi.mock('element-plus', () => ({
  ElMessage: { warning: h.messageWarning, success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

// #62：composable 失败分支动态 import '../i18n/index' 取文案——这里预载进模块注册表，
// 使 fake timers 窗口内的动态 import 命中缓存、微任务内完成（否则真实 IO 加载会让断言等不到 toast）
import '../../i18n/index'

import { useSignatureRefresh, __resetCrossInstanceWarnForTest, SIGNATURE_TTL_MS, DEFAULT_INTERVAL_MS, VISIBLE_REFRESH_THRESHOLD_MS, SIGNATURE_REFRESH_BATCH_SIZE } from '../useSignatureRefresh'

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

// issue #52-5：服务端 refresh-signatures 的 paths 上限 maxItems:50，
// 整批超限会被 400 拒掉 → 必须按 50 分片、串行提交（并发会撞限流），单片失败即停且失败外露。
describe('useSignatureRefresh 分片刷新（issue #52-5）', () => {
  /** 取第 n 次调用的入参数组 */
  function callArgs(n: number): string[] {
    return h.refreshSignatures.mock.calls[n][0] as string[]
  }

  function makePaths(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `references/img-${i}.png`)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T00:00:00'))
    h.refreshSignatures.mockReset()
    h.refreshSignatures.mockResolvedValue({ urls: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('120 条按 50/50/20 分三次提交', async () => {
    const paths = makePaths(120)
    mountHost({ collect: () => paths })
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)

    expect(h.refreshSignatures).toHaveBeenCalledTimes(3)
    expect(callArgs(0)).toHaveLength(SIGNATURE_REFRESH_BATCH_SIZE)
    expect(callArgs(1)).toHaveLength(SIGNATURE_REFRESH_BATCH_SIZE)
    expect(callArgs(2)).toHaveLength(20)
    expect([...callArgs(0), ...callArgs(1), ...callArgs(2)]).toEqual(paths)
  })

  it('串行：前一片未 resolve 前不发下一片', async () => {
    const paths = makePaths(120)
    let resolveGate: ((v: unknown) => void) | undefined
    h.refreshSignatures.mockReset()
    h.refreshSignatures.mockImplementation(() => new Promise(r => { resolveGate = r }))
    const { wrapper } = mountHost({ collect: () => paths })

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
    expect(h.refreshSignatures).toHaveBeenCalledTimes(1)

    // 第一片 resolve 后第二片才发出，且第二片仍 pending 时第三片不发
    resolveGate!({ urls: {} })
    await vi.advanceTimersByTimeAsync(0)
    expect(h.refreshSignatures).toHaveBeenCalledTimes(2)

    resolveGate!({ urls: {} })
    await vi.advanceTimersByTimeAsync(0)
    expect(h.refreshSignatures).toHaveBeenCalledTimes(3)
    expect(callArgs(2)).toHaveLength(20)
    wrapper.unmount()
  })

  it('单片失败即停止后续分片，且失败经 refreshError 外露（不再静默）', async () => {
    const paths = makePaths(120)
    const boom = new Error('rate limited')
    h.refreshSignatures.mockReset()
    h.refreshSignatures.mockResolvedValueOnce({ urls: {} })
    h.refreshSignatures.mockRejectedValueOnce(boom)

    const { wrapper, ctx } = mountHost({ collect: () => paths })
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)

    // 第 2 片失败后第 3 片不得再发
    expect(h.refreshSignatures).toHaveBeenCalledTimes(2)
    expect(ctx.refreshError.value).toBe(boom)
    wrapper.unmount()
  })

  it('刷新成功后清空 refreshError（重试可恢复）', async () => {
    const paths = makePaths(10)
    h.refreshSignatures.mockReset()
    h.refreshSignatures.mockRejectedValueOnce(new Error('flaky'))

    const { wrapper, ctx } = mountHost({ collect: () => paths })
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
    expect(ctx.refreshError.value).not.toBeNull()

    h.refreshSignatures.mockResolvedValueOnce({ urls: {} })
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
    expect(ctx.refreshError.value).toBeNull()
    wrapper.unmount()
  })

  // ─── #62 尾巴清收：分片失败整批停 → 用户可见提示 ───
  // refreshError 此前只是「暴露」，全仓无页面消费它，失败对用户仍不可见。
  // 口径：失败连发开始弹一次（ElMessage.warning）；连续失败不刷屏；恢复后下轮失败重新提示。
  describe('#62 分片失败可见反馈', () => {
    beforeEach(() => {
      h.messageWarning.mockClear()
      // 可选第 6 件：模块级跨实例去重标志在用例间泄漏会让「首败必弹」断言偶发红，逐用例复位
      __resetCrossInstanceWarnForTest()
    })

    it('单片失败整批停 → 弹一次可见提示', async () => {
      const paths = makePaths(120)
      h.refreshSignatures.mockReset()
      h.refreshSignatures.mockResolvedValueOnce({ urls: {} })
      h.refreshSignatures.mockRejectedValueOnce(new Error('rate limited'))

      const { wrapper } = mountHost({ collect: () => paths })
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)

      // 第 2 片失败即停（既有回归），且用户可见提示已发出
      expect(h.refreshSignatures).toHaveBeenCalledTimes(2)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('连续失败不重复刷屏（同一失败连发只提示一次）', async () => {
      const paths = makePaths(10)
      h.refreshSignatures.mockReset()
      h.refreshSignatures.mockRejectedValue(new Error('still down'))

      const { wrapper } = mountHost({ collect: () => paths })
      // 三轮定时全部失败：只在第一轮结束时弹过一次
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS * 3 + 100)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    it('恢复成功后再次失败 → 重新提示（streak 重置）', async () => {
      const paths = makePaths(10)
      h.refreshSignatures.mockReset()
      h.refreshSignatures.mockRejectedValueOnce(new Error('down 1'))

      const { wrapper } = mountHost({ collect: () => paths })
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)

      // 恢复成功（refreshError 清空）→ streak 重置
      h.refreshSignatures.mockResolvedValueOnce({ urls: {} })
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)

      // 恢复后的新一轮失败重新提示
      h.refreshSignatures.mockRejectedValueOnce(new Error('down 2'))
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
      expect(h.messageWarning).toHaveBeenCalledTimes(2)
      wrapper.unmount()
    })

    it('@error 触发的失败同样可见（fromError 路径不豁免提示）', async () => {
      const { wrapper, ctx } = mountHost({ collect: () => [] })
      // 直接走 @error 入口：collect 为空时空目标不请求，这里显式给 path 触发 pendingPaths → flushPending
      // （不 mockReset：外层 beforeEach 已设默认 resolved 实现，mockRejectedValueOnce 只覆盖一次）
      h.refreshSignatures.mockRejectedValueOnce(new Error('boom'))
      ctx.refreshNow('references/x.png')
      await vi.advanceTimersByTimeAsync(400)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)
      wrapper.unmount()
    })

    // 可选第 6 件：OrderDetail 主页 + 内嵌 PreviewPanel 同屏双实例，同次网络故障此前弹两条相同警告
    it('同屏双实例同次故障只弹一条（模块级去重）；恢复后再失败照常提示', async () => {
      const paths = makePaths(10)
      h.refreshSignatures.mockReset()
      h.refreshSignatures.mockRejectedValue(new Error('shared outage'))

      const w1 = mountHost({ collect: () => paths })
      const w2 = mountHost({ collect: () => paths })
      // 同一轮定时两实例都失败 → 用户只看到一条相同文案
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)
      // 连发不刷屏：各自 becameFailure 已消耗，再来一轮仍不弹
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)

      // 全恢复 → 模块标志复位
      h.refreshSignatures.mockReset()
      h.refreshSignatures.mockResolvedValue({ urls: {} })
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)

      // 恢复后新一轮：一实例失败 + 一实例成功 → 失败侧重新提示（「恢复重置」语义保持）
      h.refreshSignatures.mockRejectedValueOnce(new Error('down again'))
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS)
      expect(h.messageWarning).toHaveBeenCalledTimes(2)

      w1.wrapper.unmount()
      w2.wrapper.unmount()
    })

    // WEB-01（debug-swarm 11-24）：跨页面首败警告被吞回归。
    // 复现：A 页唯一实例离线失败（警告弹出、模块标志置位且全程保持离线）→ 卸载 A 页
    //（活跃实例归零 → 清标志）→ 路由到 B 页新实例 → 首败必须重新弹出可见警告。
    it('跨页面：A 页失败后卸载，B 页新实例首败仍提示（活跃实例归零清标志）', async () => {
      const paths = makePaths(10)
      h.refreshSignatures.mockReset()
      h.refreshSignatures.mockRejectedValue(new Error('offline'))

      // 页面 A：唯一实例离线首败，弹一条
      const pageA = mountHost({ collect: () => paths })
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
      expect(h.messageWarning).toHaveBeenCalledTimes(1)
      // 保持离线、不做任何成功刷新，直接离开页面
      pageA.wrapper.unmount()

      // 页面 B：全新实例首败；标志已随 A 卸载归零复位 → 必须重新提示（修复前被吞）
      const pageB = mountHost({ collect: () => paths })
      await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 100)
      expect(h.messageWarning).toHaveBeenCalledTimes(2)
      pageB.wrapper.unmount()
    })
  })
})
