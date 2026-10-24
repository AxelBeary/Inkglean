// ScheduleScroll 案头横格布局回归：
// 1) 7 个日期头，第 2 列固定为今日；
// 2) 表头副文案带出窗内单量；
// 3) 落格覆盖闭区间的截稿日（旧公式 `${end + 1}` 会少算一格，末日被截掉）；
// 4) 状态色语义不变（逾期朱砂 / 待确认藤黄 / 已确认浅花青 / 进行中花青）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({ getDashboardSchedule: vi.fn(), push: vi.fn() }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    locale: { value: 'zh-CN' }
  })
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('../../../../api/index.js', () => ({ artistApi: { getDashboardSchedule: h.getDashboardSchedule } }))
vi.mock('../../../../utils/datetime.js', () => ({ formatDateTime: (s: string) => s || '' }))

import ScheduleScroll from '../ScheduleScroll.vue'

/** 相对今天偏移 days 天的本地日历日（与 start_date 存储口径一致） */
function localDateStr(days: number) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let wrapper: ReturnType<typeof mount> | null = null

async function mountScroll(bars: ReadonlyArray<Record<string, unknown>>) {
  h.getDashboardSchedule.mockResolvedValue({ bars })
  wrapper = mount(ScheduleScroll, { attachTo: document.body })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

beforeEach(() => {
  h.getDashboardSchedule.mockReset()
  h.push.mockReset()
})

describe('ScheduleScroll 案头横格', () => {
  it('渲染 7 个日期头，第 2 列为今日', async () => {
    await mountScroll([])

    const days = wrapper!.findAll('.day')
    expect(days).toHaveLength(7)
    expect(days[1].classes()).toContain('is-today')
    expect(days[0].classes()).not.toContain('is-today')
    // 日序大字 + 星期小字各一格
    expect(days[1].find('b').text()).toBe(String(new Date().getDate()))
    expect(days[1].find('span').text().length).toBeGreaterThan(0)
  })

  it('表头副文案带出窗内单量', async () => {
    await mountScroll([
      { id: 1, orderNo: 'A', status: 'wip', startDate: localDateStr(1), deadline: localDateStr(2) },
      { id: 2, orderNo: 'B', status: 'wip', startDate: localDateStr(1), deadline: localDateStr(2) }
    ])

    expect(wrapper!.find('.sched-meta').text()).toBe('dashboard.scheduleWindowMeta:{"n":2}')
  })

  it('落格覆盖闭区间截稿日（三天单占三格、当日单占一格）', async () => {
    // 窗口起点 = 昨日，故「今日+N」的索引 = N + 1
    await mountScroll([
      // 索引 2 → 4（今日+1 到今日+3），应占第 3/4/5 列 → grid-column: 3/6
      { id: 1, orderNo: 'SPAN3', status: 'wip', startDate: localDateStr(1), deadline: localDateStr(3) },
      // 索引 5 单日 → 第 6 列
      { id: 2, orderNo: 'ONE', status: 'wip', startDate: localDateStr(4), deadline: localDateStr(4) }
    ])

    const bars = wrapper!.findAll('.tl-bar')
    const span3 = bars.find(b => b.text().includes('SPAN3'))!
    const one = bars.find(b => b.text().includes('ONE'))!
    expect((span3.element as HTMLElement).style.gridColumn).toMatch(/^3\s*\/\s*6$/)
    expect((one.element as HTMLElement).style.gridColumn).toMatch(/^6\s*\/\s*7$/)
  })

  it('状态色语义：逾期 / 待确认 / 已确认 / 进行中', async () => {
    await mountScroll([
      { id: 1, orderNo: 'OVER', status: 'wip', startDate: localDateStr(-1), deadline: localDateStr(-1) },
      { id: 2, orderNo: 'PEND', status: 'pending', startDate: localDateStr(1), deadline: localDateStr(2) },
      { id: 3, orderNo: 'CONF', status: 'confirmed', startDate: localDateStr(2), deadline: localDateStr(3) },
      { id: 4, orderNo: 'WIP', status: 'wip', startDate: localDateStr(3), deadline: localDateStr(4) }
    ])

    const cls = (no: string) => wrapper!.findAll('.tl-bar').find(b => b.text().includes(no))!.classes()
    expect(cls('OVER')).toContain('tl-over')
    expect(cls('PEND')).toContain('tl-pend')
    expect(cls('CONF')).toContain('tl-wip2')
    expect(cls('WIP')).toContain('tl-wip')
  })

  it('空态不渲染轨道', async () => {
    await mountScroll([])

    expect(wrapper!.find('.scroll-empty').exists()).toBe(true)
    expect(wrapper!.find('.track').exists()).toBe(false)
  })
})
