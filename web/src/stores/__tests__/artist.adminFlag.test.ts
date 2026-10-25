// issue #52-3（修订 REQ-043 I6-e）：/auth/me 对 isAdmin 的修正必须同时回写持久标记。
// 旧口径「只改内存、不镜像 localStorage」会让被降级的管理员每次刷新都拿旧标记过路由守卫、
// 进管理 UI，直到 /auth/me 返回才纠正（服务端边界不破，纯 UI 反复误判）。
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

describe('artist store setAdminFlag（issue #52-3）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('降级：内存与 artist_is_admin 同时落，刷新后不再以旧标记过守卫', () => {
    window.localStorage.setItem('artist_is_admin', '1')
    const store = useArtistStore()
    expect(store.isAdmin).toBe(true) // state 工厂按持久标记引导

    store.setAdminFlag(false)

    expect(store.isAdmin).toBe(false)
    expect(window.localStorage.getItem('artist_is_admin')).toBe('0')
  })

  it('提权：同一入口写回 1（写入一律走 store action）', () => {
    const store = useArtistStore()

    store.setAdminFlag(true)

    expect(store.isAdmin).toBe(true)
    expect(window.localStorage.getItem('artist_is_admin')).toBe('1')
  })

  it('登出仍清掉持久标记：setAdminFlag 不改变既有登出语义', async () => {
    const store = useArtistStore()
    store.setAdminFlag(true)
    h.logout.mockResolvedValueOnce(undefined)

    await store.logout()

    expect(store.isAdmin).toBe(false)
    expect(window.localStorage.getItem('artist_is_admin')).toBeNull()
  })
})
