// REQ-037 批2 A1: 画师后台嵌套路由解析测试
// 覆盖：子路由经父布局解析（matched=2）；/tiers 冻结区保持 flat（matched=1）；tools 子路径解析
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../stores/artist.js', () => ({
  useArtistStore: () => ({ loggedIn: true, isAdmin: false })
}))
vi.mock('../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: vi.fn(), leaveArtistScope: vi.fn() })
}))
vi.mock('../../i18n/index.js', () => ({
  default: { global: { t: (key) => key } }
}))

import router from '../index.js'

// REQ-038: setup 状态接口 mock（测试密封——不依赖恰好在跑的 dev server）
const setupStatusMock = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ initialized: true, tokenRequired: false })
})

describe('画师后台嵌套路由（REQ-037 批2 A1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(setupStatusMock))
    window.localStorage.setItem('artist_logged_in', '1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.removeItem('artist_logged_in')
  })

  // 812 裁决：本用例首载懒加载整条 Dashboard 组件链，本机冷态 transform 实测 ~5.1s
  // 恰好越过默认 5s 哨兵（非功能 bug），故单列 20s 超时；其余用例仍受默认哨兵保护
  it('/dashboard 解析为 ArtistDashboard，matched = 父布局 + 子页面', async () => {
    await router.push('/dashboard')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('ArtistDashboard')
    expect(router.currentRoute.value.matched.length).toBe(2)
  }, 20000)

  it('/tiers 保持 flat（REQ-036 冻结区内嵌布局），matched = 1', async () => {
    await router.push('/tiers')
    expect(router.currentRoute.value.name).toBe('ArtistTiers')
    expect(router.currentRoute.value.matched.length).toBe(1)
  })

  it('tools 子路径解析正确（/tools/note → ArtistQuickNote）', async () => {
    await router.push('/tools/note')
    expect(router.currentRoute.value.name).toBe('ArtistQuickNote')
    expect(router.currentRoute.value.matched.length).toBe(2)
  })

  it('工具箱首页解析正确（/tools → ArtistToolbox，纸墨提案 §5.5 收纳入口）', async () => {
    await router.push('/tools')
    expect(router.currentRoute.value.name).toBe('ArtistToolbox')
    expect(router.currentRoute.value.matched.length).toBe(2)
  })

  // 812-tools-a: 新工具波 A 三个子路由（报价单/改稿计数/压图改尺寸）
  it('新工具子路由解析正确（/tools/quote|revision-count|image-resize）', async () => {
    const cases = [
      { path: '/tools/quote', name: 'ArtistQuote' },
      { path: '/tools/revision-count', name: 'ArtistRevisionCount' },
      { path: '/tools/image-resize', name: 'ArtistImageResize' }
    ]
    for (const c of cases) {
      await router.push(c.path)
      expect(router.currentRoute.value.name).toBe(c.name)
      expect(router.currentRoute.value.matched.length).toBe(2)
    }
  })
})
