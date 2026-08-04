// ManualOrder 画风模式测试（v0.38 D路：画风→尺寸→增项 三级选择 + calculateStylePrice 算价 + 提交透传）
// 覆盖：多画风三级选择、单画风退化、旧档位模式回归、未选尺寸拦截、G2 脏标记语义（未手输不调 updatePrice）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElMessage, ElSwitch, ElInputNumber, ElRadioGroup } from 'element-plus'
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
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

// 挂载容器：每个用例 mount 前设置 h.state
const h = vi.hoisted(() => ({
  profile: null,
  styles: [],
  pricing: null,
  styleCalc: null,
  styleCalcCalls: 0,
  created: null,
  updatedPrice: null
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: () => Promise.resolve(h.profile),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getOrders: () => Promise.resolve({ items: [] }),
    createManualOrder: (data) => { h.created = data; return Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null }) },
    updatePrice: (id, data) => { h.updatedPrice = { id, ...data }; return Promise.resolve({}) },
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

// ─── 测试数据（对齐后端 getPublicStyles / calculate-style-price 响应结构） ───
const MOCK_PROFILE = {
  subdomain: 'alice',
  tiers: [
    { id: 1, name: '头像', price: 100, work_days: 3 },
    { id: 2, name: '半身像', price: 300, work_days: 7 }
  ]
}

const MOCK_PRICING = {
  tiers: [
    {
      id: 1,
      addons: [
        { id: 101, name: '表情差分A', category: 'expression', select_mode: 'quantity', price_type: 'fixed', price_value: 20, max_qty: 5 }
      ]
    },
    { id: 2, addons: [] }
  ],
  multipliers: [],
  installments: []
}

const ADDON_SWITCH = { id: 1112, addon_template_id: 92, name: '换装', control_type: 'switch', pricing_mode: 'fixed', price: 40, options: null, unit_label: null, is_enabled: true }
const ADDON_QTY = { id: 1111, addon_template_id: 91, name: '表情差分', control_type: 'quantity', pricing_mode: 'fixed', price: 15, options: null, unit_label: '个', is_enabled: true }
const ADDON_RADIO = { id: 1113, addon_template_id: 93, name: '复杂背景', control_type: 'radio', pricing_mode: 'fixed', price: 0, options: '[{"label":"室内","price":30},{"label":"室外","price":60}]', unit_label: null, is_enabled: true }

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: '厚涂风格', cover_image: null, sort_order: 1,
    sizes: [
      { id: 111, name: '头像', base_price: 80, sort_order: 1, image: null, image_artwork_id: null, artwork_image_path: null, description: null, work_days: 3, addons: [ADDON_SWITCH, ADDON_QTY, ADDON_RADIO] },
      { id: 112, name: '全身', base_price: 200, sort_order: 2, image: null, image_artwork_id: null, artwork_image_path: null, description: null, work_days: 7, addons: [ADDON_QTY] }
    ]
  },
  {
    id: 12, name: '线稿', description: null, cover_image: null, sort_order: 2,
    sizes: [
      { id: 121, name: '头像', base_price: 50, sort_order: 1, image: null, image_artwork_id: null, artwork_image_path: null, description: null, work_days: 2, addons: [] }
    ]
  }
]

const MOCK_STYLE_CALC = {
  styleName: '厚涂', sizeName: '头像', basePrice: 80,
  addonItems: [], subtotal: 80, usageMultiplier: null, rushMultiplier: null,
  multiplierTotal: 80, discount: null, totalPrice: 80, totalPriceCents: 8000
}

function setupState({ styles = [], profile = MOCK_PROFILE, pricing = MOCK_PRICING, styleCalc = MOCK_STYLE_CALC } = {}) {
  h.profile = profile
  h.styles = styles
  h.pricing = pricing
  h.styleCalc = styleCalc
  h.styleCalcCalls = 0
  h.created = null
  h.updatedPrice = null
}

/** 挂载（Element Plus 全量注册；date-picker/upload/dialog 等重型组件占位） */
function mountPage() {
  return mount(ManualOrder, {
    global: {
      plugins: [ElementPlus],
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
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
async function clickCardInSection(wrapper, titleKey, n) {
  const section = wrapper.findAll('.mo-field').find(f => f.text().includes(titleKey))
  const cards = section.findAll('.tier-card')
  await cards[n].trigger('click')
  await flushPromises()
}

/** 填客户 QQ 并点提交 */
async function fillQqAndSubmit(wrapper, qq = '123456789') {
  const qqInput = wrapper.find('input[placeholder="manualOrder.clientQqPlaceholder"]')
  await qqInput.setValue(qq)
  await wrapper.find('.mo-submit-btn').trigger('click')
  await flushPromises()
}

describe('ManualOrder 画风模式（v0.38 D路）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('多画风：画风→尺寸→增项 三级选择，提交透传 styleSizeId/styleAddons', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    // 1. 画风模式激活：画风卡片渲染（2 张），旧档位区不渲染
    expect(wrapper.findAll('.mo-field .tier-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('manualOrder.styleTitle')
    expect(wrapper.text()).not.toContain('manualOrder.tier')

    // 2. 选画风 → 尺寸卡片渲染（2 张），显示天数
    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    expect(wrapper.text()).toContain('manualOrder.sizeTitle')
    expect(wrapper.text()).toContain('manualOrder.sizeDays:{"n":3}')

    // 3. 选尺寸 → 画风增项出现（3 个），300ms 防抖后 calculateStylePrice 触发
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    expect(wrapper.findAll('.style-addon-item')).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(300)
    expect(h.styleCalcCalls).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('manualOrder.totalPrice')

    // 4. 勾选 switch 增项 → 重算（防抖）
    const switchComp = wrapper.findAllComponents(ElSwitch).at(0)
    await switchComp.vm.$emit('change', true)
    await vi.advanceTimersByTimeAsync(300)

    // 5. 填 QQ 提交 → 透传断言
    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.created.tierId).toBeNull()
    expect(h.created.styleSizeId).toBe(111)
    expect(h.created.styleAddons).toEqual([{ styleAddonId: 1112 }])
    expect(h.created.addons).toEqual([])
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
    expect(h.created.tierId).toBeNull()
    expect(h.created.styleSizeId).toBe(121)
    expect(h.created.styleAddons).toEqual([])
    expect(h.created.addons).toEqual([])

    wrapper.unmount()
  })

  it('旧档位模式回归：styles 为空时档位卡片 + 旧增项提交不受影响', async () => {
    setupState({ styles: [] })
    const wrapper = mountPage()
    await flushPromises()

    // 档位区渲染，画风区不渲染
    expect(wrapper.text()).toContain('manualOrder.tier')
    expect(wrapper.text()).not.toContain('manualOrder.styleTitle')

    // 选档位 1 → 旧增项出现
    await clickCardInSection(wrapper, 'manualOrder.tier', 0)
    expect(wrapper.text()).toContain('manualOrder.addons')
    expect(wrapper.findAll('.addon-group')).toHaveLength(1)

    // quantity 增项选择 2 个（旧模式 el-input-number 用 v-model → update:modelValue）
    const qtyComp = wrapper.findAllComponents(ElInputNumber).at(0)
    await qtyComp.vm.$emit('update:modelValue', 2)
    await vi.advanceTimersByTimeAsync(300)

    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.created.tierId).toBe(1)
    expect(h.created.addons).toEqual([{ addonId: 101, quantity: 2 }])
    expect(h.created.styleSizeId).toBeUndefined()
    expect(h.created.styleAddons).toBeUndefined()

    wrapper.unmount()
  })

  it('画风模式未选尺寸直接提交 → 拦截提示，不调 createManualOrder', async () => {
    setupState({ styles: MOCK_STYLES })
    const warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => {})
    const wrapper = mountPage()
    await flushPromises()

    await fillQqAndSubmit(wrapper)
    expect(warnSpy).toHaveBeenCalledWith('manualOrder.selectSizeFirst')
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
    const switchComp = wrapper.findAllComponents(ElSwitch).at(0)
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
    expect(h.created.styleSizeId).toBe(121)
    expect(h.created.styleAddons).toEqual([])

    wrapper.unmount()
  })

  it('radio 增项：选选项后提交带 optionLabel', async () => {
    setupState({ styles: MOCK_STYLES })
    const wrapper = mountPage()
    await flushPromises()

    await clickCardInSection(wrapper, 'manualOrder.styleTitle', 0)
    await clickCardInSection(wrapper, 'manualOrder.sizeTitle', 0)
    expect(wrapper.text()).toContain('manualOrder.addonOptionPrice')

    // 画风增项内的 radio 组（页面还有优先级/初始状态两个 radio 组，须按区块定位）
    const radioItem = wrapper.findAll('.style-addon-item').find(i => i.findComponent(ElRadioGroup).exists())
    const radioGroup = radioItem.findComponent(ElRadioGroup)
    await radioGroup.vm.$emit('change', '室内')
    await vi.advanceTimersByTimeAsync(300)

    await fillQqAndSubmit(wrapper)
    expect(h.created).not.toBeNull()
    expect(h.created.styleSizeId).toBe(111)
    expect(h.created.styleAddons).toEqual([{ styleAddonId: 1113, optionLabel: '室内' }])

    wrapper.unmount()
  })
})
