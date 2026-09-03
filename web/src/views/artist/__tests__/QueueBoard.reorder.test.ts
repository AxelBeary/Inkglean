// 围剿 a1-5: QueueBoard 拖拽排序请求序号——两次快速拖拽时旧响应不得覆盖新排序/lastServerOrder
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  getQueue: vi.fn(),
  reorderQueue: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: h.msgError, success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getQueue: h.getQueue,
    reorderQueue: h.reorderQueue
  }
}))

vi.mock('../../../utils/storage.js', () => ({
  safeGetItem: () => null,
  safeSetItem: () => {}
}))
vi.mock('../../../utils/reconnect.js', () => ({
  subscribeReconnect: () => () => {}
}))
vi.mock('../../../composables/useSignatureRefresh.js', () => ({
  useSignatureRefresh: () => ({ refreshNow: () => {} })
}))
// F11（9/3 批）：QueueBoard 新增 useArtistStore 依赖（顶部总量状态牌 + 月历 canAccept 约束）——
// mock 掉 store 避免加载真实 i18n 实例（createI18n）与 Pinia；profile=null 时 canAccept 恒 true、状态牌不渲染，不影响拖拽守卫断言
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ profile: null, fetchProfile: () => Promise.resolve() })
}))

import QueueBoard from '../QueueBoard.vue'

interface QueueItem {
  id: number
}

interface Deferred<T> {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface QueueBoardVM {
  queue: QueueItem[]
  lastServerOrder: number[]
  reorderToastVisible: boolean
  onDragEnd: (evt: { oldIndex: number; newIndex: number }) => Promise<void>
}

function toQueue(ids: number[]) {
  return ids.map(id => ({ id }))
}

async function mountBoard() {
  h.getQueue.mockImplementation((zone: string) => {
    if (zone === 'buffer') return Promise.resolve([])
    if (zone === 'completed') return Promise.resolve([])
    return Promise.resolve(toQueue([1, 2, 3]))
  })
  const wrapper = shallowMount(QueueBoard, {
    global: {
      mocks: { $t: (key: string) => key, $tm: () => [] },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  return wrapper.vm as unknown as QueueBoardVM
}

describe('QueueBoard 拖拽排序守卫（a1-5）', () => {
  beforeEach(() => {
    h.getQueue.mockReset()
    h.reorderQueue.mockReset()
    h.msgError.mockClear()
  })

  it('两次快速拖拽：旧响应不覆盖新排序与 lastServerOrder', async () => {
    const vm = await mountBoard()
    const deferreds: (() => void)[] = []
    h.reorderQueue.mockImplementation((ids: number[]) => new Promise<QueueItem[]>((resolve) => {
      deferreds.push(() => resolve(toQueue(ids)))
    }))

    // 第一次拖拽（本地顺序已变 [2,1,3]）
    vm.queue = toQueue([2, 1, 3])
    const p1 = vm.onDragEnd({ oldIndex: 0, newIndex: 1 })
    // 第二次拖拽（本地顺序已变 [3,2,1]）
    vm.queue = toQueue([3, 2, 1])
    const p2 = vm.onDragEnd({ oldIndex: 0, newIndex: 2 })

    // 后发的第二次响应先到
    deferreds[1]()
    await flushPromises()
    expect(vm.queue.map(o => o.id)).toEqual([3, 2, 1])
    expect(vm.lastServerOrder).toEqual([3, 2, 1])
    expect(vm.reorderToastVisible).toBe(true)

    // 先发的第一次响应后到 → 丢弃
    deferreds[0]()
    await flushPromises()
    expect(vm.queue.map(o => o.id)).toEqual([3, 2, 1])
    expect(vm.lastServerOrder).toEqual([3, 2, 1])

    await Promise.all([p1, p2])
  })

  it('旧拖拽失败（已被新拖拽取代）不弹错误、不触发回滚重拉', async () => {
    const vm = await mountBoard()
    const deferreds: Deferred<QueueItem[]>[] = []
    h.reorderQueue.mockImplementation(() => new Promise<QueueItem[]>((resolve, reject) => {
      deferreds.push({ resolve, reject })
    }))

    vm.queue = toQueue([2, 1, 3])
    const p1 = vm.onDragEnd({ oldIndex: 0, newIndex: 1 })
    vm.queue = toQueue([3, 2, 1])
    const p2 = vm.onDragEnd({ oldIndex: 0, newIndex: 2 })

    deferreds[1].resolve(toQueue([3, 2, 1]))
    await flushPromises()
    deferreds[0].reject(new Error('stale boom'))
    await flushPromises()

    expect(h.msgError).not.toHaveBeenCalled()
    expect(vm.queue.map(o => o.id)).toEqual([3, 2, 1])

    await Promise.all([p1, p2])
  })
})
