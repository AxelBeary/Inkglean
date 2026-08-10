// useManualOrderPricing 算价竞态测试（R-13）
// 覆盖：两次 calculateStylePrice 乱序返回时，最终 preview/finalPriceYuan 取最后一次请求的结果；
//       过期请求失败不清空新预览；stopStyleCalc 清理未触发计时器
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  calculateStylePrice: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))
vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn() }
}))
vi.mock('../../api/index.js', () => ({
  artistPublicApi: { calculateStylePrice: (...args) => h.calculateStylePrice(...args) }
}))

import { useManualOrderPricing } from '../useManualOrderPricing.js'

const MOCK_STYLE = {
  id: 11,
  name: '厚涂',
  sizes: [
    { id: 111, name: '头像', base_price: 80, display_status: 'available', addons: [] }
  ]
}

function setup() {
  const styles = ref([MOCK_STYLE])
  return useManualOrderPricing({ styles, getSubdomain: () => 'alice' })
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useManualOrderPricing 算价竞态（R-13）', () => {
  beforeEach(() => {
    h.calculateStylePrice.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('慢请求晚到不覆盖新结果（preview 与 finalPriceYuan 均为最后一次请求）', async () => {
    vi.useFakeTimers()
    const pricing = setup()
    const d1 = deferred()
    const d2 = deferred()
    h.calculateStylePrice.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    pricing.selectStyle(11)
    pricing.selectSize(111) // 请求 #1（timer 300ms）
    await vi.advanceTimersByTimeAsync(300)
    pricing.scheduleStyleCalc() // 请求 #2
    await vi.advanceTimersByTimeAsync(300)

    // 乱序返回：新请求先到，旧请求后到
    d2.resolve({ totalCents: 20000, afterMultipliersCents: 20000 })
    await flushPromises()
    expect(pricing.stylePricePreview.value.totalCents).toBe(20000)
    expect(pricing.finalPriceYuan.value).toBe(200)

    d1.resolve({ totalCents: 10000, afterMultipliersCents: 10000 })
    await flushPromises()
    expect(pricing.stylePricePreview.value.totalCents).toBe(20000) // 旧结果被丢弃
    expect(pricing.finalPriceYuan.value).toBe(200)
  })

  it('过期请求失败不把新预览清空', async () => {
    vi.useFakeTimers()
    const pricing = setup()
    const d1 = deferred()
    const d2 = deferred()
    h.calculateStylePrice.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    pricing.selectStyle(11)
    pricing.selectSize(111)
    await vi.advanceTimersByTimeAsync(300)
    pricing.scheduleStyleCalc()
    await vi.advanceTimersByTimeAsync(300)

    d2.resolve({ totalCents: 30000, afterMultipliersCents: 30000 })
    await flushPromises()
    d1.reject(new Error('stale'))
    await flushPromises()
    expect(pricing.stylePricePreview.value.totalCents).toBe(30000)
    expect(pricing.finalPriceYuan.value).toBe(300)
  })

  it('stopStyleCalc 清理未触发计时器（R-18 同款清理语义）', async () => {
    vi.useFakeTimers()
    const pricing = setup()
    pricing.selectStyle(11)
    pricing.selectSize(111)
    pricing.stopStyleCalc()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.calculateStylePrice).not.toHaveBeenCalled()
  })
})
