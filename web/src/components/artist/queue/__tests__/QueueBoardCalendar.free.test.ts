// 围剿 a1-6/a1-7: 月历可接单标记（过去日期不再标 free）与逾期判定（今天截稿不标逾期）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'

interface CalCell {
  inMonth: boolean
  day: number
  free: boolean
}

interface QueueOrder {
  id: number
  status: string
  deadline: string
  order_no: string
  client_name: string
  tier_name: string
  _zone: string
}

interface CalVm {
  calCells: CalCell[]
  bandClass(order: QueueOrder): string
}

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
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

function mountCal(queue: QueueOrder[] = [], bufferQueue: QueueOrder[] = [], canAccept = true) {
  return shallowMount(QueueBoardCalendar, {
    props: {
      queue,
      bufferQueue,
      loading: false,
      bufferLoading: false,
      viewMode: 'calendar',
      canAccept
    },
    global: {
      mocks: { $t: (key: string) => key },
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
    const cells = (wrapper.vm as unknown as CalVm).calCells
    const past = cells.find(c => c.inMonth && c.day === 10)
    const today = cells.find(c => c.inMonth && c.day === 15)
    const future = cells.find(c => c.inMonth && c.day === 20)

    expect(past).toBeTruthy()
    expect(today).toBeTruthy()
    expect(future).toBeTruthy()
    expect(past!.free).toBe(false)
    expect(today!.free).toBe(true)
    expect(future!.free).toBe(true)
  })

  // F11 拍板 C：总量名额约束——名额已满（canAccept=false）时，空日子不再标可接单（按天 ≠ 能接单）
  it('F11-C: canAccept=false 时今天与未来无单日期均不标 free', () => {
    const wrapper = mountCal([], [], false)
    const cells = (wrapper.vm as unknown as CalVm).calCells
    const today = cells.find(c => c.inMonth && c.day === 15)
    const future = cells.find(c => c.inMonth && c.day === 20)
    expect(today!.free).toBe(false)
    expect(future!.free).toBe(false)
  })

  it('a1-7: 今天截稿不标逾期，昨天截稿标逾期', () => {
    const wrapper = mountCal()
    const todayOrder = { id: 1, status: 'wip', deadline: '2026-08-15', order_no: 'A', client_name: 'x', tier_name: 't', _zone: 'formal' }
    const yesterdayOrder = { id: 2, status: 'wip', deadline: '2026-08-14', order_no: 'B', client_name: 'x', tier_name: 't', _zone: 'formal' }

    expect((wrapper.vm as unknown as CalVm).bandClass(todayOrder)).not.toContain('cal-band--overdue')
    expect((wrapper.vm as unknown as CalVm).bandClass(yesterdayOrder)).toContain('cal-band--overdue')
  })

  // oimimo 吸纳批六：临期预警（今天截稿或剩余 ≤3 天 → 藤黄；>3 天常规；逾期/终态优先）
  it('临期：剩余 0〜3 天标 soon，4 天起回常规，逾期不受影响', () => {
    const wrapper = mountCal()
    const mk = (id: number, deadline: string, status = 'wip', zone = 'formal') =>
      ({ id, status, deadline, order_no: `N${id}`, client_name: 'x', tier_name: 't', _zone: zone })
    const bandClass = (wrapper.vm as unknown as CalVm).bandClass

    expect(bandClass(mk(1, '2026-08-15'))).toContain('cal-band--soon') // 今天截稿
    expect(bandClass(mk(2, '2026-08-18'))).toContain('cal-band--soon') // 剩 3 天
    expect(bandClass(mk(3, '2026-08-19'))).not.toContain('cal-band--soon') // 剩 4 天回常规
    expect(bandClass(mk(4, '2026-08-19'))).toContain('cal-band--formal')
    expect(bandClass(mk(5, '2026-08-14'))).toContain('cal-band--overdue') // 逾期优先于临期
    expect(bandClass(mk(6, '2026-08-15', 'done'))).toContain('cal-band--done') // 终态优先
  })
})
