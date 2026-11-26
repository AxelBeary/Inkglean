// useSessionGuard 服务端会话校验回归（REQ-037 批2 A4 + B6）
// F0247: 服务端下修 isAdmin 后必须把用户踢出管理页——只改 store 不重定向时，
//        陈旧管理员标志可停留后台直到下一次手动导航。
// F0248: 非鉴权错误（网络/5xx）不再被无痕吞掉——不登出，但必须留痕。
// 路由/请求/store 全部 mock，直接调 composable，不依赖真实 vue-router 上下文。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  setAdminFlag: vi.fn(),
  push: vi.fn(),
  warn: vi.fn(),
  // currentRoute 形状由各用例覆写（meta.requiresAdmin / name 两个字段足够）
  currentRoute: { value: { name: 'AdminDashboard', meta: { requiresAdmin: true } } as { name?: string; meta: { requiresAdmin?: boolean } } },
  store: {} as { isAdmin: boolean; setAdminFlag: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> }
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push, currentRoute: h.currentRoute })
}))

vi.mock('../../stores/artist.js', () => ({
  useArtistStore: () => h.store
}))

vi.mock('../../api/index.js', () => ({
  artistApi: { getMe: h.getMe }
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn() }
}))

// composable 经默认导出读 i18n.global.t（与 router/index.ts 同款）；api 拦截器也会动态 import 该模块
vi.mock('../../i18n/index.js', () => ({
  default: { global: { t: (key: string) => key } },
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

import { ElMessage } from 'element-plus'
import { useSessionGuard } from '../useSessionGuard'

function guard(): ReturnType<typeof useSessionGuard> {
  h.store.isAdmin = true
  h.store.setAdminFlag = h.setAdminFlag
  h.store.logout = h.logout
  return useSessionGuard()
}

beforeEach(() => {
  h.getMe.mockReset()
  h.logout.mockReset()
  h.setAdminFlag.mockReset()
  h.push.mockReset()
  h.warn.mockReset()
  vi.mocked(ElMessage.warning).mockReset()
  h.currentRoute.value = { name: 'AdminDashboard', meta: { requiresAdmin: true } }
  h.warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as unknown as typeof h.warn
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('validateSession 成功路径（isAdmin 对账）', () => {
  it('服务端与 store 一致 → 不动 store 不重定向', async () => {
    h.getMe.mockResolvedValue({ isAdmin: true })
    const { validateSession } = guard()
    await validateSession()
    expect(h.setAdminFlag).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
  })

  it('上修（false→true）→ 只修标记，不重定向不打扰', async () => {
    h.getMe.mockResolvedValue({ isAdmin: true })
    h.currentRoute.value = { name: 'ArtistDashboard', meta: {} }
    const { validateSession } = guard()
    h.store.isAdmin = false
    await validateSession()
    expect(h.setAdminFlag).toHaveBeenCalledWith(true)
    expect(h.push).not.toHaveBeenCalled()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })

  it('F0247: 下修且停留在管理页 → 修正标记 + 提示 + 踢回画师首页', async () => {
    h.getMe.mockResolvedValue({ isAdmin: false })
    h.currentRoute.value = { name: 'AdminDashboard', meta: { requiresAdmin: true } }
    const { validateSession } = guard()
    await validateSession()
    expect(h.setAdminFlag).toHaveBeenCalledWith(false)
    expect(ElMessage.warning).toHaveBeenCalledWith('router.insufficientPermission')
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistDashboard' })
  })

  it('F0247: 下修但在画师页 → 只修标记不重定向（画师页本就有权停留）', async () => {
    h.getMe.mockResolvedValue({ isAdmin: false })
    h.currentRoute.value = { name: 'ArtistDashboard', meta: {} }
    const { validateSession } = guard()
    await validateSession()
    expect(h.setAdminFlag).toHaveBeenCalledWith(false)
    expect(h.push).not.toHaveBeenCalled()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})

describe('validateSession 失败路径', () => {
  it('401 → 登出并跳登录页', async () => {
    h.getMe.mockRejectedValue({ status: 401 })
    h.currentRoute.value = { name: 'AdminDashboard', meta: { requiresAdmin: true } }
    const { validateSession } = guard()
    await validateSession()
    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
  })

  it('403 → 登出并跳登录页', async () => {
    h.getMe.mockRejectedValue({ status: 403 })
    const { validateSession } = guard()
    await validateSession()
    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.push).toHaveBeenCalledWith({ name: 'ArtistLogin' })
  })

  it('已在登录页的 401 → 登出但不重复 push', async () => {
    h.getMe.mockRejectedValue({ status: 401 })
    h.currentRoute.value = { name: 'ArtistLogin', meta: {} }
    const { validateSession } = guard()
    await validateSession()
    expect(h.logout).toHaveBeenCalledTimes(1)
    expect(h.push).not.toHaveBeenCalled()
  })

  it('F0248: 非鉴权错误（网络/5xx）→ 不登出不重定向，但留痕不再静默', async () => {
    h.getMe.mockRejectedValue(new Error('network down'))
    const { validateSession } = guard()
    await validateSession()
    expect(h.logout).not.toHaveBeenCalled()
    expect(h.push).not.toHaveBeenCalled()
    expect(h.warn).toHaveBeenCalled()
    const msg = String(h.warn.mock.calls[0]?.[0] ?? '')
    expect(msg).toContain('[useSessionGuard]')
  })
})
