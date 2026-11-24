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
  deleteSecret: vi.fn(),
  desktopLogin: vi.fn(),
  desktopLogout: vi.fn()
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
  desktopLogin: h.desktopLogin,
  desktopLogout: h.desktopLogout
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

// DTK-01（debug-swarm 11-24）：login 必须「先全部落盘、再原子写内存」；落盘失败不留登录半态。
describe('login() 落盘与内存时序（DTK-01）', () => {
  const NEW_ARTIST = { id: 2, name: '新画师', subdomain: 'new', qqNumber: '20002' }

  beforeEach(() => {
    h.desktopLogin.mockReset().mockResolvedValue({ token: 'new-token', artist: NEW_ARTIST })
    h.saveSecret.mockReset().mockResolvedValue(undefined)
    h.deleteSecret.mockReset().mockResolvedValue(undefined)
  })

  it('成功：两把凭证都落盘后才提交内存态（loggedIn 由 token 派生）', async () => {
    const order: string[] = []
    h.saveSecret.mockImplementation(async (key: string) => { order.push(`save:${key}`) })
    const store = useAuthStore()

    await store.login('20002', '123456')

    expect(order).toEqual(['save:session-token', 'save:session-artist'])
    expect(store.token).toBe('new-token')
    expect(store.loggedIn).toBe(true)
    expect(store.artist).toMatchObject(NEW_ARTIST)
  })

  it('第一把落盘失败：内存保持未登录，不写第二把', async () => {
    const boom = new Error('token write failed')
    h.saveSecret.mockReset().mockRejectedValueOnce(boom)
    const store = useAuthStore()

    await expect(store.login('20002', '123456')).rejects.toBe(boom)
    expect(h.saveSecret).toHaveBeenCalledTimes(1)
    expect(store.loggedIn).toBe(false)
    expect(store.token).toBeNull()
  })

  it('第二把落盘失败：回滚第一把且内存保持未登录，原始错误照常抛出', async () => {
    const boom = new Error('artist write failed')
    h.saveSecret.mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(boom)
    const store = useAuthStore()

    await expect(store.login('20002', '123456')).rejects.toBe(boom)
    // 回滚删除已写入的第一把 token，避免残留半套凭证
    expect(h.deleteSecret).toHaveBeenCalledWith('session-token')
    expect(store.loggedIn).toBe(false)
    expect(store.token).toBeNull()
  })
})
