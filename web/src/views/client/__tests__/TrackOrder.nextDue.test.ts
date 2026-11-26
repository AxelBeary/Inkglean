// F0314 前端回归：客户查单页「下期应付」改读后端权威 nextDueCents 字段
// 覆盖：字段存在直接采用（优先于本页任何自算）/ 字段缺失（旧后端）回退 legacyNextDueCents
// （含负尾款超付、常规 partial、无节点回退订单级待收）——兼容窗口一个周期的完整行为。
// 断言锚点：.pay-progress-nums 内四枚 <strong> 依序为 [已付, 下期应付, 剩余, 总价]，取第 2 枚。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { formatCents } from '../../../utils/money'

const h = vi.hoisted(() => ({ track: vi.fn(), refresh: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: { no: 'ALICE-001', token: 'tok-1' } }),
  useRouter: () => ({ replace: vi.fn() }),
  onBeforeRouteLeave: () => {},
  onBeforeRouteUpdate: () => {}
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

vi.mock('../../../api/index.js', () => ({
  orderApi: { track: h.track, refreshTrackSignatures: h.refresh },
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

/** 分期节点行（OrderInstallment 形状，本文件只关心 amountCents，其余按契约补齐） */
function inst(id: number, name: string, amountCents: number, paidCents = 0) {
  return {
    id, name, amountCents, paidCents,
    remainingCents: Math.max(0, amountCents - paidCents),
    status: paidCents >= amountCents ? 'paid' : paidCents > 0 ? 'partial' : 'pending',
    locked: false, lockedReason: null
  }
}

/** 查单响应（字段对齐契约 + 既有 track 响应），overrides 里放本用例关心的金额组合 */
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

/** fake timers 下等 onMounted 自动查询落地（对齐 TrackOrder.refreshSignatures.test 的 settle） */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
  await nextTick()
}

/** .pay-progress-nums 四枚 strong：[已付, 下期应付, 剩余, 总价] → 返回「下期应付」文本 */
function nextDueText(wrapper: ReturnType<typeof mountPage>): string {
  const strongs = wrapper.find('.pay-progress-nums').findAll('strong')
  expect(strongs).toHaveLength(4)
  return strongs[1].text()
}

beforeEach(() => {
  vi.useFakeTimers()
  h.track.mockReset()
  h.refresh.mockReset()
  h.refresh.mockResolvedValue({ urls: {} })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TrackOrder 下期应付（F0314：nextDueCents 字段优先 + legacy 回退）', () => {
  it('字段存在：直接采用服务端值（优先于本页自算结果）', async () => {
    // 服务端口径与 legacy 等价时本用例无区分度，故刻意让字段值 ≠ 本页自算（全付清自算为 0），
    // 钉死「字段优先」的优先级契约本身
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 30000,
      paidTotalCents: 30000,
      installments: [inst(1, '定金', 30000, 30000)],
      nextDueCents: 7000
    }))
    const wrapper = mountPage()
    await settle()
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(7000)}`)
  })

  it('字段缺失：回退 legacy 自算——首节点 partial 显示剩余', async () => {
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 30000,
      paidTotalCents: 12000,
      installments: [inst(1, '定金', 30000, 12000)]
    }))
    const wrapper = mountPage()
    await settle()
    // legacy：covered=12000 < 30000 → 30000-12000
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(18000)}`)
  })

  it('字段缺失 + 负尾款纯超付：legacy 不算出负数下期（镜像 server 负尾款用例）', async () => {
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 10000,
      paidTotalCents: 30000,
      installments: [inst(1, '定金', 15000, 15000), inst(2, '尾款', -5000)]
    }))
    const wrapper = mountPage()
    await settle()
    // legacy：Σ正=15000，covered=15000 → 正节点全结清 → 0；服务端 getNextDueCents 同值（尾款负待收被 >0 过滤）
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(0)}`)
  })

  it('字段缺失 + 无分期节点：回退订单级待收 trackRemainingCents', async () => {
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 8000,
      paidTotalCents: 3000,
      installments: []
    }))
    const wrapper = mountPage()
    await settle()
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(5000)}`)
  })

  // M-3（PR114 审计回归）：buffer 订单有价但无分期是正常长期态。旧后端下发的 0
  // 不能被当权威值采信，否则同屏出现「下期应付 ¥0.00 / 剩余 ¥200」自相矛盾。
  it('字段=0 + 无分期节点（buffer 订单）：忽略 0，回退订单级待收', async () => {
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 20000,
      paidTotalCents: 0,
      installments: [],
      nextDueCents: 0,
      queueZone: 'buffer'
    }))
    const wrapper = mountPage()
    await settle()
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(20000)}`)
  })

  it('字段=null + 无分期节点（新后端 M-3 口径）：回退订单级待收', async () => {
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 20000,
      paidTotalCents: 5000,
      installments: [],
      nextDueCents: null
    }))
    const wrapper = mountPage()
    await settle()
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(15000)}`)
  })

  it('字段=0 + 有分期节点且全付清：仍采信 0（本期不欠，与无节点 null 语义区分）', async () => {
    h.track.mockResolvedValue(buildTrack({
      finalPriceCents: 30000,
      paidTotalCents: 30000,
      installments: [inst(1, '定金', 30000, 30000)],
      nextDueCents: 0
    }))
    const wrapper = mountPage()
    await settle()
    expect(nextDueText(wrapper)).toBe(`¥${formatCents(0)}`)
  })

  it('deliveryOnly 最小响应（无金额字段）：付款块整体不渲染，不抛错', async () => {
    h.track.mockResolvedValue({ orderNo: 'ALICE-001', deliveryOnly: true })
    const wrapper = mountPage()
    await settle()
    expect(wrapper.find('.pay-progress-nums').exists()).toBe(false)
  })
})
