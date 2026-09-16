// WEB-09 回归：路由守卫 fetch setup/status 后回写 tokenRequired 到 store
// 覆盖：① 守卫 fetch 成功时 store.tokenRequired 被正确回写；
//       ② 守卫 fetch 成功后 store.initialized 被正确回写
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../stores/artist.js', () => ({
  useArtistStore: () => ({ loggedIn: true, isAdmin: false })
}))
vi.mock('../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: vi.fn(), leaveArtistScope: vi.fn() })
}))
vi.mock('../../i18n/index.js', () => ({
  default: { global: { t: (key: string) => key } }
}))

import { useSetupStore } from '../../stores/setup'
import router from '../index'

describe('WEB-09: 路由守卫回写 setup store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('守卫 fetch 返回 tokenRequired=true → store.tokenRequired 被回写为 true', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ initialized: true, tokenRequired: true })
    })))
    window.localStorage.setItem('artist_logged_in', '1')

    const store = useSetupStore()
    expect(store.tokenRequired).toBe(false) // 默认 false

    await router.push('/dashboard')
    await router.isReady()

    expect(store.tokenRequired).toBe(true)
    expect(store.initialized).toBe(true)
  }, 20000)

  it('守卫 fetch 返回 tokenRequired=false → store.tokenRequired 保持 false', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ initialized: true, tokenRequired: false })
    })))
    window.localStorage.setItem('artist_logged_in', '1')

    const store = useSetupStore()
    await router.push('/queue')
    await router.isReady()

    expect(store.tokenRequired).toBe(false)
    expect(store.initialized).toBe(true)
  }, 20000)
})
