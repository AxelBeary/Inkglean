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
    // TASK2-07：写新 token 前先清旧 artist（破坏旧半态），且删除先于任何 save
    expect(h.deleteSecret).toHaveBeenCalledWith('session-artist')
    expect(h.deleteSecret.mock.invocationCallOrder[0]).toBeLessThan(h.saveSecret.mock.invocationCallOrder[0])
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

  it('第二把落盘失败：回滚两把且内存保持未登录，原始错误照常抛出', async () => {
    const boom = new Error('artist write failed')
    h.saveSecret.mockReset()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(boom)
    const store = useAuthStore()

    await expect(store.login('20002', '123456')).rejects.toBe(boom)
    // TASK2-07：回滚同时清 token + artist 两把，不只删 token
    expect(h.deleteSecret).toHaveBeenCalledWith('session-token')
    expect(h.deleteSecret.mock.calls.filter(c => c[0] === 'session-artist').length).toBeGreaterThanOrEqual(1)
    expect(store.loggedIn).toBe(false)
    expect(store.token).toBeNull()
  })

  it('TASK2-07: 第二把写失败 + 回滚 delete 失败——不吞 delete 错误，原错对象/消息不变，无跨账号半态', async () => {
    const boom = new Error('artist write failed')
    const disk = { token: 'old-token-A' as string | null }
    h.saveSecret.mockReset()
      .mockResolvedValueOnce(undefined) // token B 落盘
      .mockRejectedValueOnce(boom)      // artist B 落盘失败
    h.deleteSecret.mockReset().mockImplementation(async (key: string) => {
      if (key === 'session-artist') throw new Error('artist delete blocked') // 预清 + 回滚均失败
      if (key === 'session-token') disk.token = null // token 回滚成功
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useAuthStore()
    try {
      await expect(store.login('20002', '123456')).rejects.toBe(boom)

      // delete 失败如实上报（console.error + 挂到原错误），原错误对象与 message 不变
      expect(errSpy).toHaveBeenCalled()
      expect((boom as Error & { secretCleanupErrors?: string[] }).secretCleanupErrors?.length).toBeGreaterThan(0)
      expect(boom.message).toBe('artist write failed')
      // 两把都尝试过清理；token 已清 → 重启 restore() 无 token，不会产生 token=B + artist=A 错配
      expect(h.deleteSecret).toHaveBeenCalledWith('session-token')
      expect(disk.token).toBeNull()
      expect(store.loggedIn).toBe(false)
      expect(store.token).toBeNull()
    } finally {
      errSpy.mockRestore()
    }
  })

  it('TASK2-07: 两把回滚 delete 均失败——两把都尝试、错误全上报，内存仍不半登录', async () => {
    const boom = new Error('token write failed')
    h.saveSecret.mockReset().mockRejectedValueOnce(boom) // 第一把即失败
    h.deleteSecret.mockReset().mockRejectedValue(new Error('secure store gone'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useAuthStore()
    try {
      await expect(store.login('20002', '123456')).rejects.toBe(boom)
      expect(h.deleteSecret).toHaveBeenCalledWith('session-token')
      expect(h.deleteSecret).toHaveBeenCalledWith('session-artist')
      // 预清 artist + 回滚 token + 回滚 artist 三次 delete 失败全部记录
      expect((boom as Error & { secretCleanupErrors?: string[] }).secretCleanupErrors?.length).toBe(3)
      expect(store.loggedIn).toBe(false)
    } finally {
      errSpy.mockRestore()
    }
  })

  // XEND-04：token B 落盘 + artist B 写失败 + token 回滚 delete 也失败 →
  // 磁盘残留 token=B/artist=A（旧号）；必须落 tombstone，重启 restore() 拒绝恢复，不错配。
  it('XEND-04: 回滚 delete 失败落 tombstone，重启不会读成 token=B/artist=A 错配账号', async () => {
    const TOMBSTONE = 'FORCE_REAUTH_REQUIRED__v1' // 与 auth.ts FORCE_REAUTH_TOMBSTONE 同值
    const boom = new Error('artist write failed')
    h.token = 'old-token-A'          // 磁盘旧号 A 的 token
    h.artist = ARTIST_JSON           // 磁盘旧号 A 的 artist 档案（id=1）
    h.desktopLogin.mockReset().mockResolvedValue({ token: 'new-token-B', artist: NEW_ARTIST })
    // saveSecret 覆盖写模拟：让磁盘状态随写入变化（token B 成功、artist B 抛错由 mockRejected 无法区分，
    // 这里按 key 决定：token 写入成功、artist 写入失败）
    h.saveSecret.mockReset().mockImplementation(async (key: string, value: string) => {
      if (key === 'session-artist' && value !== TOMBSTONE) throw boom // artist B 落盘失败；tombstone 覆盖写入成功
      if (key === 'session-token') h.token = value
      else if (key === 'session-artist') h.artist = value
    })
    // 所有 delete 失败：artist 预清 + token/artist 回滚均失败 → 磁盘残留 token=B/artist=A
    h.deleteSecret.mockReset().mockRejectedValue(new Error('secure delete blocked'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useAuthStore()
    try {
      await expect(store.login('20002', '123456')).rejects.toBe(boom)
      // 关键断言：tombstone 覆盖写两把，磁盘已不是可错配的 token=B/artist=A
      expect(h.saveSecret).toHaveBeenCalledWith('session-token', TOMBSTONE)
      expect(h.saveSecret).toHaveBeenCalledWith('session-artist', TOMBSTONE)
      expect(h.token).toBe(TOMBSTONE)
      expect(h.artist).toBe(TOMBSTONE)
      // 不吞错：原错对象/message 不变，delete + 标记失败全上报
      expect(boom.message).toBe('artist write failed')
      expect((boom as Error & { secretCleanupErrors?: string[] }).secretCleanupErrors?.length).toBeGreaterThan(0)
      expect(errSpy).toHaveBeenCalled()
      expect(store.loggedIn).toBe(false)

      // 模拟重启：全新 store 从磁盘恢复，遇 tombstone 一律拒绝 → 不拼出错账号
      setActivePinia(createPinia())
      const restarted = useAuthStore()
      await restarted.restore()
      expect(restarted.loggedIn).toBe(false)
      expect(restarted.token).toBeNull()
      expect(restarted.artist).toBeNull()
    } finally {
      errSpy.mockRestore()
    }
  })

  // 不放宽成功路径 / delete 全成功则无需标记：回滚 delete 都成功时不得写 tombstone。
  it('XEND-04: 回滚 delete 全成功——磁盘已清空，不写 tombstone（成功/干净回滚不受影响）', async () => {
    const boom = new Error('artist write failed')
    h.saveSecret.mockReset()
      .mockResolvedValueOnce(undefined) // token B 落盘
      .mockRejectedValueOnce(boom)      // artist B 落盘失败
    h.deleteSecret.mockReset().mockResolvedValue(undefined) // 两把 delete 全成功
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useAuthStore()
    try {
      await expect(store.login('20002', '123456')).rejects.toBe(boom)
      // 无 delete 失败 → 不触发 tombstone 覆盖写（saveSecret 只有业务两次，无额外标记写）
      const tombstoneWrites = h.saveSecret.mock.calls.filter(c => c[1] === 'FORCE_REAUTH_REQUIRED__v1')
      expect(tombstoneWrites).toHaveLength(0)
      expect(store.loggedIn).toBe(false)
    } finally {
      errSpy.mockRestore()
    }
  })
})
