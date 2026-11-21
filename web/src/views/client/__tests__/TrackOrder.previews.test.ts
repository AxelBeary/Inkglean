// 迁移 v81 客户侧回归：过程稿块 + 免费修改配额徽标（TrackOrder）
// 覆盖：空数据两块都不渲染 / 张数与 caption 正确 / 时间倒序 / limit=0 不显示徽标 / remaining=0 中性文案 /
//      后端尚未下发新字段（老响应）时页面等同改前
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({ track: vi.fn(), replace: vi.fn(), download: vi.fn(), confirm: vi.fn(), routeGuards: [] as Array<() => void> }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: { no: 'ALICE-001', token: 'tok-1' } }),
  useRouter: () => ({ replace: h.replace }),
  onBeforeRouteLeave: (guard: () => void) => h.routeGuards.push(guard),
  onBeforeRouteUpdate: (guard: () => void) => h.routeGuards.push(guard)
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

vi.mock('../../../api/index.js', () => ({
  orderApi: { track: h.track },
  // TrackOrder 复用 useSignatureRefresh（默认换签函数引用画师端点），mock 需满足其具名导出
  artistApi: { refreshSignatures: vi.fn() }
}))

vi.mock('../../../composables/useArtistPublicProfile.js', () => ({
  fetchArtistPublicProfile: () => Promise.resolve(null)
}))
vi.mock('../../../composables/usePalette.js', () => ({ usePalette: () => {} }))
vi.mock('../../../composables/useOneTimeDownload.js', () => ({
  confirmOneTimeDownload: h.confirm,
  downloadOneTimeFile: h.download
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

type PreviewRow = { id: number; url: string; caption: string | null; createdAt: string }

/** 查单响应（字段对齐契约 §二 + 既有 track 响应） */
function buildTrack(overrides: Record<string, unknown> = {}) {
  return {
    orderNo: 'ALICE-001',
    status: 'wip',
    tierName: '半身',
    artistName: 'Alice',
    description: null as string | null,
    references: [] as unknown[],
    position: null,
    total: null,
    workflowStages: [] as unknown[],
    currentStageId: null,
    currentStageName: null,
    deliverables: [] as unknown[],
    extraItems: [] as unknown[],
    finalPriceCents: null,
    paidTotalCents: 0,
    installments: [] as unknown[],
    payments: [] as unknown[],
    deadline: null,
    queueZone: 'formal',
    queueDisplay: null,
    createdAt: '2026-11-01 10:00',
    updatedAt: '2026-11-02 10:00',
    previews: [] as PreviewRow[],
    revisionQuota: { limit: 0, used: 0, remaining: null as number | null },
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

function saveSecondOrder() {
  localStorage.setItem('huiyue_track_links', JSON.stringify([
    { orderNo: 'ALICE-002', token: 'tok-2', savedAt: Date.now(), invalid: false }
  ]))
}

function selectSavedOrder(wrapper: ReturnType<typeof mountPage>, orderNo: string) {
  return wrapper.findAll('button.my-order-item').find(button => button.get('.my-order-no').text() === orderNo)!.trigger('click')
}

beforeEach(() => {
  localStorage.removeItem('huiyue_track_links')
  h.track.mockReset()
  h.replace.mockReset()
  h.download.mockReset()
  h.confirm.mockReset()
  h.routeGuards.length = 0
})

describe('TrackOrder 客户侧过程稿（迁移 v81）', () => {
  it('已付款的受限订单沿用原令牌进入取件页', async () => {
    h.track.mockResolvedValue({ orderNo: 'ALICE-001', deliveryOnly: true })
    const wrapper = mountPage()
    await flushPromises()

    expect(h.replace).toHaveBeenCalledWith({
      name: 'ClientDelivery',
      params: { subdomain: 'alice', orderNo: 'ALICE-001' },
      query: { token: 'tok-1' }
    })
    expect(wrapper.find('.result-header').exists()).toBe(false)
    wrapper.unmount()
  })

  it('离开查单页后丢弃迟到的受限取件跳转', async () => {
    let resolveTrack: (value: unknown) => void = () => {}
    h.track.mockReturnValue(new Promise<unknown>(resolve => { resolveTrack = resolve }))
    const wrapper = mountPage()

    expect(h.routeGuards).toHaveLength(2)
    h.routeGuards.forEach(guard => guard())
    resolveTrack({ orderNo: 'ALICE-001', deliveryOnly: true })
    await flushPromises()

    expect(h.replace).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('后台补签多件文件时分别隐藏对应下载按钮并显示等待状态', async () => {
    h.track.mockResolvedValue(buildTrack({ deliverables: [{ id: 7, fileName: 'final.zip' }, { id: 8, fileName: 'source.zip' }] }))
    h.download.mockRejectedValue({ code: 'ORDER_CONFLICT', status: 409 })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.findAll('.file-item')[0].find('button').trigger('click')
    await flushPromises()
    await wrapper.findAll('.file-item')[1].find('button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.pickup-pending-label')).toHaveLength(2)
    expect(wrapper.findAll('.pickup-pending-label').map(label => label.text())).toEqual([
      'delivery.deliveryPending', 'delivery.deliveryPending'
    ])
    expect(wrapper.findAll('.file-item button')).toHaveLength(0)
    wrapper.unmount()
  })

  it('切单查询失败时保留当前订单的确认令牌及下载凭证', async () => {
    saveSecondOrder()
    h.track.mockResolvedValueOnce(buildTrack({ deliverables: [{ id: 7, fileName: 'final.zip' }] }))
      .mockRejectedValueOnce(new Error('fixture network failure'))
    h.download.mockResolvedValueOnce({ status: 'confirm-failed', confirmationToken: 'attempt-7' })
    h.confirm.mockResolvedValueOnce({ status: 'confirmed' })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()
    await selectSavedOrder(wrapper, 'ALICE-002')
    await flushPromises()

    expect(h.track).toHaveBeenLastCalledWith('ALICE-002', 'tok-2')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.get('.file-item button').text()).toBe('delivery.retryConfirm')
    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()
    expect(h.confirm).toHaveBeenCalledWith('ALICE-001', 7, 'tok-1', 'attempt-7', expect.any(Function))
    wrapper.unmount()
  })

  it('切单成功后，忽略旧订单迟到的下载确认结果', async () => {
    saveSecondOrder()
    h.track.mockResolvedValueOnce(buildTrack({ deliverables: [{ id: 7, fileName: 'first.zip' }] }))
      .mockResolvedValueOnce(buildTrack({ orderNo: 'ALICE-002', deliverables: [{ id: 7, fileName: 'second.zip' }] }))
    let finishOld!: (result: unknown) => void
    h.download.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve }))
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('.file-item button').trigger('click')
    await selectSavedOrder(wrapper, 'ALICE-002')
    await flushPromises()
    finishOld({ status: 'confirm-failed', confirmationToken: 'old-attempt' })
    await flushPromises()

    expect(wrapper.get('.result-header').text()).toContain('ALICE-002')
    expect(wrapper.get('.file-item button').text()).toBe('common.download')
    h.download.mockResolvedValueOnce({ status: 'confirmed' })
    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()
    expect(h.download).toHaveBeenLastCalledWith('ALICE-002', 7, 'tok-2', 'second.zip', expect.any(Function))
    wrapper.unmount()
  })

  it('下载进行中重查同一订单时保留原确认结果和重试入口', async () => {
    h.track.mockResolvedValue(buildTrack({ deliverables: [{ id: 7, fileName: 'final.zip' }] }))
    let finishDownload!: (result: unknown) => void
    h.download.mockReturnValueOnce(new Promise(resolve => { finishDownload = resolve }))
    h.confirm.mockResolvedValueOnce({ status: 'confirmed' })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('.file-item button').trigger('click')
    await selectSavedOrder(wrapper, 'ALICE-001')
    await flushPromises()
    expect(h.download).toHaveBeenCalledTimes(1)

    finishDownload({ status: 'confirm-failed', confirmationToken: 'attempt-7' })
    await flushPromises()
    expect(wrapper.get('.file-item button').text()).toBe('delivery.retryConfirm')
    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()
    expect(h.confirm).toHaveBeenCalledWith('ALICE-001', 7, 'tok-1', 'attempt-7', expect.any(Function))
    expect(h.download).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('首次查询失败后点重试，重放的是失败那次链接而不是空凭证', async () => {
    h.track.mockRejectedValueOnce(new Error('fixture network failure'))
      .mockResolvedValueOnce(buildTrack({ deliverables: [{ id: 7, fileName: 'final.zip' }] }))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('.result-header').exists()).toBe(false)

    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()

    expect(h.track).toHaveBeenCalledTimes(2)
    expect(h.track).toHaveBeenLastCalledWith('ALICE-001', 'tok-1')
    expect(wrapper.get('.result-header').text()).toContain('ALICE-001')
    wrapper.unmount()
  })

  it('确认成功后显示已下载，不再给出注定失败的下载按钮', async () => {
    h.track.mockResolvedValue(buildTrack({ deliverables: [{ id: 7, fileName: 'final.zip' }] }))
    h.download.mockImplementationOnce((_no, _id, _tok, _name, onConfirmed: () => void) => {
      onConfirmed()
      return Promise.resolve({ status: 'confirmed' })
    })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.file-item button')).toHaveLength(0)
    expect(wrapper.get('.download-locked-label').text()).toBe('delivery.downloadLocked')
    wrapper.unmount()
  })

  it('服务端已标记锁定的文件直接显示已下载，不发请求', async () => {
    h.track.mockResolvedValue(buildTrack({
      deliverables: [{ id: 7, fileName: 'final.zip', downloadLocked: true }]
    }))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('.file-item button')).toHaveLength(0)
    expect(wrapper.find('.download-locked-label').exists()).toBe(true)

    await selectSavedOrder(wrapper, 'ALICE-001')
    await flushPromises()
    expect(h.download).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('补签失效后成功重查同一订单，恢复可下载状态', async () => {
    h.track.mockResolvedValue(buildTrack({ deliverables: [{ id: 7, fileName: 'final.zip' }] }))
    h.download.mockRejectedValueOnce({ code: 'ORDER_CONFLICT', status: 409 })
      .mockResolvedValueOnce({ status: 'confirmed' })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.file-item button').exists()).toBe(false)

    await selectSavedOrder(wrapper, 'ALICE-001')
    await flushPromises()
    expect(wrapper.get('.file-item button').text()).toBe('common.download')
    await wrapper.get('.file-item button').trigger('click')
    await flushPromises()
    expect(h.track).toHaveBeenCalledTimes(2)
    expect(h.download).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('参考图缩略图带有尺寸约束，避免大图按原尺寸撑破容器', async () => {
    // 1c661a24 曾误删 .brief-ref-img 规则，而既有测试只查 src，导致回归无人发现。
    const sources = import.meta.glob('../../../views/client/TrackOrder.vue', { query: '?raw', import: 'default', eager: true })
    const source = Object.values(sources)[0] as string
    const rule = source.match(/\.brief-ref-img\s*\{([^}]*)\}/)
    expect(rule, 'TrackOrder.vue 必须为 .brief-ref-img 定义样式').not.toBeNull()
    expect(rule![1]).toMatch(/width:\s*\d+px/)
    expect(rule![1]).toMatch(/object-fit:\s*cover/)
  })

  it('过程稿与配额都为空：两个区块整块不渲染', async () => {
    h.track.mockResolvedValue(buildTrack())
    const wrapper = mountPage()
    await flushPromises()

    expect(h.track).toHaveBeenCalledWith('ALICE-001', 'tok-1')
    expect(wrapper.find('.preview-block').exists()).toBe(false)
    expect(wrapper.find('.revision-quota').exists()).toBe(false)
    wrapper.unmount()
  })

  it('有过程稿：渲染张数正确、有 caption 的才显示 caption、时间倒序', async () => {
    h.track.mockResolvedValue(buildTrack({
      previews: [
        { id: 11, url: '/p/a.png', caption: '线稿', createdAt: '2026-11-01T10:00:00Z' },
        { id: 12, url: '/p/b.png', caption: null, createdAt: '2026-11-03T10:00:00Z' }
      ]
    }))
    const wrapper = mountPage()
    await flushPromises()

    const items = wrapper.findAll('.preview-ref')
    expect(items).toHaveLength(2)
    // 时间倒序：11-03 的 b.png 在前
    expect(items[0].find('img').attributes('src')).toBe('/p/b.png')
    expect(items[1].find('img').attributes('src')).toBe('/p/a.png')
    // caption 只在有值时渲染
    expect(wrapper.findAll('.preview-ref-caption')).toHaveLength(1)
    expect(items[1].find('.preview-ref-caption').text()).toBe('线稿')
    wrapper.unmount()
  })

  it('limit > 0：显示「已用 N / M」徽标，remaining > 0 时无用完提示', async () => {
    h.track.mockResolvedValue(buildTrack({ revisionQuota: { limit: 3, used: 2, remaining: 1 } }))
    const wrapper = mountPage()
    await flushPromises()

    const quota = wrapper.find('.revision-quota')
    expect(quota.exists()).toBe(true)
    expect(quota.find('.revision-quota-text').text()).toContain('revision.quotaUsed')
    expect(quota.find('.revision-quota-text').text()).toContain('"used":2')
    expect(quota.find('.revision-quota-text').text()).toContain('"limit":3')
    expect(quota.find('.revision-quota-note').exists()).toBe(false)
    wrapper.unmount()
  })

  it('limit > 0 且 remaining = 0：追加中性说明（不出现任何告警类名）', async () => {
    h.track.mockResolvedValue(buildTrack({ revisionQuota: { limit: 3, used: 3, remaining: 0 } }))
    const wrapper = mountPage()
    await flushPromises()

    const note = wrapper.find('.revision-quota-note')
    expect(note.exists()).toBe(true)
    expect(note.text()).toBe('revision.quotaExhausted')
    // 需求明确：不得做成红色警告
    expect(wrapper.find('.revision-quota').classes().join(' ')).not.toMatch(/danger|error|warning/)
    wrapper.unmount()
  })

  it('limit = 0（不限）：不显示任何配额徽标', async () => {
    h.track.mockResolvedValue(buildTrack({
      previews: [{ id: 11, url: '/p/a.png', caption: null, createdAt: '2026-11-01T10:00:00Z' }],
      revisionQuota: { limit: 0, used: 5, remaining: null }
    }))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.findAll('.preview-ref')).toHaveLength(1)
    expect(wrapper.find('.revision-quota').exists()).toBe(false)
    wrapper.unmount()
  })

  it('后端未升级（响应无新字段）：页面照常渲染，两个区块都不出现', async () => {
    const legacy = buildTrack()
    delete (legacy as Record<string, unknown>).previews
    delete (legacy as Record<string, unknown>).revisionQuota
    h.track.mockResolvedValue(legacy)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('.result-header').exists()).toBe(true)
    expect(wrapper.find('.preview-block').exists()).toBe(false)
    expect(wrapper.find('.revision-quota').exists()).toBe(false)
    wrapper.unmount()
  })
})
