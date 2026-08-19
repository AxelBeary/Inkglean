// router auth guard localStorage 降级测试（P3-10）
// 覆盖：存储读取抛错时守卫按未登录跳登录页（不抛错白屏）；正常标记照常放行
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../stores/artist.js', () => ({
  // REQ-043 I6-e: 守卫只读 store；store 初始化时把 localStorage 标记作为快速路径读取（与生产语义一致）
  useArtistStore: () => ({
    loggedIn: (() => {
      try { return window.localStorage.getItem('artist_logged_in') === '1' } catch { return false }
    })(),
    isAdmin: false
  })
}))
vi.mock('../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: vi.fn(), leaveArtistScope: vi.fn() })
}))
vi.mock('../../i18n/index.js', () => ({
  default: { global: { t: (key: string) => key } }
}))

import router from '../index.js'

describe('router guard 存储禁用降级（P3-10）', () => {
  // vitest 4 的 restoreAllMocks 对 happy-dom Storage.prototype spy 不生效，须显式 mockRestore
  let getItemSpy: MockInstance | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    // REQ-038: setup 状态接口 mock（测试密封——不依赖恰好在跑的 dev server）
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ initialized: true, tokenRequired: false })
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    getItemSpy?.mockRestore()
  })

  // 812 裁决：两个用例都 push('/dashboard')，首载懒加载 Dashboard 链冷态 transform
  // 实测 ~5.1s 越过默认 5s 哨兵（非功能 bug），单列 20s 超时
  it('localStorage.getItem 抛错 → 视为未登录，重定向登录页', async () => {
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    await router.push('/dashboard')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('ArtistLogin')
  }, 20000)

  it('已登录标记正常 → 放行后台路由', async () => {
    window.localStorage.setItem('artist_logged_in', '1')
    await router.push('/dashboard')
    expect(router.currentRoute.value.name).toBe('ArtistDashboard')
    window.localStorage.removeItem('artist_logged_in')
  }, 20000)
})
