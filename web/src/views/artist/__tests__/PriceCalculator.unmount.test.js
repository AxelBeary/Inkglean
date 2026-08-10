// PriceCalculator 卸载清理测试（R-18）
// 覆盖：选尺寸/自动选中触发 300ms 防抖后立即卸载，计时器被清理、不再白发算价请求；
//       对照用例：未卸载时防抖到期正常发请求
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  calculateStylePrice: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
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
    calculateStylePrice: (...args) => h.calculateStylePrice(...args)
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

function mountCalc() {
  return mount(PriceCalculator, {
    global: {
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key) => [key]
      },
      stubs: {
        'el-switch': { template: '<input type="checkbox" />' },
        'el-input-number': { template: '<input type="number" />' },
        'el-radio-group': { template: '<div><slot /></div>' },
        'el-radio-button': { template: '<label><slot /></label>' }
      }
    }
  })
}

describe('PriceCalculator 卸载清理（R-18）', () => {
  afterEach(() => {
    vi.useRealTimers()
    h.calculateStylePrice.mockReset()
  })

  it('卸载后 300ms 内不再发算价请求', async () => {
    vi.useFakeTimers()
    h.calculateStylePrice.mockResolvedValue({ totalCents: 8000 })
    const wrapper = mountCalc()
    await flushPromises() // onMounted 完成 + 单画风自动选中尺寸并调度防抖
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(1000)

    expect(h.calculateStylePrice).not.toHaveBeenCalled()
  })

  it('对照：未卸载时防抖到期正常发请求', async () => {
    vi.useFakeTimers()
    h.calculateStylePrice.mockResolvedValue({ totalCents: 8000 })
    const wrapper = mountCalc()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(400)

    expect(h.calculateStylePrice).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
