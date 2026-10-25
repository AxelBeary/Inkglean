// 收入趋势图组件挂载测试（oimimo 吸纳批四）
// Chart.js 动态加载整体 mock（只断言实例化次数与空态/失败态分支）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import IncomeTrendCharts from '../IncomeTrendCharts.vue'

// 本文件组件挂了主题 MutationObserver：不自动卸载的话，前序用例的实例会在
// teardown 之后仍被属性变化唤醒，拿到的是已注销 mock 的真 Chart，抛未捕获拒绝
enableAutoUnmount(afterEach)

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

const { chartCtor, destroyChartCtor } = vi.hoisted(() => ({
  chartCtor: vi.fn(),
  // #58 返工 7：destroy 必须有 spy——原先是空实现，删掉 destroyCharts() 也不会转红
  destroyChartCtor: vi.fn()
}))
vi.mock('chart.js/auto', () => ({
  // 箭头函数不可 new，用类模拟 Chart 构造器
  default: class MockChart {
    constructor(...args: unknown[]) { chartCtor(...args) }
    destroy() { destroyChartCtor() }
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

describe('IncomeTrendCharts 主题切换（#58 返工 5/6/7）', () => {
  /** 宣纸档 token：写进 documentElement 的内联自定义属性，readChartPalette 直接读得到 */
  const PAPER_TOKENS: Record<string, string> = {
    '--ink3': '#6A6455', '--line': '#DCD0B4', '--ink2': '#5A564B',
    '--hq': '#33526E', '--sl': '#2F7D54', '--zs': '#BC3A2B',
    '--zs-t': '#F8EAE6', '--paper2': '#F5EFDF', '--th': '#966C0A', '--zhe': '#8A5A33'
  }
  const INK_TOKENS: Record<string, string> = {
    ...PAPER_TOKENS,
    '--ink3': '#8F8977', '--line': '#2F2D24', '--ink2': '#B8B3A4',
    '--hq': '#8FB2D1', '--sl': '#6FBF93', '--zs': '#E07B6B',
    '--zs-t': 'rgba(224, 123, 107, .14)', '--paper2': '#1D1C15',
    '--th': '#D9B36A', '--zhe': '#C89B72'
  }

  function setTokens(toks: Record<string, string>) {
    for (const [k, v] of Object.entries(toks)) document.documentElement.style.setProperty(k, v)
  }

  beforeEach(() => {
    setTokens(PAPER_TOKENS)
  })

  afterEach(() => {
    for (const k of Object.keys(PAPER_TOKENS)) document.documentElement.style.removeProperty(k)
    document.documentElement.removeAttribute('data-artist-theme')
    document.documentElement.removeAttribute('data-reduce-motion')
  })

  it('TC-ITC-06: data-artist-theme 变化后按新 token 重建，且重建不再重放入场动画', async () => {
    getIncomeMonthly.mockResolvedValue({ months: [row('2026-07', 10000)] })
    getIncomeByStyle.mockResolvedValue({ styles: [{ styleName: '厚涂', cents: 10000 }] })
    const w = mountCharts()
    await flushPromises()
    // 柱 + 线 + 环 = 3 次实例化（增量口径：前面用例留下的 wrapper 也挂着主题观察器）
    const afterMount = chartCtor.mock.calls.length
    expect(afterMount).toBeGreaterThanOrEqual(3)
    const mountCalls = chartCtor.mock.calls.slice(afterMount - 3)
    const firstConfigs = mountCalls.map(c => c[1] as { data?: { datasets?: Array<{ backgroundColor?: unknown }> }; options?: { animation?: unknown } })
    // 宣纸档：主图取花青（token 实测读到了，不是走兜底）
    expect(firstConfigs[0].data!.datasets![0].backgroundColor).toBe('#33526E')
    // 允许动效时入场动画保持默认（不显式关掉）
    expect(firstConfigs[0].options!.animation).toBeUndefined()

    const destroyedBefore = destroyChartCtor.mock.calls.length
    setTokens(INK_TOKENS)
    document.documentElement.setAttribute('data-artist-theme', 'ink')
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()

    const inkNew = chartCtor.mock.calls.slice(afterMount).map(
      c => c[1] as { data?: { datasets?: Array<{ backgroundColor?: unknown }> }; options?: { animation?: unknown } }
    )
    expect(inkNew.length).toBeGreaterThanOrEqual(3)
    // 新 token 真的进了新图（柱身花青提亮）——「按新 token 重建」这一半此前测不到
    expect(inkNew.some(cfg => cfg.data?.datasets?.[0]?.backgroundColor === '#8FB2D1')).toBe(true)
    // 换肤重建一律关动画：canvas 不吃 --dur-*，也不被 [data-reduce-motion] 的 CSS 兜底压住
    for (const cfg of inkNew) expect(cfg.options!.animation).toBe(false)
    // 旧实例被销毁（destroy 有 spy：删掉 destroyCharts() 会转红）
    expect(destroyChartCtor.mock.calls.length).toBeGreaterThan(destroyedBefore)
    w.unmount()
  })

  it('TC-ITC-07: 应用内「减少动效」开关打开时，首载也不放入场动画', async () => {
    getIncomeMonthly.mockResolvedValue({ months: [row('2026-07', 10000)] })
    document.documentElement.dataset.reduceMotion = 'on'
    const w = mountCharts()
    await flushPromises()
    const base = chartCtor.mock.calls.length
    expect(base).toBeGreaterThanOrEqual(2)
    const cfg = chartCtor.mock.calls[base - 2][1] as { options?: { animation?: unknown } }
    expect(cfg.options!.animation).toBe(false)
    w.unmount()
  })
})
