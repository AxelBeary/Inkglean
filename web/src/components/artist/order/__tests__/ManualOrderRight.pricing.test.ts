// P0-2 / WEB-01 回归测试：手动录单提交序列与 displayPrice 口径统一
// 覆盖：
//   1. 选尺寸(¥100)→加自定义增项¥50→手输最终价200→提交 → addExtraItem 先于 updatePrice，updatePrice 写 20000
//   2. 不手输价时 → 无 updatePrice，addExtraItem 正常补写（落库=计算价+增项）
//   3. displayPrice：未手输显示 calc+addons 合计；手输后显示手输价（按钮/落库口径一致）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
import ElementPlus from 'element-plus'

// happy-dom 无 ResizeObserver，Element Plus 内部可能用到
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
  }
})

// API 调用顺序追踪（P0-2 核心断言：addExtraItem 必须在 updatePrice 之前）
const h = vi.hoisted(() => ({
  callLog: [] as string[],
  created: null as Record<string, unknown> | null,
  updatedPrice: null as Record<string, unknown> | null,
  extraItems: [] as { id: number; data: { name: string; priceCents: number } }[],
  styleCalc: null as Record<string, unknown> | null
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    createManualOrder: (data: Record<string, unknown>) => {
      h.callLog.push('createManualOrder')
      h.created = data
      return Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null as string | null })
    },
    updatePrice: (id: number, data: Record<string, unknown>) => {
      h.callLog.push('updatePrice')
      h.updatedPrice = { id, ...data }
      return Promise.resolve({})
    },
    addExtraItem: (id: number, data: { name: string; priceCents: number }) => {
      h.callLog.push('addExtraItem')
      h.extraItems.push({ id, data })
      return Promise.resolve({})
    },
    updateDeadline: () => Promise.resolve({}),
    updateStartDate: () => Promise.resolve({}),
    advanceStage: () => Promise.resolve({}),
    updateStatus: () => Promise.resolve({}),
    addNote: () => Promise.resolve({})
  },
  artistPublicApi: {
    calculateStylePrice: () => Promise.resolve(h.styleCalc)
  }
}))

import ManualOrderRight from '../ManualOrderRight.vue'

// ─── 测试数据 ───
const MOCK_STYLE_CALC = {
  styleName: '厚涂', sizeName: '头像', baseCents: 10000,
  fixedAddonItems: [] as unknown[], percentAddonItems: [] as unknown[],
  subtotalCents: 10000, usage: null, rush: null,
  afterMultipliersCents: 10000, discount: null, totalCents: 10000
}

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: null as string | null, cover_image: null as string | null, sort_order: 1,
    sizes: [
      {
        id: 111, name: '头像', base_price: 100, sort_order: 1,
        image: null as string | null, image_artwork_id: null as number | null,
        artwork_image_path: null as string | null, description: null as string | null,
        work_days: 3, display_status: 'available', addons: [] as unknown[]
      }
    ]
  }
]

function resetState() {
  h.callLog = []
  h.created = null
  h.updatedPrice = null
  h.extraItems = []
  h.styleCalc = MOCK_STYLE_CALC
}

function mountComp() {
  return mount(ManualOrderRight, {
    props: {
      styles: MOCK_STYLES as never[],
      subdomain: 'alice',
      validateForm: () => Promise.resolve(true),
      clientQq: '123456789'
    },
    global: {
      plugins: [ElementPlus],
      mocks: { $t: (key: string) => key },
      stubs: {
        'el-tooltip': { template: '<span><slot /></span>' },
        'el-icon': { template: '<span><slot /></span>' },
        transition: { template: '<div><slot /></div>' }
      }
    }
  })
}

/** 选尺寸 → 等防抖算价完成 */
async function selectSizeAndWaitCalc(wrapper: ReturnType<typeof mountComp>) {
  await wrapper.find('.tier-card').trigger('click')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

/** 添加一条自定义增项 */
async function addCustomAddon(wrapper: ReturnType<typeof mountComp>, name: string, priceYuan: number) {
  await wrapper.find('.mo-price-sticky .custom-addon-label button').trigger('click')
  await flushPromises()
  const editor = wrapper.find('.mo-price-sticky .custom-addon-editor')
  await editor.find('input').setValue(name)
  const numComp = editor.findComponent(ElInputNumber)
  await numComp.vm.$emit('update:modelValue', priceYuan)
  await editor.findAll('button').at(0)!.trigger('click')
  await flushPromises()
}

describe('ManualOrderRight P0-2 提交序列回归', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetState()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('选尺寸(¥100)→加自定义增项¥50→手输最终价200→提交：addExtraItem 先于 updatePrice，updatePrice 写 20000', async () => {
    const wrapper = mountComp()
    await flushPromises()

    // 单画风自动选中 → 选尺寸 → 算价 totalCents=10000
    await selectSizeAndWaitCalc(wrapper)

    // 添加自定义增项 ¥50
    await addCustomAddon(wrapper, '额外修改', 50)

    // 手输最终价 ¥200（置 priceTouched=true）
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 200)
    await flushPromises()

    // 提交
    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    // ─── 核心断言：API 调用顺序 = createManualOrder → addExtraItem → updatePrice ───
    expect(h.callLog).toEqual(['createManualOrder', 'addExtraItem', 'updatePrice'])
    // updatePrice 写入 20000（手输价 ¥200 = 最终覆盖值）
    expect(h.updatedPrice).not.toBeNull()
    expect(h.updatedPrice!.finalPriceCents).toBe(20000)
    // addExtraItem 写入 5000（增项 ¥50，在 updatePrice 之前执行）
    expect(h.extraItems).toEqual([{ id: 1, data: { name: '额外修改', priceCents: 5000 } }])
    // createManualOrder 透传 styleSizeId
    expect(h.created!.styleSizeId).toBe(111)

    wrapper.unmount()
  })

  it('不手输价时：无 updatePrice 调用，addExtraItem 正常补写（落库=计算价+增项）', async () => {
    const wrapper = mountComp()
    await flushPromises()

    await selectSizeAndWaitCalc(wrapper)
    await addCustomAddon(wrapper, '额外修改', 50)

    // 不手输价，直接提交
    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    // 无 updatePrice（priceTouched=false → G2 守卫生效）
    expect(h.callLog).toEqual(['createManualOrder', 'addExtraItem'])
    expect(h.updatedPrice).toBeNull()
    // addExtraItem 正常
    expect(h.extraItems).toEqual([{ id: 1, data: { name: '额外修改', priceCents: 5000 } }])

    wrapper.unmount()
  })

  it('多条自定义增项全部写完再 updatePrice（手输价覆盖全部增项累加）', async () => {
    const wrapper = mountComp()
    await flushPromises()

    await selectSizeAndWaitCalc(wrapper)
    await addCustomAddon(wrapper, '增项A', 30)
    await addCustomAddon(wrapper, '增项B', 20)

    // 手输 ¥180
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 180)
    await flushPromises()

    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    // 顺序：create → addExtraItem ×2 → updatePrice
    expect(h.callLog).toEqual(['createManualOrder', 'addExtraItem', 'addExtraItem', 'updatePrice'])
    expect(h.extraItems).toEqual([
      { id: 1, data: { name: '增项A', priceCents: 3000 } },
      { id: 1, data: { name: '增项B', priceCents: 2000 } }
    ])
    // 手输价 ¥180 = 最终覆盖值（不是 100+30+20=150，也不是 180+50=230）
    expect(h.updatedPrice!.finalPriceCents).toBe(18000)

    wrapper.unmount()
  })
})

describe('ManualOrderRight WEB-01 displayPrice 口径回归', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetState()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('未手输价：按钮显示「计算价 + 自定义增项」合计（¥150）', async () => {
    const wrapper = mountComp()
    await flushPromises()

    await selectSizeAndWaitCalc(wrapper)
    await addCustomAddon(wrapper, '额外修改', 50)

    // 按钮显示 ¥150（calc 100 + addons 50），与总价行、落库口径一致
    const btnText = wrapper.find('.mo-submit-btn').text()
    expect(btnText).toContain('¥150')

    wrapper.unmount()
  })

  it('手输价后：按钮显示手输价（¥200），覆盖 calc+addons', async () => {
    const wrapper = mountComp()
    await flushPromises()

    await selectSizeAndWaitCalc(wrapper)
    await addCustomAddon(wrapper, '额外修改', 50)

    // 手输前按钮显示 ¥150
    expect(wrapper.find('.mo-submit-btn').text()).toContain('¥150')

    // 手输 ¥200 → 按钮切换显示手输价
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 200)
    await flushPromises()

    const btnText = wrapper.find('.mo-submit-btn').text()
    expect(btnText).toContain('¥200')
    // 不再显示 ¥150（手输价覆盖）
    expect(btnText).not.toContain('¥150')

    wrapper.unmount()
  })

  it('无自定义增项 + 未手输：按钮显示纯计算价（¥100）', async () => {
    const wrapper = mountComp()
    await flushPromises()

    await selectSizeAndWaitCalc(wrapper)

    const btnText = wrapper.find('.mo-submit-btn').text()
    expect(btnText).toContain('¥100')

    wrapper.unmount()
  })
})
