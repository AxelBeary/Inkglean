// Dashboard 首渲时序 + 留言卡 ref 回归：
// 1) 偏好未返回前不按默认布局渲染（旧行为会先闪一轮 bars 卷轴，再卸载换款）；
// 2) 偏好与 profile/stats 并行拉取（旧行为排在两轮 RTT 之后，闪动肉眼可见）；
// 3) 偏好失败仍回落默认布局（既有口径不变）；
// 4) 留言卡 ref 走函数式（旧字符串 ref 在 v-for 内被收成数组，load/徽标恒失效）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({
  getDashboardPrefs: vi.fn(),
  getStats: vi.fn(),
  fetchProfile: vi.fn(),
  replace: vi.fn(),
  guestbookLoad: vi.fn(),
  reconnect: null as null | (() => void),
  pendingCount: 0
}))

// 保留真实 createI18n（i18n/index 被 router 链路初始化），仅覆写 useI18n
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key })
  }
})

// 同上：router/index 在子组件链路被初始化，保留真实导出只覆写 useRouter
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useRouter: () => ({ replace: h.replace })
  }
})

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getDashboardPrefs: h.getDashboardPrefs,
    getStats: h.getStats
  }
}))

vi.mock('../../../stores/artist', () => ({
  useArtistStore: () => ({
    profile: ref({ dashboard_default_panel: null }),
    fetchProfile: h.fetchProfile
  })
}))

vi.mock('../../../utils/reconnect', () => ({
  subscribeReconnect: (fn: () => void) => {
    h.reconnect = fn
    return () => {}
  }
}))

vi.mock('../../../utils/defaultPanel', () => ({
  resolveDefaultPanelRoute: () => null
}))

// 留言卡：refreshAll 按函数 ref 调 load()，桩组件必须真暴露该方法
vi.mock('../../../components/artist/dashboard/GuestbookReviewCard.vue', async () => {
  const { defineComponent, h: hyperscript } = await import('vue')
  return {
    default: defineComponent({
      name: 'GuestbookReviewCard',
      props: { maxRows: Number },
      setup(_, { expose }) {
        expose({ load: h.guestbookLoad, pendingCount: h.pendingCount })
        return () => hyperscript('div', { class: 'stub-guestbook' })
      }
    })
  }
})

import Dashboard from '../Dashboard.vue'

/** 未 resolve 的偏好请求：模拟首载期间 prefs 尚未就绪 */
function pendingPrefs() {
  let resolve!: (value: unknown) => void
  const promise = new Promise(r => { resolve = r })
  h.getDashboardPrefs.mockReturnValue(promise)
  return resolve
}

/** 板块子组件全打桩：本文件只验证首渲时序，不跑各板块内部取数 */
const STUB = { template: '<div />' }
const SCHEDULE_STUB = {
  name: 'SchedulePanels',
  props: ['variant'],
  template: '<div class="stub-schedule" :data-variant="variant" />'
}
const CARD_HEAD_STUB = {
  props: ['title'],
  template: '<div class="stub-cardhead"><slot name="extra" /></div>'
}
const STATUS_CHIP_STUB = {
  props: ['type'],
  template: '<span class="stub-chip"><slot /></span>'
}

function mountDashboard() {
  return mount(Dashboard, {
    global: {
      stubs: {
        // 留言卡外壳：未注册 EP 时 el-card 的具名 header 槽不会渲染，这里补最小实现
        'el-card': { template: '<div><slot name="header" /><slot /></div>' },
        CardHead: CARD_HEAD_STUB,
        StatusChip: STATUS_CHIP_STUB,
        GreetingNote: STUB,
        PlaqueStatus: STUB,
        StatCards: STUB,
        SchedulePanels: SCHEDULE_STUB,
        LedgerTodo: STUB,
        ActivityFeed: STUB,
        DashboardAnnouncementCard: STUB,
        OnboardingCard: STUB,
        IncomeTrendMiniCard: STUB,
        IncomeMonthCard: STUB,
        DdlSoonCard: STUB,
        QuickActions: STUB
      }
    }
  })
}

beforeEach(() => {
  h.getDashboardPrefs.mockReset()
  h.getStats.mockReset().mockResolvedValue({})
  h.fetchProfile.mockReset().mockResolvedValue(undefined)
  h.replace.mockReset()
  h.guestbookLoad.mockReset()
  h.reconnect = null
  h.pendingCount = 0
})

describe('Dashboard 首渲等待偏好就绪', () => {
  it('偏好未返回前不渲染任何板块（不先闪默认卷轴）', async () => {
    pendingPrefs()
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.find('.dash-grid').exists()).toBe(false)
    expect(wrapper.find('.stub-schedule').exists()).toBe(false)
    expect(wrapper.find('.dash-skeleton').exists()).toBe(true)
  })

  it('偏好拉取与 profile/stats 并行：profile 悬挂时偏好已发出', async () => {
    pendingPrefs()
    h.fetchProfile.mockReturnValue(new Promise(() => {}))
    mountDashboard()
    await flushPromises()

    expect(h.getDashboardPrefs).toHaveBeenCalledTimes(1)
  })

  it('偏好返回 ledger 后按所选款式渲染，且只渲染一次排期板块', async () => {
    const resolvePrefs = pendingPrefs()
    const wrapper = mountDashboard()
    await flushPromises()

    resolvePrefs({ scheduleStyle: 'ledger', hidden: [], order: ['schedule'] })
    await flushPromises()

    const panels = wrapper.findAll('.stub-schedule')
    expect(panels).toHaveLength(1)
    expect(panels[0].attributes('data-variant')).toBe('ledger')
    expect(wrapper.find('.dash-skeleton').exists()).toBe(false)
  })

  it('偏好隐藏排期板块时不渲染', async () => {
    const resolvePrefs = pendingPrefs()
    const wrapper = mountDashboard()
    await flushPromises()

    resolvePrefs({ scheduleStyle: 'bars', hidden: ['schedule'], order: ['greet', 'schedule'] })
    await flushPromises()

    expect(wrapper.find('.stub-schedule').exists()).toBe(false)
  })

  it('偏好拉取失败仍回落默认布局（bars 款）', async () => {
    h.getDashboardPrefs.mockRejectedValue(new Error('boom'))
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.find('.dash-grid').exists()).toBe(true)
    expect(wrapper.find('.stub-schedule').attributes('data-variant')).toBe('bars')
  })
})

describe('留言卡函数 ref（v-for 内字符串 ref 会退化成数组）', () => {
  it('重连刷新真的调到留言卡 load()', async () => {
    h.getDashboardPrefs.mockResolvedValue({ scheduleStyle: 'bars', hidden: [], order: ['guestbook'] })
    mountDashboard()
    await flushPromises()

    expect(h.reconnect).toBeTypeOf('function')
    h.reconnect?.()
    await flushPromises()

    expect(h.guestbookLoad).toHaveBeenCalled()
  })

  it('待审数量经 ref 透到卡片徽标', async () => {
    h.pendingCount = 2
    h.getDashboardPrefs.mockResolvedValue({ scheduleStyle: 'bars', hidden: [], order: ['guestbook'] })
    const wrapper = mountDashboard()
    await flushPromises()

    expect(wrapper.find('.stub-chip').text()).toBe('2')
  })
})
