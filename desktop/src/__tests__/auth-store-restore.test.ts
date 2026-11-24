// F0031（B6）: 桌面 auth store restore() 半态回归——
// 损坏的 artist 档案密文不得留下「已登录但 artist 为空」；解析成功才原子写入 token+artist。
// 保险箱/环境桥全部 mock，只测 store 自身的时序，不依赖 Tauri 运行时。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const h = vi.hoisted(() => ({
  token: 'tok-1' as string | null,
  artist: null as string | null,
  loadError: null as Error | null,
  saveSecret: vi.fn(),
  deleteSecret: vi.fn()
}))

vi.mock('../bridge/env', () => ({ isDesktop: () => true }))
vi.mock('../bridge/secureStore', () => ({
  // 保险箱按 key 模拟：session-token / session-artist 与 store 内 KEY_* 常量一致
  loadSecret: (key: string) => {
    if (h.loadError) return Promise.reject(h.loadError)
    return Promise.resolve(key === 'session-token' ? h.token : h.artist)
  },
  saveSecret: h.saveSecret,
  deleteSecret: h.deleteSecret
}))
vi.mock('../api/desktop', () => ({
  desktopLogin: vi.fn(),
  desktopLogout: vi.fn()
}))

import { useAuthStore } from '../stores/auth'

const ARTIST_JSON = JSON.stringify({ id: 1, name: '墨笔', subdomain: 'mob', qqNumber: '10001' })

beforeEach(() => {
  setActivePinia(createPinia())
  h.token = 'tok-1'
  h.artist = ARTIST_JSON
  h.loadError = null
  h.saveSecret.mockClear()
  h.deleteSecret.mockClear()
})

describe('restore() 会话恢复（F0031 半态守卫）', () => {
  it('合法档案 → token+artist 原子恢复为已登录态', async () => {
    const store = useAuthStore()
    await store.restore()
    expect(store.token).toBe('tok-1')
    expect(store.artist).toMatchObject({ id: 1, name: '墨笔', subdomain: 'mob', qqNumber: '10001' })
    expect(store.loggedIn).toBe(true)
  })

  it('F0031: artist 密文损坏（JSON.parse 抛错）→ 不留「已登录但 artist 为空」半态', async () => {
    h.artist = '{corrupted-ciphertext'
    const store = useAuthStore()
    await store.restore()
    // 修复前：token 先落 → catch 吞掉 parse 错 → loggedIn=true 且 artist=null
    expect(store.token).toBeNull()
    expect(store.artist).toBeNull()
    expect(store.loggedIn).toBe(false)
  })

  it('token 或 artist 任一缺失 → 保持未登录', async () => {
    h.artist = null
    const store = useAuthStore()
    await store.restore()
    expect(store.loggedIn).toBe(false)
    expect(store.token).toBeNull()
  })

  it('保险箱读取异常 → 按未登录处理，不留半态', async () => {
    h.loadError = new Error('DPAPI unavailable')
    const store = useAuthStore()
    await store.restore()
    expect(store.loggedIn).toBe(false)
    expect(store.token).toBeNull()
    expect(store.artist).toBeNull()
  })
})
