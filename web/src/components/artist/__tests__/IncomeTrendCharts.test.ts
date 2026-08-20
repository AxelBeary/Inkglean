// 收入趋势图组件挂载测试（oimimo 吸纳批四）
// Chart.js 动态加载整体 mock（只断言实例化次数与空态/失败态分支）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import IncomeTrendCharts from '../IncomeTrendCharts.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

const getIncomeMonthly = vi.fn()
const getIncomeByStyle = vi.fn()
const getTopClients = vi.fn()
vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getIncomeMonthly: (...args: unknown[]) => getIncomeMonthly(...args),
    getIncomeByStyle: (...args: unknown[]) => getIncomeByStyle(...args),
    getTopClients: (...args: unknown[]) => getTopClients(...args)
  }
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
  getIncomeByStyle.mockResolvedValue({ styles: [] })
  getTopClients.mockResolvedValue({ clients: [] })
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

  // oimimo 吸纳补遗：画风分布环图 + 客户排名榜
  it('TC-ITC-04: 画风分布环图实例化，空串桶落未分类文案', async () => {
    getIncomeMonthly.mockResolvedValue({ months: [row('2026-07', 10000)] })
    getIncomeByStyle.mockResolvedValue({ styles: [{ styleName: '头像', cents: 10000 }, { styleName: '', cents: 3000 }] })
    const wrapper = mountCharts()
    await flushPromises()
    // 月度柱 + 累计线 + 环图 = 3 次实例化
    expect(chartCtor).toHaveBeenCalledTimes(3)
    const doughnutCfg = chartCtor.mock.calls.map(c => c[1] as { type: string; data: { labels: string[] } }).find(c => c.type === 'doughnut')
    expect(doughnutCfg).toBeTruthy()
    expect(doughnutCfg!.data.labels).toEqual(['头像', 'toolsExport.incomeUncategorized'])
    // 画风区有数据不显空态；客户榜仍为空 → 空态只出现一次（客户榜那条）
    expect(wrapper.findAll('.itc-sub-empty')).toHaveLength(1)
  })

  it('TC-ITC-05: 客户排名榜渲染（无名落 QQ），分布接口失败落空态不拖主图', async () => {
    getIncomeMonthly.mockResolvedValue({ months: [row('2026-07', 10000)] })
    getTopClients.mockResolvedValue({ clients: [
      { clientQq: '10001', clientName: '大客户', totalCents: 18000, orderCount: 2 },
      { clientQq: '10002', clientName: null, totalCents: 5000, orderCount: 1 }
    ] })
    getIncomeByStyle.mockRejectedValue(new Error('dist boom'))
    const wrapper = mountCharts()
    await flushPromises()
    const items = wrapper.findAll('.itc-client')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('大客户')
    expect(items[1].text()).toContain('10002') // 无名回落 QQ
    // 分布接口失败 → 环图区空态，主图照常（柱+线 2 次实例化）
    expect(chartCtor).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.itc-sub-empty').exists()).toBe(true)
  })
})
