// useQueueTimeline oimimo 吸纳批二测试：全年档 / 仅进行中过滤 / 窄屏默认档降级
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
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

const ZOOM_KEY = 'queue_tl_zoom'

interface OrderLite {
  id: number
  status: string
  startDate?: string | null
  created_at?: string | null
  confirmed_at?: string | null
  deadline?: string | null
  version?: number | null
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

/** 一单在做的 + 三种终态（全部在近一个月内，画布必然覆盖） */
function mixedOrders(): OrderLite[] {
  return [
    { id: 1, status: 'wip', startDate: dayOffset(0), deadline: dayOffset(5) },
    { id: 2, status: 'done', startDate: dayOffset(-20), deadline: dayOffset(-10) },
    { id: 3, status: 'delivered', startDate: dayOffset(-15), deadline: dayOffset(-5) },
    { id: 4, status: 'cancelled', startDate: dayOffset(-8), deadline: dayOffset(-2) }
  ]
}

const originalInnerWidth = window.innerWidth
function setInnerWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
}

function createTimeline(orders: OrderLite[] = []) {
  let tl!: ReturnType<typeof useQueueTimeline>
  mount({
    setup() {
      tl = useQueueTimeline({
        calOrders: ref(orders),
        getViewMode: () => 'timeline',
        findOrder: () => null,
        onRefreshAll: () => {},
        dateKey: (d: Date) => iso(d),
        parseDate: (s: string | null | undefined) => (s ? new Date(s) : null),
        markDragHappened: () => {}
      })
      return {}
    },
    template: '<div />'
  })
  return tl
}

beforeEach(() => {
  localStorage.clear()
  setInnerWidth(1280)
})

afterEach(() => {
  setInnerWidth(originalInnerWidth)
})

describe('useQueueTimeline oimimo 吸纳批二', () => {
  it('TC-TL2-01: 全年档（1y）可切换且纳入滚轮/pinch 档位序列', () => {
    const tl = createTimeline()
    tl.changeTlZoom('1y')
    expect(tl.tlZoom.value).toBe('1y')
    expect(localStorage.getItem(ZOOM_KEY)).toBe('1y')
    // 档位序列回退一档 = 半年（滚轮/pinch 依赖的顺序）
    tl.changeTlZoom('6m')
    expect(tl.tlZoom.value).toBe('6m')
  })

  it('TC-TL2-02: 默认仅进行中——终态单（done/delivered/cancelled）不进横条，切全部恢复', () => {
    const tl = createTimeline(mixedOrders())
    expect(tl.tlFilterActive.value).toBe(true)
    expect(tl.tlRows.value.map(r => r.order.id)).toEqual([1])

    tl.setTlFilter(false)
    // 横条按开工日升序：终态单开工日更早，排在前面
    expect(tl.tlRows.value.map(r => r.order.id)).toEqual([2, 3, 4, 1])

    tl.setTlFilter(true)
    expect(tl.tlRows.value.map(r => r.order.id)).toEqual([1])
  })

  it('TC-TL2-03: 窄屏（<768px）存的粗档初始化降级 1m，且不回写存储', () => {
    localStorage.setItem(ZOOM_KEY, '6m')
    setInnerWidth(375)
    const tl = createTimeline()
    expect(tl.tlZoom.value).toBe('1m')
    // 宽屏偏好保留：存储里仍是 6m（仅当次降级）
    expect(localStorage.getItem(ZOOM_KEY)).toBe('6m')
  })

  it('TC-TL2-04: 宽屏保持存档粗档；窄屏细档不降级', () => {
    localStorage.setItem(ZOOM_KEY, '6m')
    const wide = createTimeline()
    expect(wide.tlZoom.value).toBe('6m')

    localStorage.setItem(ZOOM_KEY, '2w')
    setInnerWidth(375)
    const narrow = createTimeline()
    expect(narrow.tlZoom.value).toBe('2w')
  })
})
