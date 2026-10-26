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
import { DEFAULT_TIMEOUT_MS } from '../../api/modules/http'
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

// issue #52-6：守卫的 setup 状态探测原先是裸 fetch——无超时（服务端不响应则切页永久挂起）、
// 无去重（并发导航各打一次；存储禁用时缓存不落，每次切页都重打）。
describe('#52-6 守卫 setup 状态探测：超时与并发去重', () => {
  /** 只靠微任务推进守卫（导航管线是 promise 链，首屏组件懒加载发生在守卫之后） */
  async function flushUntil(predicate: () => boolean) {
    for (let i = 0; i < 50 && !predicate(); i++) await Promise.resolve()
  }

  const okProbe = () => ({ ok: true, status: 200, json: () => Promise.resolve({ initialized: true, tokenRequired: false }) })

  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('并发两次导航只发一次探测请求', async () => {
    let resolveProbe: ((v: unknown) => void) | undefined
    const fetchMock = vi.fn(() => new Promise(r => { resolveProbe = r }))
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem('artist_logged_in', '1')

    // 第一次导航的守卫在 await 探测结果时，第二次导航进入守卫
    const first = router.push('/dashboard')
    await flushUntil(() => fetchMock.mock.calls.length > 0)
    const second = router.push('/queue')
    try {
      // 给第二次导航足够微任务轮次去命中在途探测
      for (let i = 0; i < 10; i++) await Promise.resolve()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      resolveProbe!(okProbe())
      await Promise.allSettled([first, second])
    }
  }, 20000)

  it('探测超时（15s 无响应）走失败放行分支，不抛未捕获异常', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    )
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem('artist_logged_in', '1')

    const nav = router.push('/dashboard')
    await flushUntil(() => fetchMock.mock.calls.length > 0)
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS)
    await nav
    await router.isReady()

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
    // 失败分支放行：既没缓存成已初始化，也没被踢去向导
    expect(window.localStorage.getItem('setup_initialized')).toBeNull()
    expect(router.currentRoute.value.name).toBe('ArtistDashboard')
  }, 20000)
})
