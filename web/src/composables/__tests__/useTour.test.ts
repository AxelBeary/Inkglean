// 818-E: tour 控制器逻辑单测——步进/回退/跳过/标记持久化/重启重置/目标缺失跳过
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => {
  const getItem = vi.fn()
  const setItem = vi.fn()
  return { getItem, setItem }
})

vi.mock('../../utils/storage.js', () => ({
  safeGetItem: h.getItem,
  safeSetItem: h.setItem
}))

const routerMock = vi.hoisted(() => {
  const current = { path: '/start' }
  const push = vi.fn(async (path: string) => {
    current.path = path
  })
  return { current, push }
})

vi.mock('../../router/index.js', () => ({
  default: {
    currentRoute: { value: routerMock.current },
    push: routerMock.push
  }
}))

type TourModule = typeof import('../useTour')
let mod: TourModule

async function loadTour(): Promise<void> {
  vi.resetModules()
  mod = await import('../useTour')
}

/** 让同步起点后的微任务/首轮轮询落定 */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useTour（818-E 分步导览控制器）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    routerMock.current.path = '/start'
    routerMock.push.mockClear()
    h.getItem.mockReset()
    h.setItem.mockReset()
    h.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('start 激活导览、跳到第一步路由并写入 seen 标记', async () => {
    document.body.innerHTML = '<div class="greeting-note"></div>'
    await loadTour()

    const tour = mod.useTour()
    tour.start()

    expect(tour.active.value).toBe(true)
    expect(routerMock.push).toHaveBeenCalledWith('/dashboard')
    expect(h.setItem).toHaveBeenCalledWith(mod.TOUR_SEEN_KEY, '1')
    await settle()
    expect(tour.index.value).toBe(0)
  })

  it('next 前进 / prev 回退，路由随步骤切换', async () => {
    document.body.innerHTML = '<div class="t"></div>'
    await loadTour()
    const tour = mod.useTour()
    const steps = [
      { route: '/a', target: '.t', textKey: 'tour.x' },
      { route: '/b', target: '.t', textKey: 'tour.y' },
      { route: '/c', target: '.t', textKey: 'tour.z' }
    ]

    tour.start(steps)
    await settle()
    expect(tour.index.value).toBe(0)
    expect(routerMock.push).toHaveBeenLastCalledWith('/a')

    tour.next()
    await settle()
    expect(tour.index.value).toBe(1)
    expect(routerMock.push).toHaveBeenLastCalledWith('/b')

    tour.next()
    await settle()
    expect(tour.index.value).toBe(2)

    tour.prev()
    await settle()
    expect(tour.index.value).toBe(1)
    expect(routerMock.push).toHaveBeenLastCalledWith('/b')
  })

  it('最后一步 next 或任意时点 skip 都会收尾并记 seen', async () => {
    document.body.innerHTML = '<div class="t"></div>'
    await loadTour()
    const tour = mod.useTour()
    tour.start([{ route: '/a', target: '.t', textKey: 'tour.x' }])
    await settle()

    tour.next()
    expect(tour.active.value).toBe(false)
    expect(h.setItem).toHaveBeenLastCalledWith(mod.TOUR_SEEN_KEY, '1')

    tour.start([{ route: '/a', target: '.t', textKey: 'tour.x' }])
    await settle()
    tour.skip()
    expect(tour.active.value).toBe(false)
    expect(h.setItem).toHaveBeenLastCalledWith(mod.TOUR_SEEN_KEY, '1')
  })

  it('hasSeen 读 localStorage 标记；seen 后 start 仍可重启（重置入口）', async () => {
    await loadTour()
    expect(mod.hasSeen()).toBe(false)
    expect(h.getItem).toHaveBeenCalledWith(mod.TOUR_SEEN_KEY)

    h.getItem.mockReturnValue('1')
    expect(mod.hasSeen()).toBe(true)

    const tour = mod.useTour()
    tour.start([{ route: '/a', target: '.missing', textKey: 'tour.x' }])
    expect(tour.active.value).toBe(true)
  })

  it('目标缺失时自动跳过该步，不崩；最后一步缺失则收尾', async () => {
    document.body.innerHTML = '<div class="found"></div>'
    await loadTour()
    const tour = mod.useTour()
    const steps = [
      { route: '/missing-a', target: '.never-here', textKey: 'tour.x' },
      { route: '/found-b', target: '.found', textKey: 'tour.y' }
    ]

    tour.start(steps)
    await settle()
    await vi.advanceTimersByTimeAsync(mod.TARGET_WAIT_MS + mod.TARGET_POLL_MS)
    await settle()
    expect(tour.index.value).toBe(1)
    expect(routerMock.push).toHaveBeenCalledWith('/found-b')
    expect(tour.active.value).toBe(true)

    // 全缺失：一路跳过到最后一步仍找不到 → 自动收尾
    tour.start([{ route: '/gone', target: '.never-here', textKey: 'tour.x' }])
    await settle()
    await vi.advanceTimersByTimeAsync(mod.TARGET_WAIT_MS + mod.TARGET_POLL_MS)
    expect(tour.active.value).toBe(false)
  })

  it('路由跳转失败（如守卫弹回登录）→ 结束导览不留半截浮层', async () => {
    await loadTour()
    const tour = mod.useTour()
    routerMock.push.mockRejectedValueOnce(new Error('redirected'))

    tour.start([{ route: '/a', target: '.t', textKey: 'tour.x' }])
    await settle()
    expect(tour.active.value).toBe(false)
  })
})
