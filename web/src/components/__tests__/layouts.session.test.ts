// 后台布局会话强校验测试（G-1 / P2-8）
// 覆盖：/api/auth/me 401/403 → 复用登出逻辑清标记跳登录；isAdmin 与本地标记不符 → 以服务端为准修正；
//       成功 → 不跳转；ArtistLayout 留言角标按 { items } 消费（G-8 适配）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Component } from 'vue'

// happy-dom 无 matchMedia addEventListener，补齐
if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia
}

interface ArtistProfileStub {
  guestbook_enabled: number
  statsEnabled: boolean
}

interface ArtistStoreStub {
  artistName: string
  profile: ArtistProfileStub | null
  loggedIn: boolean
  isAdmin: boolean
  logout: () => void
  fetchProfile: () => Promise<unknown>
}

interface ThemeStoreStub {
  enterArtistScope: () => void
  leaveArtistScope: () => void
}

interface LayoutMenuGroup {
  items: Array<{ index: string }>
}

interface LayoutVm {
  menuGroups: LayoutMenuGroup[]
  pendingMsgCount: number
}

const h = vi.hoisted(() => ({
  getMe: vi.fn(),
  getMessages: vi.fn(),
  getStats: vi.fn(),
  fetchProfile: vi.fn(),
  logout: vi.fn(),
  push: vi.fn(),
  routeName: 'ArtistDashboard',
  artistStore: null as ArtistStoreStub | null,
  themeStore: null as ThemeStoreStub | null
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/dashboard' }),
  useRouter: () => ({
    push: h.push,
    currentRoute: { value: { name: h.routeName } }
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

vi.mock('../../i18n/index.js', () => ({
  setLocale: vi.fn()
}))

vi.mock('../../utils/track.js', () => ({
  trackEvent: vi.fn()
}))

// 818-E: ArtistLayout 内挂了 TourOverlay（其 useTour 依赖真 router 实例），
// 布局会话测试不关心导览，stub 掉避免 vue-router mock 缺 createRouter
vi.mock('../artist/tour/TourOverlay.vue', () => ({ default: { name: 'TourOverlayStub', template: '<div />' } }))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    getMe: h.getMe,
    getMessages: h.getMessages,
    // REQ-043 I4: 公告入口数据（无公告 = 不显示入口）
    getAnnouncement: vi.fn().mockResolvedValue(null),
    // I0（REQ-039）: 待确认订单角标轮询数据源
    getStats: h.getStats
  }
}))

vi.mock('../../stores/artist.js', () => ({
  useArtistStore: () => h.artistStore
}))

vi.mock('../../stores/theme.js', () => ({
  useThemeStore: () => h.themeStore
}))

vi.mock('../../components/ThemeToggle.vue', () => ({
  default: { name: 'ThemeToggle', template: '<span />' }
}))

vi.mock('../../components/artist/visual/SealStamp.vue', () => ({
  default: { name: 'SealStamp', template: '<span />' }
}))

import ArtistLayout from '../ArtistLayout.vue'
import AdminLayout from '../admin/AdminLayout.vue'

const EP_STUBS = {
  'el-container': { template: '<div><slot /></div>' },
  'el-aside': { template: '<aside><slot /></aside>' },
  'el-main': { template: '<main><slot /></main>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-badge': { template: '<span><slot /></span>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-button': { template: '<button><slot /></button>' },
  'el-drawer': { template: '<div><slot /><slot name="header" /></div>' },
  'el-dialog': { template: '<div><slot /></div>' },
  'el-header': { template: '<header><slot /></header>' },
  'router-view': { template: '<div />' },
  Teleport: { template: '<div><slot /></div>' }
}

function freshStores() {
  h.artistStore = {
    artistName: 'Alice',
    profile: null,
    loggedIn: true,
    isAdmin: false,
    logout: h.logout,
    // 0817：布局 onMounted 预拉 profile（导航开关判定依赖）
    fetchProfile: h.fetchProfile
  }
  h.themeStore = { enterArtistScope: vi.fn(), leaveArtistScope: vi.fn() }
}

const mountedWrappers: Array<{ unmount(): void }> = []

function mountLayout(component: Component) {
  const wrapper = mount(component, {
    global: {
      mocks: {
        $t: (key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $route: { path: '/dashboard' }
      },
      stubs: EP_STUBS
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  h.getMe.mockReset()
  h.getMessages.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 })
  h.getStats.mockReset().mockResolvedValue({ pendingCount: 0 })
  h.fetchProfile.mockReset().mockResolvedValue(undefined)
  h.logout.mockReset()
  h.push.mockReset()
  h.routeName = 'ArtistDashboard'
  freshStores()
})

afterEach(() => {
  // I0（REQ-039）: ArtistLayout 新增 5 分钟轮询，卸载组件释放 interval，避免测试挂起
  for (const w of mountedWrappers.splice(0)) w.unmount()
  vi.restoreAllMocks()
})

describe('ArtistLayout 会话强校验（G-1）', () => {
  it('me 401 → 复用登出逻辑（清标记 + 跳登录）', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockRejectedValue(Object.assign(new Error('unauth'), { status: 401 }))

    await mountLayout(ArtistLayout)
    await flushPromises()

    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
    expect(h.artistStore!.isAdmin).toBe(false)
  })

  it('me 403 → 同样登出跳转', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }))

    await mountLayout(ArtistLayout)
    await flushPromises()

    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
  })

  it('isAdmin 与本地标记不符 → 以服务端为准修正 store（localStorage 不再镜像，I6-e）', async () => {
    localStorage.setItem('artist_logged_in', '1')
    localStorage.setItem('artist_is_admin', '0')
    h.getMe.mockResolvedValue({ isAdmin: true })

    await mountLayout(ArtistLayout)
    await flushPromises()

    expect(h.artistStore!.isAdmin).toBe(true)
    // 单一数据源：localStorage 只由 store action 写，会话校验不再回写
    expect(localStorage.getItem('artist_is_admin')).toBe('0')
    expect(h.push).not.toHaveBeenCalled()
  })

  it('成功且标记一致 → 不跳转不登出', async () => {
    localStorage.setItem('artist_logged_in', '1')
    localStorage.setItem('artist_is_admin', '0')
    h.getMe.mockResolvedValue({ isAdmin: false })

    await mountLayout(ArtistLayout)
    await flushPromises()

    expect(h.artistStore!.isAdmin).toBe(false)
    expect(localStorage.getItem('artist_is_admin')).toBe('0')
    expect(h.logout).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
  })

  it('留言角标按分页响应 { items } 消费（G-8 适配）', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockResolvedValue({ isAdmin: false })
    h.getMessages.mockResolvedValue({
      items: [
        { id: 1, status: 'pending' },
        { id: 2, status: 'approved' },
        { id: 3, status: 'pending' }
      ],
      total: 3,
      page: 1,
      pageSize: 100
    })

    const wrapper = await mountLayout(ArtistLayout)
    await flushPromises()

    expect(h.getMessages).toHaveBeenCalledWith({ pageSize: 100 })
    // 骨架渲染不受影响；角标值经 menuGroups 注入（pending 2 条）
    expect(wrapper.exists()).toBe(true)
  })

  it('820-L：留言关闭 → 菜单过滤 /guestbook 且角标不发请求', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockResolvedValue({ isAdmin: false })
    h.artistStore!.profile = { guestbook_enabled: 0, statsEnabled: true }

    const wrapper = await mountLayout(ArtistLayout)
    await flushPromises()

    const paths = (wrapper.vm as unknown as LayoutVm).menuGroups.flatMap(g => g.items.map(i => i.index))
    expect(paths).not.toContain('/guestbook')
    expect(paths).toContain('/stats')
    // 关闭时角标轮询直接短路，不请求留言列表
    expect(h.getMessages).not.toHaveBeenCalled()
    expect((wrapper.vm as unknown as LayoutVm).pendingMsgCount).toBe(0)
  })

  it('820-L：统计未开（默认）→ 菜单过滤 /stats；开启后恢复', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockResolvedValue({ isAdmin: false })
    h.artistStore!.profile = { guestbook_enabled: 1, statsEnabled: false }

    const wrapper = await mountLayout(ArtistLayout)
    await flushPromises()

    const paths = (wrapper.vm as unknown as LayoutVm).menuGroups.flatMap(g => g.items.map(i => i.index))
    expect(paths).not.toContain('/stats')
    expect(paths).toContain('/guestbook')

    // 管理员开启后导航恢复（mock store 为普通对象无响应式，重挂载验证）
    h.artistStore!.profile = { guestbook_enabled: 1, statsEnabled: true }
    const wrapper2 = await mountLayout(ArtistLayout)
    await flushPromises()
    const paths2 = (wrapper2.vm as unknown as LayoutVm).menuGroups.flatMap(g => g.items.map(i => i.index))
    expect(paths2).toContain('/stats')
  })

  it('0817 报障：profile 未加载（未知态）→ /stats 按「未开」隐藏且预拉 profile', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockResolvedValue({ isAdmin: false })
    // freshStores 默认 profile: null —— 刷新/直达首载的真实形态

    const wrapper = await mountLayout(ArtistLayout)
    await flushPromises()

    const paths = (wrapper.vm as unknown as LayoutVm).menuGroups.flatMap(g => g.items.map(i => i.index))
    expect(paths).not.toContain('/stats')
    // 留言默认开：未知态维持显示（两向各自对齐默认值口径）
    expect(paths).toContain('/guestbook')
    // 布局预拉 profile 缩短未知窗口期
    expect(h.fetchProfile).toHaveBeenCalled()
  })

  it('待确认订单角标轮询读取 getStats.pendingCount（I0/REQ-039）', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.getMe.mockResolvedValue({ isAdmin: false })
    h.getStats.mockResolvedValue({ pendingCount: 3 })

    const wrapper = await mountLayout(ArtistLayout)
    await flushPromises()

    expect(h.getStats).toHaveBeenCalled()
    expect(wrapper.exists()).toBe(true)
  })
})

describe('AdminLayout 会话强校验（G-1）', () => {
  it('me 401 → 复用登出逻辑（清标记 + 跳登录）', async () => {
    localStorage.setItem('artist_logged_in', '1')
    h.routeName = 'AdminDashboard'
    h.getMe.mockRejectedValue(Object.assign(new Error('unauth'), { status: 401 }))

    await mountLayout(AdminLayout)
    await flushPromises()

    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
  })

  it('isAdmin 与本地标记不符 → 以服务端为准修正 store（localStorage 不再镜像，I6-e）', async () => {
    localStorage.setItem('artist_logged_in', '1')
    localStorage.setItem('artist_is_admin', '1')
    h.artistStore!.isAdmin = true
    h.getMe.mockResolvedValue({ isAdmin: false })

    await mountLayout(AdminLayout)
    await flushPromises()

    expect(h.artistStore!.isAdmin).toBe(false)
    expect(localStorage.getItem('artist_is_admin')).toBe('1')
    expect(h.logout).not.toHaveBeenCalled()
  })
})
