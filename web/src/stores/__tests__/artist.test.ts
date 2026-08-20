// artist store localStorage 降级测试（P3-10）
// 覆盖：存储读取抛错时 state 工厂不抛、按未登录降级；正常标记照常初始化
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../api/index.js', () => ({
  authApi: { verify: vi.fn(), me: vi.fn(), logout: vi.fn() },
  artistApi: { getProfile: vi.fn(), getStats: vi.fn() }
}))

import { useArtistStore } from '../artist'

describe('artist store 存储禁用降级（P3-10）', () => {
  // vitest 4 的 restoreAllMocks 对 happy-dom Storage.prototype spy 不生效，须显式 mockRestore
  let getItemSpy: MockInstance | null = null

  afterEach(() => {
    getItemSpy?.mockRestore()
  })

  it('localStorage.getItem 抛错 → store 初始化不抛，降级为未登录', () => {
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    setActivePinia(createPinia())
    const store = useArtistStore()
    expect(store.loggedIn).toBe(false)
    expect(store.isAdmin).toBe(false)
  })

  it('正常存储 → 按已登录标记初始化', () => {
    window.localStorage.setItem('artist_logged_in', '1')
    window.localStorage.setItem('artist_is_admin', '1')
    setActivePinia(createPinia())
    const store = useArtistStore()
    expect(store.loggedIn).toBe(true)
    expect(store.isAdmin).toBe(true)
    window.localStorage.removeItem('artist_logged_in')
    window.localStorage.removeItem('artist_is_admin')
  })
})
