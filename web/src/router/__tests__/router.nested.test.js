// REQ-037 批2 A1: 画师后台嵌套路由解析测试
// 覆盖：子路由经父布局解析（matched=2）；/tiers 冻结区保持 flat（matched=1）；tools 子路径解析
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../stores/artist.js', () => ({
  useArtistStore: () => ({ isAdmin: false })
}))
vi.mock('../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: vi.fn(), leaveArtistScope: vi.fn() })
}))
vi.mock('../../i18n/index.js', () => ({
  default: { global: { t: (key) => key } }
}))

import router from '../index.js'

describe('画师后台嵌套路由（REQ-037 批2 A1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.setItem('artist_logged_in', '1')
  })

  afterEach(() => {
    window.localStorage.removeItem('artist_logged_in')
  })

  it('/dashboard 解析为 ArtistDashboard，matched = 父布局 + 子页面', async () => {
    await router.push('/dashboard')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('ArtistDashboard')
    expect(router.currentRoute.value.matched.length).toBe(2)
  })

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
})
