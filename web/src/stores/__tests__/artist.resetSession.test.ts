// issue #52-1/#52-2: 会话清理收敛为 store.resetSession
// 覆盖：登出先清本地态（不等服务端撤销）、401 通路经 resetSession 递增 sessionSeq 拦住旧 profile 回写、
// 5 个 state 字段归零、3 个持久 key 清除（artist_logged_in / artist_is_admin / huiyue_track_links）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
  getStats: vi.fn()
}))

vi.mock('../../api/index.js', () => ({
  authApi: { verify: h.verify, logout: h.logout },
  artistApi: { getProfile: h.getProfile, getStats: h.getStats }
}))

// 401 通路会动态 import router：打桩避免拉起真实路由表与元素库
vi.mock('../../router/index.js', () => ({
  default: {
    currentRoute: { get value() { return { name: 'ArtistDashboard' } } },
    push: vi.fn()
  },
  SETUP_ROUTE: { path: '/setup', name: 'SetupWizard' }
}))

import { useArtistStore } from '../artist'
import { getJson } from '../../api/modules/http'

/** 造一个带业务错误码的 401 响应（AppError 形状） */
function make401(code: string): Response {
  return new Response(JSON.stringify({ code, error: 'raw-server-message' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('artist store 会话清理（issue #52-1/#52-2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('resetSession：5 个 state 字段归零 + 3 个持久 key 清除', async () => {
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: true })
    const store = useArtistStore()
    await store.login('10001', 'code')
    store.stats = { totalOrders: 1, totalIncome: 2 } as never
    store.loading = true
    window.localStorage.setItem('huiyue_track_links', '[]')
    expect(window.localStorage.getItem('artist_is_admin')).toBe('1')

    store.resetSession()

    expect(store.loggedIn).toBe(false)
    expect(store.profile).toBeNull()
    expect(store.stats).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.isAdmin).toBe(false)
    expect(window.localStorage.getItem('artist_logged_in')).toBeNull()
    expect(window.localStorage.getItem('artist_is_admin')).toBeNull()
    expect(window.localStorage.getItem('huiyue_track_links')).toBeNull()
  })

  it('登出先清本地态再发撤销请求：服务端请求不 resolve 也不拖住登出（#52-1）', () => {
    const store = useArtistStore()
    store.loggedIn = true
    window.localStorage.setItem('artist_logged_in', '1')
    // 撤销请求悬挂（等价 http 层 15s 超时前的等待）
    h.logout.mockReturnValueOnce(new Promise(() => {}))

    store.logout()

    expect(store.loggedIn).toBe(false)
    expect(store.profile).toBeNull()
    expect(window.localStorage.getItem('artist_logged_in')).toBeNull()
  })

  it('撤销请求失败不影响本地登出，也不产生未处理拒绝（#52-1）', async () => {
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: false })
    const store = useArtistStore()
    await store.login('10001', 'code')
    h.logout.mockRejectedValueOnce(new Error('network down'))

    store.logout()
    await Promise.resolve()

    expect(store.loggedIn).toBe(false)
  })

  it('401 通路走 resetSession：序号递增后，在途 fetchProfile 的旧画像不得写回（#52-2）', async () => {
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: false })
    const store = useArtistStore()
    await store.login('10001', 'code')

    // A 的 fetchProfile 在途（延迟响应）
    let resolveProfile: ((v: unknown) => void) | undefined
    h.getProfile.mockReturnValueOnce(new Promise(r => { resolveProfile = r }))
    const pending = store.fetchProfile()

    // 真实 http 错误分支触发 401 → fail() 内调用 store.resetSession()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(make401('SESSION_EXPIRED'))))
    await getJson('/probe').catch(() => undefined)
    expect(store.loggedIn).toBe(false)

    // 旧响应晚到 → 会话序号已变，不得把 A 的画像写回
    resolveProfile!({ id: 1, name: 'A-stale', subdomain: 'a' })
    await pending
    expect(store.profile).toBeNull()
  })
})
