// ManualOrder 画风模式测试（SPEC-PRICE-2：画风→尺寸→增项三区选择 + calculate-style-price 算价 + 提交透传）
// 覆盖：多画风三级选择、单画风退化、无画风自定义单、未选尺寸拦截、用途单选、G2 脏标记语义（未手输不调 updatePrice）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElSwitch, ElInputNumber } from 'element-plus'
import ElementPlus from 'element-plus'

// happy-dom 无 ResizeObserver，Element Plus 内部可能用到，补齐
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Mocks（vi.mock 自动提升） ───
// 818-D: ManualOrder 新增 useRoute（读 /orders/new?from=&fill= 预填）；测试默认无回填 query
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} })
}))

// 部分 mock：保留真实 createI18n（stores/artist 顶层 import i18n/index 需初始化），仅覆写 useI18n
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
  }
})

// 挂载容器：每个用例 mount 前设置 h.state
const h = vi.hoisted(() => ({
  profile: null as typeof MOCK_PROFILE | null,
  styles: [] as unknown[],
  pricing: null as typeof MOCK_PRICING | null,
  styleCalc: null as typeof MOCK_STYLE_CALC | null,
  styleCalcCalls: 0,
  created: null as Record<string, unknown> | null,
  updatedPrice: null as Record<string, unknown> | null,
  extraItems: [] as { id: number; data: { name: string; priceCents: number } }[]
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: () => Promise.resolve(h.profile),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getOrders: () => Promise.resolve({ items: [] }),
    createManualOrder: (data: Record<string, unknown>) => { h.created = data; return Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null as string | null }) },
    updatePrice: (id: number, data: Record<string, unknown>) => { h.updatedPrice = { id, ...data }; return Promise.resolve({}) },
    addExtraItem: (id: number, data: { name: string; priceCents: number }) => { h.extraItems.push({ id, data }); return Promise.resolve({}) },
    updateDeadline: () => Promise.resolve({}),
    updateStartDate: () => Promise.resolve({}),
    advanceStage: () => Promise.resolve({}),
    updateStatus: () => Promise.resolve({})
  },
  artistPublicApi: {
    getPricing: () => Promise.resolve(h.pricing),
    getPublicStyles: () => Promise.resolve(h.styles),
    calculateStylePrice: () => { h.styleCalcCalls += 1; return Promise.resolve(h.styleCalc) }
  },
  uploadApi: { reference: () => Promise.resolve({ filePath: 'references/test.png', url: '/uploads/references/test.png' }) }
}))

// 子组件 stub——录单页业务在 ManualOrder 本身
vi.mock('../../../components/ArtistLayout.vue', () => ({
  default: { name: 'ArtistLayout', template: '<div><slot /></div>' }
}))
vi.mock('../../../composables/usePasteUpload.js', async () => {
  const { ref } = await import('vue')
  return {
    usePasteUpload: () => ({ pasteError: ref(null) })
  }
})
vi.mock('../../../composables/useDropGuard.js', () => ({
  useDropGuard: () => ({
    guardDragEnter: () => true,
    guardDragOver: () => true,
    guardDrop: () => true
  })
}))

import ManualOrder from '../ManualOrder.vue'

// ─── 测试数据（SPEC-PRICE-2：getPublicStyles 含 category/price_mode；算价响应整数分） ───
const MOCK_PROFILE = {
  subdomain: 'alice'
}

const MOCK_PRICING = {
  styles: [] as unknown[],
  installments: [] as unknown[],
  discountEnabled: false
}

const ADDON_SWITCH = { id: 1112, addon_template_id: 92, name: '换装', control_type: 'switch', price_mode: 'fixed', price: 40, unit_label: null as string | null, category: 'add', max_quantity: null as number | null, is_enabled: true }
const ADDON_QTY = { id: 1111, addon_template_id: 91, name: '表情差分', control_type: 'quantity', price_mode: 'fixed', price: 15, unit_label: '个', category: 'add', max_quantity: 5, is_enabled: true }
const ADDON_USAGE = { id: 1113, addon_template_id: 93, name: '商用', control_type: 'switch', price_mode: 'percent', price: 50, unit_label: null as string | null, category: 'usage', max_quantity: null as number | null, is_enabled: true }

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: '厚涂风格', cover_image: null as string | null, sort_order: 1,
    sizes: [
      { id: 111, name: '头像', base_price: 80, sort_order: 1, image: null as string | null, image_artwork_id: null as number | null, artwork_image_path: null as string | null, description: null as string | null, work_days: 3, display_status: 'available', addons: [ADDON_SWITCH, ADDON_QTY, ADDON_USAGE] },
      { id: 112, name: '全身', base_price: 200, sort_order: 2, image: null as string | null, image_artwork_id: null as number | null, artwork_image_path: null as string | null, description: null as string | null, work_days: 7, display_status: 'available', addons: [ADDON_QTY] }
    ]
  },
  {
    id: 12, name: '线稿', description: null as string | null, cover_image: null as string | null, sort_order: 2,
    sizes: [
      { id: 121, name: '头像', base_price: 50, sort_order: 1, image: null as string | null, image_artwork_id: null as number | null, artwork_image_path: null as string | null, description: null as string | null, work_days: 2, display_status: 'available', addons: [] as unknown[] }
    ]
  }
]

const MOCK_STYLE_CALC = {
  styleName: '厚涂', sizeName: '头像', baseCents: 8000,
  fixedAddonItems: [] as unknown[], percentAddonItems: [] as unknown[], subtotalCents: 8000,
  usage: null as string | null, rush: null as string | null, afterMultipliersCents: 8000,
  discount: null as string | null, totalCents: 8000
}

function setupState({ styles = [], profile = MOCK_PROFILE, pricing = MOCK_PRICING, styleCalc = MOCK_STYLE_CALC }: {
  styles?: unknown[]
  profile?: typeof MOCK_PROFILE
  pricing?: typeof MOCK_PRICING
  styleCalc?: typeof MOCK_STYLE_CALC
} = {}) {
  h.profile = profile
  h.styles = styles
  h.pricing = pricing
  h.styleCalc = styleCalc
  h.styleCalcCalls = 0
  h.created = null
  h.updatedPrice = null
  h.extraItems = []
}

/** 挂载（Element Plus 全量注册；date-picker/upload/dialog 等重型组件占位） */
function mountPage() {
  return mount(ManualOrder, {
    global: {
      plugins: [ElementPlus],
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: {
        'el-date-picker': { template: '<div class="date-picker-stub" />' },
        'el-upload': { template: '<div class="upload-stub" />' },
        'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
        'el-tooltip': { template: '<span><slot /></span>' },
        'el-icon': { template: '<span><slot /></span>' },
        'el-empty': { template: '<div class="empty-stub" />' }
      }
    }
  })
}

/** 在指定区块（按标题键定位 .mo-field）内点第 n 张卡片 */
async function clickCardInSection(wrapper: ReturnType<typeof mount>, titleKey: string, n: number) {
  const section = wrapper.findAll('.mo-field').find(f => f.text().includes(titleKey))
  const cards = section!.findAll('.tier-card')
  await cards[n].trigger('click')
  await flushPromises()
}

/** 填客户 QQ 并点提交 */
async function fillQqAndSubmit(wrapper: ReturnType<typeof mount>, qq: string = '123456789') {
  const qqInput = wrapper.find('input[placeholder="manualOrder.clientQqPlaceholder"]')
  await qqInput.setValue(qq)
  await wrapper.find('.mo-submit-btn').trigger('click')
  await flushPromises()
}

describe('ManualOrder 画风模式（SPEC-PRICE-2）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('多画风：画风→尺寸→增项 三级选择，提交透传 styleSizeId/styleAddons（无旧字段）', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 1. 画风卡片渲染（2 张），旧档位区已退役不渲染
    expect(wrapper.findAll('.mo-field .tier-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('manualOrder.styleTitle')
    expect(wrapper.text()).not.toContain('manualOrder.tier:')

    // 2. 选画风 → 尺寸卡片渲染（2 张），显示天数
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    expect(wrapper.text()).toContain('manualOrder.sizeTitle')
    expect(wrapper.text()).toContain('manualOrder.sizeDays:{"n":3}')

    // 3. 选尺寸 → 普通增项 2 个（switch+qty）+ 用途 chip 1 个；300ms 防抖后算价触发
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    expect(wrapper.findAll('.style-addon-item')).toHaveLength(2)
    expect(wrapper.findAll('.mult-chip--usage')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(300)
    expect(h.styleCalcCalls).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('manualOrder.totalPrice')

    // 4. 勾选 switch 增项（定位画风增项区块内——页面第一个 ElSwitch 是 R6 图片开关）
    const switchComp = wrapper.find('.style-addon-item').findComponent(ElSwitch)
    await switchComp.vm.$emit('change', true)
    await vi.advanceTimersByTimeAsync(300)

    // 5. 填 QQ 提交 → 透传断言（SPEC-PRICE-2 契约，无 tierId/旧倍率字段）
    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.created).not.toHaveProperty('tierId')
    expect(h.created).not.toHaveProperty('usageMultiplierId')
    expect(h.created!.styleSizeId).toBe(111)
    expect(h.created!.styleAddons).toEqual([{ styleAddonId: 1112 }])
    expect(h.created!.addons).toBeUndefined() // 旧 addons 字段已冻结停传
    // G2：未手输价 → 不调 updatePrice
    expect(h.updatedPrice).toBeNull()

    wrapper.unmount()
  })

  it('单画风：跳过选画风，直接选尺寸，提交透传', async () => {
    setupState({ styles: [MOCK_STYLES[1]] })
    const wrapper = mountPage()
    await flushPromises()

    // 无画风选择区（styleTitle 不渲染），尺寸卡片直接出现
    expect(wrapper.text()).not.toContain('manualOrder.styleTitle')
    expect(wrapper.text()).toContain('manualOrder.sizeTitle')
    expect(wrapper.findAll('.mo-field .tier-card')).toHaveLength(1)

    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    await vi.advanceTimersByTimeAsync(300)
    await fillQqAndSubmit(wrapper)

    expect(h.created).not.toBeNull()
    expect(h.created).not.toHaveProperty('tierId')
    expect(h.created!.styleSizeId).toBe(121)
    expect(h.created!.styleAddons).toEqual([])
    expect(h.created!.addons).toBeUndefined() // 旧 addons 字段已冻结停传

    wrapper.unmount()
  })

  it('无画风配置：自定义单路径可用（手输价提交，无 styleSizeId）', async () => {
    setupState({ styles: [] })
    const wrapper = mountPage()
    await flushPromises()

    // 无画风/尺寸区；手输价后提交
    expect(wrapper.text()).not.toContain('manualOrder.styleTitle')
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 66)
    await fillQqAndSubmit(wrapper)

    expect(h.created).not.toBeNull()
    expect(h.created!.styleSizeId).toBeUndefined()
    expect(h.created!.styleAddons).toBeUndefined()
    expect(h.updatedPrice).not.toBeNull()
    expect(h.updatedPrice!.finalPriceCents).toBe(6600)

    wrapper.unmount()
  })

  it('画风模式未选尺寸直接提交（未手输价）→ 拦截提示，不调 createManualOrder', async () => {
    setupState({ styles: MOCK_STYLES })
    const warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({} as ReturnType<typeof ElMessage.warning>))
    const wrapper = mountPage()
    await flushPromises()

    await fillQqAndSubmit(wrapper)
    expect(warnSpy).toHaveBeenCalledWith('manualOrder.selectSizeOrPrice')
    expect(h.created).toBeNull()

    wrapper.unmount()
  })

  it('切画风/切尺寸重置增项与价格（G2 脏标记恢复跟随计算）', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 选画风 1 → 尺寸 1 → 勾 switch
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    const switchComp = wrapper.find('.style-addon-item').findComponent(ElSwitch)
    await switchComp.vm.$emit('change', true)
    await vi.advanceTimersByTimeAsync(300)

    // 切到画风 2 → 尺寸/增项/价格全部重置
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 1)
    expect(wrapper.findAll('.style-addon-item')).toHaveLength(0)
    expect(wrapper.text()).toContain('manualOrder.sizeTitle')

    // 再提交 → styleSizeId 是画风 2 的尺寸（无残留增项）
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    await vi.advanceTimersByTimeAsync(300)
    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.created!.styleSizeId).toBe(121)
    expect(h.created!.styleAddons).toEqual([])

    wrapper.unmount()
  })

  it('用途单选 chip：点选后提交带用途增项；再点取消', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)

    // 用途 chip 渲染（商用 +50%）
    const chip = wrapper.find('.mult-chip--usage')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('商用')
    expect(chip.text()).toContain('+50%')

    // 点选 → 提交带用途增项
    await chip.trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await fillQqAndSubmit(wrapper)
    expect(h.created!.styleSizeId).toBe(111)
    expect(h.created!.styleAddons).toEqual([{ styleAddonId: 1113 }])

    // 再点取消 → 提交不带用途增项
    await chip.trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await fillQqAndSubmit(wrapper)
    expect(h.created!.styleAddons).toEqual([])

    wrapper.unmount()
  })
})

// ─── v0.38 补漏批 (REQ-029): R2 提示 / R5 自定义增项 / R6 图片开关 / B2 取消选中 ───
describe('ManualOrder 补漏批（REQ-029）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('R2: 画风模式显示自定义单提示（多画风 + 单画风都可见）', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('manualOrder.customHint')
    wrapper.unmount()

    setupState({ styles: [MOCK_STYLES[1]] })
    const wrapper2 = mountPage()
    await flushPromises()
    expect(wrapper2.text()).toContain('manualOrder.customHint')
    wrapper2.unmount()
  })

  it('B2: 点已选画风取消选中 → 尺寸区消失，手输价后可提交自定义单', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 选画风 1 → 尺寸区出现
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    expect(wrapper.text()).toContain('manualOrder.sizeTitle')

    // 再点同一画风 → 取消选中 → 尺寸区消失、无选中态
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    expect(wrapper.text()).not.toContain('manualOrder.sizeTitle')

    // 手输价 → 提交自定义单（无 tierId/无 styleSizeId）
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 88)
    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.created).not.toHaveProperty('tierId')
    expect(h.created!.styleSizeId).toBeUndefined()
    expect(h.created!.styleAddons).toBeUndefined()
    // G2: 手输价 ≠ 计算价(null) → updatePrice 补写
    expect(h.updatedPrice).not.toBeNull()
    expect(h.updatedPrice!.finalPriceCents).toBe(8800)

    wrapper.unmount()
  })

  it('R5: 自定义增项——负数录入、明细展示、提交补写 addExtraItem', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 打开编辑器（价格面板内）
    await wrapper.find('.mo-price-sticky .custom-addon-label button').trigger('click')
    await flushPromises()

    // 名称 + 负数金额
    const editor = wrapper.find('.mo-price-sticky .custom-addon-editor')
    await editor.find('input').setValue('让利优惠')
    const numComp = editor.findComponent(ElInputNumber)
    await numComp.vm.$emit('update:modelValue', -50)

    // 点 ✓ 添加
    await editor.findAll('button').at(0)!.trigger('click')
    await flushPromises()

    // 列表 + 明细展示（负数格式 -¥50.00）
    expect(wrapper.findAll('.mo-price-sticky .custom-addon-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('让利优惠')
    expect(wrapper.text()).toContain('-¥50.00')

    // 自定义单路径：不选画风/尺寸，手输价放行提交
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 500)
    // 提交 → addExtraItem 补写（priceCents 负数）
    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.extraItems).toEqual([{ id: 1, data: { name: '让利优惠', priceCents: -5000 } }])

    wrapper.unmount()
  })

  it('R5: 自定义增项——0 金额允许 + 上限 20 条拦截 + 可删除', async () => {
    setupState({ styles: MOCK_STYLES })
    const warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({} as ReturnType<typeof ElMessage.warning>))
    const wrapper = mountPage()
    await flushPromises()

    // 添加 20 条（0 金额留痕场景）
    for (let i = 0; i < 20; i++) {
      await wrapper.find('.mo-price-sticky .custom-addon-label button').trigger('click')
      await flushPromises()
      const editor = wrapper.find('.mo-price-sticky .custom-addon-editor')
      await editor.find('input').setValue(`留痕条目${i}`)
      const numComp = editor.findComponent(ElInputNumber)
      await numComp.vm.$emit('update:modelValue', 0)
      await editor.findAll('button').at(0)!.trigger('click')
      await flushPromises()
    }
    expect(wrapper.findAll('.mo-price-sticky .custom-addon-item')).toHaveLength(20)

    // 第 21 条被拦
    await wrapper.find('.mo-price-sticky .custom-addon-label button').trigger('click')
    await flushPromises()
    const editor = wrapper.find('.mo-price-sticky .custom-addon-editor')
    await editor.find('input').setValue('超限条目')
    await editor.findAll('button').at(0)!.trigger('click')
    await flushPromises()
    expect(warnSpy).toHaveBeenCalledWith('manualOrder.customAddonMax')
    expect(wrapper.findAll('.mo-price-sticky .custom-addon-item')).toHaveLength(20)

    // 删除第 1 条 → 19 条
    await wrapper.find('.mo-price-sticky .custom-addon-item .el-button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.mo-price-sticky .custom-addon-item')).toHaveLength(19)

    wrapper.unmount()
  })

  it('R6: 图片开关——关闭后卡片图片一起藏，localStorage 记忆刷新保持', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 默认开：画风卡无封面 → 首字占位块渲染
    expect(wrapper.findAll('.mo-field .tier-card-img--empty')).toHaveLength(2)

    // 关闭开关（v-model → update:modelValue）
    const switchComp = wrapper.find('.mo-show-images').findComponent(ElSwitch)
    await switchComp.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.findAll('.mo-field .tier-card-img--empty')).toHaveLength(0)
    expect(localStorage.getItem('manualOrder_showImages')).toBe('0')

    // 重新挂载 → 读取 localStorage，图片仍隐藏
    wrapper.unmount()
    const wrapper2 = mountPage()
    await flushPromises()
    expect(wrapper2.findAll('.mo-field .tier-card-img--empty')).toHaveLength(0)

    wrapper2.unmount()
  })

  it('R2/B3: 什么都不选 + 手输价 → 自定义单直接提交（不拦截）', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 不选任何画风/尺寸，手输最终价格
    const priceComp = wrapper.find('.mo-final-row').findComponent(ElInputNumber)
    await priceComp.vm.$emit('update:modelValue', 99)
    await fillQqAndSubmit(wrapper)

    expect(h.created).not.toBeNull()
    expect(h.created).not.toHaveProperty('tierId')
    expect(h.created!.styleSizeId).toBeUndefined()
    expect(h.created!.styleAddons).toBeUndefined()
    expect(h.created!.addons).toBeUndefined() // 旧 addons 字段已冻结停传
    expect(h.updatedPrice).not.toBeNull()
    expect(h.updatedPrice!.finalPriceCents).toBe(9900)

    wrapper.unmount()
  })

  it('R5: 自定义增项与画风模式并存——选画风+尺寸后录自定义增项，提交同时透传 styleAddons 与 extra items', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 选画风 1 → 尺寸 1 → 勾 switch 增项（定位增项区块内）
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    const switchComp = wrapper.find('.style-addon-item').findComponent(ElSwitch)
    await switchComp.vm.$emit('change', true)
    await vi.advanceTimersByTimeAsync(300)

    // 自定义增项 +100
    await wrapper.find('.mo-price-sticky .custom-addon-label button').trigger('click')
    await flushPromises()
    const editor = wrapper.find('.mo-price-sticky .custom-addon-editor')
    await editor.find('input').setValue('加急包装')
    const numComp = editor.findComponent(ElInputNumber)
    await numComp.vm.$emit('update:modelValue', 100)
    await editor.findAll('button').at(0)!.trigger('click')
    await flushPromises()

    // 价格面板总价 = 计算价(80) + 自定义(100) = 180
    const totalLine = wrapper.find('.mo-price-sticky .price-line.total .price-amount')
    expect(totalLine.text()).toBe('¥180.00')

    // 提交 → styleSizeId + styleAddons + extraItems 三路并存
    await fillQqAndSubmit(wrapper)
    expect(h.created!.styleSizeId).toBe(111)
    expect(h.created!.styleAddons).toEqual([{ styleAddonId: 1112 }])
    expect(h.extraItems).toEqual([{ id: 1, data: { name: '加急包装', priceCents: 10000 } }])
    // G2: 未手输价 → 不调 updatePrice
    expect(h.updatedPrice).toBeNull()

    wrapper.unmount()
  })
})
