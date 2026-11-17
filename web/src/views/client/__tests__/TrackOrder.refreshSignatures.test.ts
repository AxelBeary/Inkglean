// 查单页停留续签（客户侧 POST /orders/track/:orderNo/refresh-signatures）前端回归
// 修「客户停留超过签名 TTL（5 分钟）后参考图/过程稿全部 403」：TrackOrder 只在 onMounted 取一次数据。
// 覆盖：3 分钟定时续签并原地更新 url / 回前台补签（隐藏态不触发）/ 无图不发请求 / 卸载后停止。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const h = vi.hoisted(() => ({ track: vi.fn(), refresh: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: { no: 'ALICE-001', token: 'tok-1' } })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

vi.mock('../../../api/index.js', () => ({
  orderApi: { track: h.track, refreshTrackSignatures: h.refresh },
  // TrackOrder 复用 useSignatureRefresh，其默认换签函数引用画师端点——本页显式注入客户端点，
  // 这里只为满足模块具名导出（mock 缺 artistApi 会在 import 期报错）
  artistApi: { refreshSignatures: vi.fn() }
}))

vi.mock('../../../composables/useArtistPublicProfile.js', () => ({
  fetchArtistPublicProfile: () => Promise.resolve(null)
}))
vi.mock('../../../composables/usePalette.js', () => ({ usePalette: () => {} }))
vi.mock('../../../composables/useOneTimeDownload.js', () => ({
  confirmOneTimeDownload: vi.fn(),
  downloadOneTimeFile: vi.fn()
}))
vi.mock('../../../components/client/ClientFloatingActions.vue', () => ({
  default: { name: 'ClientFloatingActions', template: '<div />' }
}))
vi.mock('../../../components/shared/OrderTimeline.vue', () => ({
  default: { name: 'OrderTimeline', template: '<div />' }
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

import TrackOrder from '../TrackOrder.vue'
import { DEFAULT_INTERVAL_MS, VISIBLE_REFRESH_THRESHOLD_MS } from '../../../composables/useSignatureRefresh'

/** 查单响应（字段对齐契约 §二 + 既有 track 响应），只写本文件关心的部分 */
function buildTrack(overrides: Record<string, unknown> = {}) {
  return {
    orderNo: 'ALICE-001',
    status: 'wip',
    tierName: '半身',
    artistName: 'Alice',
    description: null,
    references: [] as unknown[],
    position: null,
    total: null,
    workflowStages: [],
    currentStageId: null,
    currentStageName: null,
    deliverables: [],
    extraItems: [],
    finalPriceCents: null,
    paidTotalCents: 0,
    installments: [],
    payments: [],
    deadline: null,
    queueZone: 'formal',
    queueDisplay: null,
    createdAt: '2026-11-01 10:00',
    updatedAt: '2026-11-02 10:00',
    previews: [] as unknown[],
    revisionQuota: { limit: 0, used: 0, remaining: null },
    ...overrides
  }
}

function mountPage() {
  return mount(TrackOrder, {
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $router: { push: vi.fn() }
      },
      stubs: {
        'el-page-header': { template: '<div><slot name="title" /><slot /></div>' },
        'el-card': { template: '<div><slot name="header" /><slot /></div>' },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': true,
        'el-button': { template: '<button><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-descriptions': { template: '<div><slot /></div>' },
        'el-descriptions-item': { template: '<div><slot /></div>' },
        'el-alert': { template: '<div><slot /></div>' },
        'el-steps': { template: '<div><slot /></div>' },
        'el-step': { template: '<div />' },
        'el-progress': { template: '<div />' },
        'el-dialog': { template: '<div><slot /></div>' }
      }
    }
  })
}

/** fake timers 下 flushPromises（内部走 setImmediate，会被伪造）不可用，改用推进 0ms 定时器 */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

beforeEach(() => {
  vi.useFakeTimers()
  h.track.mockReset()
  h.refresh.mockReset()
  h.refresh.mockResolvedValue({ urls: {} })
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TrackOrder 停留续签（客户侧 refresh-signatures）', () => {
  it('每 3 分钟续签一次：参考图与过程稿都换新，且原地只改 url 字段', async () => {
    h.track.mockResolvedValue(buildTrack({
      references: [{ url: '/uploads/references/1/a.png?sig=old', originalName: 'a.png' }],
      previews: [{ id: 7, url: '/uploads/previews/1/p.png?sig=old', caption: null, createdAt: '2026-11-01T10:00:00Z' }]
    }))
    h.refresh.mockResolvedValue({
      urls: {
        'references/1/a.png': '/uploads/references/1/a.png?sig=new',
        'previews/1/p.png': '/uploads/previews/1/p.png?sig=new'
      }
    })
    const wrapper = mountPage()
    await settle()
    expect(h.track).toHaveBeenCalledWith('ALICE-001', 'tok-1')

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 10)
    await nextTick()

    // 令牌随 body 走，路径由已渲染的 URL 反解（含 /uploads/ 前缀去除）
    expect(h.refresh).toHaveBeenCalledWith('ALICE-001', 'tok-1', ['references/1/a.png', 'previews/1/p.png'])
    // 原地更新：模板上的 img src 跟着换，不需要整页重查
    expect(wrapper.find('.brief-ref-img').attributes('src')).toBe('/uploads/references/1/a.png?sig=new')
    expect(wrapper.find('.preview-ref-img').attributes('src')).toBe('/uploads/previews/1/p.png?sig=new')
    wrapper.unmount()
  })

  it('回到前台补签一次；处于隐藏态时不发请求', async () => {
    h.track.mockResolvedValue(buildTrack({
      references: [{ url: '/uploads/references/1/a.png?sig=old', originalName: 'a.png' }]
    }))
    const wrapper = mountPage()
    await settle()

    // 后台定时器被浏览器节流：未到 3 分钟定期点，但已超过回前台补签阈值
    await vi.advanceTimersByTimeAsync(VISIBLE_REFRESH_THRESHOLD_MS + 100)
    expect(h.refresh).not.toHaveBeenCalled()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400)
    expect(h.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400) // 内部 300ms 防抖

    expect(h.refresh).toHaveBeenCalledTimes(1)
    expect(h.refresh).toHaveBeenCalledWith('ALICE-001', 'tok-1', ['references/1/a.png'])
    wrapper.unmount()
  })

  it('没有任何已渲染图片时不发续签请求', async () => {
    h.track.mockResolvedValue(buildTrack())
    const wrapper = mountPage()
    await settle()

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 10)
    await nextTick()
    expect(h.refresh).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('续签返回 skipped 时摘掉对应过程稿（不再留裂图），参考图不动', async () => {
    h.track.mockResolvedValue(buildTrack({
      references: [{ url: '/uploads/references/1/a.png?sig=old', originalName: 'a.png' }],
      previews: [
        { id: 7, url: '/uploads/previews/1/p.png?sig=old', caption: null, createdAt: '2026-11-01T10:00:00Z' },
        { id: 8, url: '/uploads/previews/1/q.png?sig=old', caption: null, createdAt: '2026-11-01T09:00:00Z' }
      ]
    }))
    h.refresh.mockResolvedValue({
      urls: { 'previews/1/q.png': '/uploads/previews/1/q.png?sig=new' },
      skipped: ['previews/1/p.png']
    })
    const wrapper = mountPage()
    await settle()
    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 10)
    await nextTick()

    const previewImgs = wrapper.findAll('.preview-ref-img')
    expect(previewImgs.length).toBe(1)
    expect(previewImgs[0].attributes('src')).toBe('/uploads/previews/1/q.png?sig=new')
    // 参考图不动：客户自己给的输入，不因续签失败擅自删
    expect(wrapper.find('.brief-ref-img').exists()).toBe(true)
    wrapper.unmount()
  })

  it('卸载后定时器与可见性监听都被清理', async () => {
    h.track.mockResolvedValue(buildTrack({
      references: [{ url: '/uploads/references/1/a.png?sig=old', originalName: 'a.png' }]
    }))
    const wrapper = mountPage()
    await settle()
    wrapper.unmount()

    await vi.advanceTimersByTimeAsync(DEFAULT_INTERVAL_MS + 10)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(400)
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
