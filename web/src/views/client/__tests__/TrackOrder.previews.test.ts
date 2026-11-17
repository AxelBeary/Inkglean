// 迁移 v81 客户侧回归：过程稿块 + 免费修改配额徽标（TrackOrder）
// 覆盖：空数据两块都不渲染 / 张数与 caption 正确 / 时间倒序 / limit=0 不显示徽标 / remaining=0 中性文案 /
//      后端尚未下发新字段（老响应）时页面等同改前
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({ track: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: { no: 'ALICE-001', token: 'tok-1' } })
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

beforeEach(() => {
  h.track.mockReset()
})

describe('TrackOrder 客户侧过程稿（迁移 v81）', () => {
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
