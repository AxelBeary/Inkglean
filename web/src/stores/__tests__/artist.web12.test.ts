// WEB-12: artist store 会话序号守卫测试
// 覆盖：logout→login(B) 后 A 的 in-flight 响应不得回写新画师 state
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import { useArtistStore } from '../artist'

describe('artist store WEB-12 会话序号守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('logout→login(B) 后 A 的 in-flight fetchProfile 响应不得回写 B 的 profile', async () => {
    const store = useArtistStore()

    // A 登录
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: false })
    await store.login('10001', 'code')
    expect(store.profile?.name).toBe('A')

    // A 的 fetchProfile 在途（延迟响应）
    let resolveA: ((v: unknown) => void) | undefined
    h.getProfile.mockReturnValueOnce(new Promise(r => { resolveA = r }))
    const fetchA = store.fetchProfile()

    // A 登出 → B 登录
    h.logout.mockResolvedValueOnce(undefined)
    await store.logout()
    h.verify.mockResolvedValueOnce({ artist: { id: 2, name: 'B', subdomain: 'b' }, isAdmin: false })
    await store.login('10002', 'code')
    expect(store.profile?.name).toBe('B')

    // A 的在途响应晚到 → 不得覆盖 B 的 profile
    resolveA!({ id: 1, name: 'A-stale', subdomain: 'a' })
    await fetchA
    expect(store.profile?.name).toBe('B') // 仍是 B，未被 A 的旧响应污染
  })

  it('logout→login(B) 后 A 的 in-flight fetchStats 响应不得回写 B 的 stats', async () => {
    const store = useArtistStore()

    // A 登录
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: false })
    await store.login('10001', 'code')

    // A 的 fetchStats 在途
    let resolveA: ((v: unknown) => void) | undefined
    h.getStats.mockReturnValueOnce(new Promise(r => { resolveA = r }))
    const fetchA = store.fetchStats()

    // A 登出 → B 登录
    h.logout.mockResolvedValueOnce(undefined)
    await store.logout()
    h.verify.mockResolvedValueOnce({ artist: { id: 2, name: 'B', subdomain: 'b' }, isAdmin: false })
    await store.login('10002', 'code')

    // B 的 stats 初始为 null
    expect(store.stats).toBeNull()

    // A 的在途响应晚到 → 不得覆盖 B 的 stats
    resolveA!({ totalOrders: 999, totalIncome: 88800 })
    await fetchA
    expect(store.stats).toBeNull() // 仍是 null，未被 A 的旧响应污染
  })

  it('applySession 递增序号使旧在途请求失效', async () => {
    const store = useArtistStore()

    // A 登录
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: false })
    await store.login('10001', 'code')

    // A 的 fetchProfile 在途
    let resolveA: ((v: unknown) => void) | undefined
    h.getProfile.mockReturnValueOnce(new Promise(r => { resolveA = r }))
    const fetchA = store.fetchProfile()

    // 不经过 logout，直接 applySession(B)（如 Passkey 换会话）
    store.applySession({ id: 2, name: 'B', subdomain: 'b' } as never, false)

    // A 的在途响应晚到 → 不得覆盖
    resolveA!({ id: 1, name: 'A-stale', subdomain: 'a' })
    await fetchA
    expect(store.profile?.name).toBe('B')
  })

  it('logout 重置 loading（旧在途请求的 finally 不再负责熄灭）', async () => {
    const store = useArtistStore()
    h.verify.mockResolvedValueOnce({ artist: { id: 1, name: 'A', subdomain: 'a' }, isAdmin: false })
    await store.login('10001', 'code')

    // fetchProfile 在途，loading=true
    let resolveA: ((v: unknown) => void) | undefined
    h.getProfile.mockReturnValueOnce(new Promise(r => { resolveA = r }))
    const fetchA = store.fetchProfile()
    expect(store.loading).toBe(true)

    // logout → loading 立即重置
    h.logout.mockResolvedValueOnce(undefined)
    await store.logout()
    expect(store.loading).toBe(false)

    // 旧响应到达，finally 不再改 loading
    resolveA!({ id: 1, name: 'A', subdomain: 'a' })
    await fetchA
    expect(store.loading).toBe(false)
  })
})
