// PriceCalculator 结果卡渲染（回归：曾按本地臆造字段名取数，金额恒 ¥0、增项明细恒空）
// 覆盖：基础价 / 固定增项 / 百分比增项 / 倍率增量 / 合计均按 StylePriceResult（整数分）渲染。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({ calculateStylePrice: vi.fn() }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))
vi.mock('../../../api/index.js', () => ({
  artistPublicApi: {
    getPublicStyles: () => Promise.resolve([
      {
        id: 1,
        name: '厚涂',
        sizes: [
          { id: 2, name: '头像', base_price: 80, display_status: 'available', addons: [], work_days: 3 }
        ]
      }
    ]),
    getPricing: () => Promise.resolve({ multipliers: [] }),
    calculateStylePrice: (...args: unknown[]) => h.calculateStylePrice(...args)
  },
  artistApi: { getProfile: () => Promise.resolve({ subdomain: 'alice' }) }
}))
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    subdomain: 'alice',
    profile: { subdomain: 'alice' },
    fetchProfile: vi.fn()
  })
}))
vi.mock('../../../components/ArtistLayout.vue', () => ({
  default: { name: 'ArtistLayout', template: '<div><slot /></div>' }
}))

import PriceCalculator from '../PriceCalculator.vue'

const RESULT = {
  styleName: '厚涂',
  sizeName: '头像',
  baseCents: 8000,
  fixedAddonItems: [{ name: '精细线稿', quantity: 1, unitCents: 2000, amountCents: 2000, source: 'add' }],
  percentAddonItems: [{ name: '商用授权', quantity: 1, percent: 10, amountCents: 800, source: 'add' }],
  subtotalCents: 10800,
  usage: { name: '商用 ×2', percent: 100, incrementCents: 10800 },
  rush: null,
  afterMultipliersCents: 21600,
  discount: null,
  totalCents: 21600
}

function mountCalc() {
  return mount(PriceCalculator, {
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key: string) => [key]
      },
      stubs: {
        'el-switch': { template: '<input type="checkbox" />' },
        'el-input-number': { template: '<input type="number" />' },
        'el-radio-group': { template: '<div><slot /></div>' },
        'el-radio-button': { template: '<label><slot /></label>' }
      },
      directives: { loading: {} }
    }
  })
}

afterEach(() => {
  vi.useRealTimers()
  h.calculateStylePrice.mockReset()
})

describe('PriceCalculator 结果卡渲染', () => {
  it('按 StylePriceResult 渲染基础价 / 增项 / 倍率 / 合计', async () => {
    vi.useFakeTimers()
    h.calculateStylePrice.mockResolvedValue(RESULT)
    const wrapper = mountCalc()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()

    const card = wrapper.find('.calc-result')
    expect(card.exists()).toBe(true)
    const text = card.text()
    expect(text).toContain('¥80')      // 基础价 8000 分
    expect(text).toContain('¥20')      // 固定增项 2000 分
    expect(text).toContain('¥8')       // 百分比增项 800 分
    expect(text).toContain('¥108')     // 倍率增量 10800 分
    expect(text).toContain('¥216')     // 合计 21600 分
    expect(text).not.toContain('¥0')
    wrapper.unmount()
  })
})
