// 围剿 a1-6/a1-7: 月历可接单标记（过去日期不再标 free）与逾期判定（今天截稿不标逾期）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    updateDeadline: () => Promise.resolve({}),
    updateStartDate: () => Promise.resolve({})
  }
}))

vi.mock('../../../composables/useQueueTimeline.js', () => ({
  useQueueTimeline: () => ({
    tlZoom: ref('1m'),
    changeTlZoom: () => {},
    tlDayWidth: ref(80),
    tlScrollEl: ref(null),
    onTlScroll: () => {},
    tlCanvasWidth: ref(0),
    tlTicks: ref([]),
    tlTodayX: ref(null),
    tlIsTodayVisible: ref(true),
    tlGoToday: () => {},
    tlRows: ref([]),
    tlAxisPanning: ref(false),
    onTlCanvasWheel: () => {},
    onTlCanvasDown: () => {},
    onTlCanvasMove: () => {},
    onTlCanvasUp: () => {},
    onTlCanvasCancel: () => {},
    tlDrag: ref(null),
    tlDragLabelText: ref(''),
    tlBarStyle: () => ({}),
    tlCanDragStart: () => false,
    tlCanDragEnd: () => false,
    tlCanDragMove: () => false,
    onTlHandleDown: () => {},
    onTlBarDown: () => {},
    onTlHandleMove: () => {},
    onTlHandleUp: () => {},
    onTlHandleCancel: () => {},
    undoToastVisible: ref(false),
    undoToastMessage: ref(''),
    onTlUndo: () => {}
  })
}))

import QueueBoardCalendar from '../QueueBoardCalendar.vue'

function mountCal(queue = [], bufferQueue = []) {
  return shallowMount(QueueBoardCalendar, {
    props: {
      queue,
      bufferQueue,
      loading: false,
      bufferLoading: false,
      viewMode: 'calendar'
    },
    global: {
      mocks: { $t: (key) => key },
      directives: { loading: () => {} }
    }
  })
}

beforeEach(() => {
  // 本地 2026-08-15 10:00（UTC+8）——今天/昨天/未来分界清晰
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 15, 10, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('QueueBoardCalendar 可接单/逾期判定（a1-6/a1-7）', () => {
  it('a1-6: 已过去的无单日期不标记 free；今天与未来无单日期标记 free', () => {
    const wrapper = mountCal()
    const cells = wrapper.vm.calCells
    const past = cells.find(c => c.inMonth && c.day === 10)
    const today = cells.find(c => c.inMonth && c.day === 15)
    const future = cells.find(c => c.inMonth && c.day === 20)

    expect(past).toBeTruthy()
    expect(today).toBeTruthy()
    expect(future).toBeTruthy()
    expect(past.free).toBe(false)
    expect(today.free).toBe(true)
    expect(future.free).toBe(true)
  })

  it('a1-7: 今天截稿不标逾期，昨天截稿标逾期', () => {
    const wrapper = mountCal()
    const todayOrder = { id: 1, status: 'wip', deadline: '2026-08-15', order_no: 'A', client_name: 'x', tier_name: 't', _zone: 'formal' }
    const yesterdayOrder = { id: 2, status: 'wip', deadline: '2026-08-14', order_no: 'B', client_name: 'x', tier_name: 't', _zone: 'formal' }

    expect(wrapper.vm.bandClass(todayOrder)).not.toContain('cal-band--overdue')
    expect(wrapper.vm.bandClass(yesterdayOrder)).toContain('cal-band--overdue')
  })
})
