// 收入趋势图组件挂载测试（oimimo 吸纳批四）
// Chart.js 动态加载整体 mock（只断言实例化次数与空态/失败态分支）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import IncomeTrendCharts from '../IncomeTrendCharts.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

const getIncomeMonthly = vi.fn()
vi.mock('../../../api/index.js', () => ({
  artistApi: { getIncomeMonthly: (...args: unknown[]) => getIncomeMonthly(...args) }
}))

const { chartCtor } = vi.hoisted(() => ({ chartCtor: vi.fn() }))
vi.mock('chart.js/auto', () => ({
  // 箭头函数不可 new，用类模拟 Chart 构造器
  default: class MockChart {
    constructor(...args: unknown[]) { chartCtor(...args) }
    destroy() { /* 实例销毁静默 */ }
  }
}))

function row(month: string, orderCents = 0, standaloneCents = 0) {
  return { month, orderCents, standaloneCents, totalCents: orderCents + standaloneCents }
}

function mountCharts() {
  return mount(IncomeTrendCharts, {
    global: { mocks: { $t: (key: string) => key } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IncomeTrendCharts 收入趋势图', () => {
  it('TC-ITC-01: 全 0 数据 → 空态提示，不实例化图表', async () => {
    getIncomeMonthly.mockResolvedValue({ months: [row('2026-07'), row('2026-08')] })
    const wrapper = mountCharts()
    await flushPromises()
    expect(wrapper.find('.itc-empty').text()).toBe('toolsExport.incomeTrendEmpty')
    expect(chartCtor).not.toHaveBeenCalled()
  })

  it('TC-ITC-02: 有数据 → 两图实例化（月度柱 + 累计线）', async () => {
    getIncomeMonthly.mockResolvedValue({ months: [row('2026-07', 10000), row('2026-08', 5000, 2000)] })
    const wrapper = mountCharts()
    await flushPromises()
    expect(chartCtor).toHaveBeenCalledTimes(2)
    const configs = chartCtor.mock.calls.map(c => (c[1] as { type: string }).type)
    expect(configs).toContain('bar')
    expect(configs).toContain('line')
    expect(wrapper.find('.itc-empty').exists()).toBe(false)
  })

  it('TC-ITC-03: 接口失败 → 失败提示', async () => {
    getIncomeMonthly.mockRejectedValue(new Error('boom'))
    const wrapper = mountCharts()
    await flushPromises()
    expect(wrapper.find('.itc-empty').text()).toBe('toolsExport.incomeTrendFailed')
    expect(chartCtor).not.toHaveBeenCalled()
  })
})
