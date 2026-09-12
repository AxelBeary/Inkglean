// F-09 巨型文件拆分（ArtistLayout.vue）拆后专项自查：
// ① 菜单可达性——侧栏/抽屉每项 index 都能在真·router 路由表里命中，且导航渲染片段未被子件截断；
// ② 公告未读小圆点 + 点开即已读写入 + 语言切换 + 汉堡→抽屉，穿过新子件仍然生效；
// ③ 5 分钟轮询定时器在卸载时被清理（L-5/I0）；
// ④ 页宽三档下发链路（pageWidthStyle → .main-content-inner 内联样式 + container 查询上下文）留在本文件。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
// 源码级证据走 vite ?raw 静态导入（本仓 tsconfig types 仅 vite/client，不引 node:fs/process）
import parentSrc from '../../ArtistLayout.vue?raw'
import layoutToolsRaw from '../LayoutTools.vue?raw'
import mobileTopbarRaw from '../MobileTopbar.vue?raw'
import announcementDialogRaw from '../AnnouncementDialog.vue?raw'
import artistMenuRaw from '../artistMenu.ts?raw'

// happy-dom 无 matchMedia addEventListener，补齐（同 layouts.session.test.ts 口径）
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

interface LayoutMenuGroup {
  key: string
  items: Array<{ index: string; badge?: number }>
}

interface LayoutVm {
  menuGroups: LayoutMenuGroup[]
  drawerMenuGroups: LayoutMenuGroup[]
  pendingMsgCount: number
  announcementOpen: boolean
  isMobile: boolean
  drawerVisible: boolean
  pageWidthStyle: Record<string, string>
}

const h = vi.hoisted(() => ({
  getMe: vi.fn(),
  getMessages: vi.fn(),
  getStats: vi.fn(),
  getAnnouncement: vi.fn(),
  getDashboardPrefs: vi.fn(),
  fetchProfile: vi.fn(),
  setLocale: vi.fn(),
  logout: vi.fn(),
  push: vi.fn(),
  artistStore: null as ArtistStoreStub | null
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

// vue-router：保留真实实现（供 import 真·路由表用），只替换组合式 API
vi.mock('vue-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('vue-router')
  return {
    ...actual,
    useRoute: () => ({ path: '/dashboard' }),
    useRouter: () => ({ push: h.push, currentRoute: { value: { name: 'ArtistDashboard' } } })
  }
})

vi.mock('../../../i18n/index.js', () => ({ setLocale: h.setLocale }))
vi.mock('../../../utils/track.js', () => ({ trackEvent: vi.fn() }))
// 818-E：TourOverlay 依赖真 router 实例，导览与本页拆分无关，stub 掉
vi.mock('../../../components/artist/tour/TourOverlay.vue', () => ({
  default: { name: 'TourOverlayStub', template: '<div />' }
}))
vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getMe: h.getMe,
    getMessages: h.getMessages,
    getStats: h.getStats,
    getAnnouncement: h.getAnnouncement,
    getDashboardPrefs: h.getDashboardPrefs
  }
}))
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => h.artistStore
}))
vi.mock('../../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: vi.fn(), leaveArtistScope: vi.fn() })
}))
vi.mock('../../../components/ThemeToggle.vue', () => ({
  default: { name: 'ThemeToggle', template: '<span />' }
}))
vi.mock('../../../components/artist/visual/SealStamp.vue', () => ({
  default: { name: 'SealStamp', template: '<span />' }
}))

import ArtistLayout from '../../ArtistLayout.vue'
import realRouter from '../../../router'

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
  // 导航链接走真 index：证明菜单渲染片段（含拆出的顶栏/工具子件）没截断 router 联动
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
  Teleport: { template: '<div><slot /></div>' }
}

function mountLayout() {
  const wrapper = mount(ArtistLayout, {
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

const mountedWrappers: Array<{ unmount(): void }> = []

/** 真·路由表里注册的全部路径（嵌套子路由已归一为绝对路径） */
const ROUTE_PATHS = new Set(realRouter.getRoutes().map(r => r.path))

beforeEach(() => {
  localStorage.clear()
  h.getMe.mockReset().mockResolvedValue({ isAdmin: true })
  h.getMessages.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 })
  h.getStats.mockReset().mockResolvedValue({ pendingCount: 0 })
  h.getAnnouncement.mockReset().mockResolvedValue(null)
  h.getDashboardPrefs.mockReset().mockResolvedValue({ pageAlign: 'center', pageMax: 1350 })
  h.fetchProfile.mockReset().mockResolvedValue(undefined)
  h.setLocale.mockReset()
  h.logout.mockReset()
  h.push.mockReset()
  h.artistStore = {
    artistName: 'Alice',
    profile: { guestbook_enabled: 1, statsEnabled: true },
    loggedIn: true,
    isAdmin: true,
    logout: h.logout,
    fetchProfile: h.fetchProfile
  }
})

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('F-09 拆分后 ArtistLayout 菜单可达性', () => {
  it('侧栏 + 抽屉每项 index 均命中真·router 路由路径', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const vm = wrapper.vm as unknown as LayoutVm

    const sidePaths = vm.menuGroups.flatMap(g => g.items.map(i => i.index))
    const drawerPaths = vm.drawerMenuGroups.flatMap(g => g.items.map(i => i.index))
    const unresolved = [...new Set([...sidePaths, ...drawerPaths])].filter(p => !ROUTE_PATHS.has(p))
    expect(unresolved).toEqual([])

    // 搬出注册表后仍齐活：三组导航 + 管理员入口 + 工具箱把手 + 抽屉四分类格
    expect(sidePaths).toEqual(expect.arrayContaining(['/dashboard', '/queue', '/orders', '/slots', '/guestbook', '/tools', '/stats', '/account', '/admin']))
    expect(vm.menuGroups.map(g => g.key)).toEqual(['work', 'biz', 'tools', 'front'])
    expect(drawerPaths).toEqual(expect.arrayContaining(['/tools', '/tools/food', '/tools/income', '/stats']))

    // DOM 侧证据：侧栏与抽屉的 router-link 都渲染出来了（导航片段未被截断）
    const hrefs = wrapper.findAll('a.nav-item').map(a => a.attributes('href'))
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/tools/food')
    expect(hrefs).toContain('/admin')
  })

  it('角标注入仍走父页 menuGroups（留言/订单 pending 数穿过注册表生效）', async () => {
    h.getMessages.mockResolvedValue({
      items: [{ id: 1, status: 'pending' }, { id: 2, status: 'approved' }, { id: 3, status: 'pending' }],
      total: 3,
      page: 1,
      pageSize: 100
    })
    h.getStats.mockResolvedValue({ pendingCount: 4 })
    const wrapper = mountLayout()
    await flushPromises()
    const vm = wrapper.vm as unknown as LayoutVm
    const flat = vm.menuGroups.flatMap(g => g.items)
    expect(flat.find(i => i.index === '/guestbook')?.badge).toBe(2)
    expect(flat.find(i => i.index === '/orders')?.badge).toBe(4)
    expect(vm.pendingMsgCount).toBe(2)
  })
})

describe('F-09 拆分后 ArtistLayout 公告与工具区联动', () => {
  const ANNOUNCEMENT = { id: 1, title: '公告标题', content: '公告正文', updatedAt: '2026-08-01 10:00:00' }

  it('未读圆点渲染在拆出的 LayoutTools 内；点击后弹窗打开 + 已读戳写本地，且公告只拉一次', async () => {
    h.getAnnouncement.mockResolvedValue(ANNOUNCEMENT)
    const wrapper = mountLayout()
    await flushPromises()
    const vm = wrapper.vm as unknown as LayoutVm

    const btn = wrapper.find('button.announce-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('announce-btn--unread')

    await btn.trigger('click')
    expect(vm.announcementOpen).toBe(true)
    expect(localStorage.getItem('inkglean_announcement_read_at')).toBe(ANNOUNCEMENT.updatedAt)
    // 数据加载与已读写入都在父页：三处工具区共用一个数据源，不会重复请求
    expect(h.getAnnouncement).toHaveBeenCalledTimes(1)
    // 弹窗搬进 AnnouncementDialog 后正文仍渲染（文本插值，无 v-html）
    expect(wrapper.find('.announcement-content').text()).toBe('公告正文')
  })

  it('语言切换按钮随子件 LayoutTools 仍调 setLocale（locale 由子件自取，父页不再转发）', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const langBtns = wrapper.findAll('button.lang-btn')
    expect(langBtns.length).toBe(1) // 桌面展开态只有一处工具区（折叠态与移动端顶栏各自 v-if）
    await langBtns[0].trigger('click')
    expect(h.setLocale).toHaveBeenCalledWith('en')
  })

  it('MobileTopbar 拆分后：汉堡点击仍开抽屉，页面标题仍由父页 pageTitle 注入', async () => {
    const wrapper = mountLayout()
    await flushPromises()
    const vm = wrapper.vm as unknown as LayoutVm
    expect(wrapper.find('header.topbar').exists()).toBe(false)

    vm.isMobile = true
    await nextTick()
    const bar = wrapper.find('header.topbar')
    expect(bar.exists()).toBe(true)
    expect(bar.find('span.topbar-title').text()).toBe('menu.dashboard')
    // 顶栏内的工具 trio 经默认槽注入，公告入口在移动端也渲染
    expect(bar.find('button.announce-btn').exists()).toBe(false) // 无公告 → 不显示
    await bar.find('button.mobile-menu-btn').trigger('click')
    expect(vm.drawerVisible).toBe(true)
  })
})

describe('F-09 拆分后 ArtistLayout 生命周期与骨架', () => {
  it('轮询定时器在卸载时被清理（无残留 timer，卸载后不再发请求）', async () => {
    vi.useFakeTimers()
    const wrapper = mountLayout()
    await flushPromises()
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    const calls = h.getStats.mock.calls.length
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(h.getStats.mock.calls.length).toBe(calls)
  })

  it('页宽三档下发链路未截断：pageWidthStyle → .main-content-inner 内联样式', async () => {
    h.getDashboardPrefs.mockResolvedValue({ pageAlign: 'left', pageMax: 1000 })
    const wrapper = mountLayout()
    await flushPromises()
    const style = wrapper.find('.main-content-inner').attributes('style') ?? ''
    expect(style).toContain('max-width: 1000px')
    expect(style).toContain('margin-left: 0')
    expect(style).toContain('--page-max-w: 1000px')

    h.getDashboardPrefs.mockResolvedValue({ pageAlign: 'full', pageMax: 1680 })
    const wrapper2 = mountLayout()
    await flushPromises()
    const vm2 = wrapper2.vm as unknown as LayoutVm
    expect(vm2.pageWidthStyle['--page-max-w']).toBe('1680px')
    expect(vm2.pageWidthStyle.maxWidth).toBeUndefined()
    const style2 = wrapper2.find('.main-content-inner').attributes('style') ?? ''
    expect(style2).not.toContain('max-width')
  })

  it('源码级证据：容器查询上下文、轮询常量、公告加载仍在 ArtistLayout.vue，且未泄漏进子件', () => {
    for (const frag of [
      '<div class="artist-layout artist-scope">',
      'class="main-content-inner" :style="pageWidthStyle"',
      'container-name: page;',
      'container-type: inline-size;',
      'const PENDING_ORDER_POLL_MS = 5 * 60 * 1000',
      'function stopPendingOrderPolling()',
      'document.addEventListener(\'visibilitychange\', onVisibilityChange)',
      'loadAnnouncement() // REQ-043 I4',
      'safeSetItem(ANNOUNCEMENT_READ_KEY, announcement.value.updatedAt)',
      '<TourOverlay />',
      'watch(() => route.path, () => { loadPagePrefs() })'
    ]) {
      expect(parentSrc).toContain(frag)
    }
    // 单根（818-E/e8 白屏防线）：TourOverlay 不能变成并列第二根
    expect(parentSrc.split('\n').filter(l => l.trim() === '<TourOverlay />').length).toBe(1)

    for (const src of [layoutToolsRaw, mobileTopbarRaw, announcementDialogRaw, artistMenuRaw]) {
      expect(src).not.toContain('container-type: inline-size')
      expect(src).not.toContain('PENDING_ORDER_POLL_MS')
      expect(src).not.toContain('onMounted(')
      expect(src).not.toContain('setInterval')
    }
  })
})
