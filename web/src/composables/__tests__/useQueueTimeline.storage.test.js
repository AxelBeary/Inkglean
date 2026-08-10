// useQueueTimeline localStorage 降级测试（G-5：zoom 裸读写清扫后存储抛错不崩）
// 覆盖：初始化读抛错 → 默认 '2w' 档；切档写抛错 → 静默降级且状态照常更新
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: { value: 'zh-CN' } })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    updateDeadline: () => Promise.resolve({}),
    updateStartDate: () => Promise.resolve({})
  }
}))

import { useQueueTimeline } from '../useQueueTimeline.js'

afterEach(() => {
  Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  vi.restoreAllMocks()
})

function createTimeline() {
  let tl
  mount({
    setup() {
      tl = useQueueTimeline({
        calOrders: ref([]),
        getViewMode: () => 'timeline',
        findOrder: () => null,
        onRefreshAll: () => {},
        dateKey: (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
        parseDate: (s) => (s ? new Date(s) : null),
        markDragHappened: () => {}
      })
      return {}
    },
    template: '<div />'
  })
  return tl
}

describe('useQueueTimeline 存储降级（G-5）', () => {
  it('localStorage.getItem 抛错 → 初始化不崩，zoom 落到默认 2w', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      }
    })

    const tl = createTimeline()
    expect(tl.tlZoom.value).toBe('2w')
  })

  it('localStorage.setItem 抛错 → changeTlZoom 不崩且档位照常切换', () => {
    // 读正常，写抛错
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => {}
    }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage
    })

    const tl = createTimeline()
    expect(tl.tlZoom.value).toBe('2w')
    tl.changeTlZoom('1m')
    expect(tl.tlZoom.value).toBe('1m')
  })
})
