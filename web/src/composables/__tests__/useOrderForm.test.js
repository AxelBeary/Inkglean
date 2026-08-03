// useOrderForm composable 测试
// 覆盖：数据加载、档位选择、计价逻辑、增项初始化、草稿保存/恢复、校验规则、提交流程、参考图上传
// R58 架构：OrderForm.vue 是纯布局壳，全部业务逻辑在此 composable——测它即覆盖下单页关键交互
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), alert: vi.fn() }
}))

vi.mock('../../api/index.js', () => ({
  artistPublicApi: {
    getProfile: vi.fn(),
    getWorkflow: vi.fn(),
    getPricing: vi.fn(),
    calculatePrice: vi.fn(),
    getPublicStyles: vi.fn(),
    calculateStylePrice: vi.fn()
  },
  orderApi: { create: vi.fn() },
  uploadApi: { reference: vi.fn() }
}))

vi.mock('../usePasteUpload.js', async () => {
  const { ref } = await import('vue')
  return {
    usePasteUpload: () => ({ isPasteUploading: ref(false), pasteError: ref('') })
  }
})

// sanitize 已在 sanitize.test.js 中充分测试，此处用透传 mock 隔离
vi.mock('../../utils/sanitize.js', () => ({
  sanitizeHtml: (html) => html || ''
}))

import { useOrderForm } from '../useOrderForm.js'
import { artistPublicApi, orderApi, uploadApi } from '../../api/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'

// ─── 测试数据 ───
const MOCK_PROFILE = {
  name: 'Alice',
  subdomain: 'alice',
  tiers: [
    { id: 1, name: '头像', price: 100, work_days: 3 },
    { id: 2, name: '半身像', price: 300, work_days: 7 }
  ],
  rules: '<p>约稿须知</p>',
  notifyEnabled: true
}

const MOCK_PRICING = {
  tiers: [
    {
      id: 1,
      addons: [
        { id: 101, name: '表情差分A', category: 'expression', select_mode: 'quantity', price_type: 'fixed', price_value: 20, max_qty: 5 },
        { id: 102, name: '换装', category: 'outfit', select_mode: 'toggle', price_type: 'fixed', price_value: 50 },
        { id: 103, name: '特殊背景', category: 'background', select_mode: 'inquiry', price_type: 'fixed', price_value: 0 }
      ]
    },
    { id: 2, addons: [] }
  ],
  multipliers: [
    { id: 201, name: '商用', type: 'usage', multiplier: 2 },
    { id: 202, name: '加急', type: 'rush', multiplier: 1.5 }
  ],
  installments: []
}

const MOCK_CALC_RESULT = {
  totalPrice: 170,
  totalPriceCents: 17000,
  breakdown: [
    { name: '基础价', amount: 100 },
    { name: '表情差分A ×2', amount: 40 },
    { name: '换装', amount: 50 }
  ],
  installments: []
}

// ─── 画风 mock 数据（v0.32 REQ-023 公开结构：snake_case，与后端 getPublicStyles 一致） ───
const ADDON_1111 = { id: 1111, addon_template_id: 91, name: '表情差分', control_type: 'quantity', pricing_mode: 'fixed', price: 15, options: null, unit_label: '个', is_enabled: true }
const ADDON_1112 = { id: 1112, addon_template_id: 92, name: '换装', control_type: 'switch', pricing_mode: 'fixed', price: 40, options: null, unit_label: null, is_enabled: true }
const ADDON_1113 = { id: 1113, addon_template_id: 93, name: '复杂背景', control_type: 'radio', pricing_mode: 'fixed', price: 0, options: '[{"label":"室内","price":30},{"label":"室外","price":60}]', unit_label: null, is_enabled: true }

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: '厚涂风格', cover_image: null, sort_order: 1,
    sizes: [
      { id: 111, name: '头像', base_price: 80, sort_order: 1, addons: [ADDON_1111, ADDON_1112] },
      // 全身尺寸下 1112（换装）被尺寸级隐藏 → 不在 addons 里
      { id: 112, name: '全身', base_price: 200, sort_order: 2, addons: [ADDON_1111, ADDON_1113] }
    ]
  },
  {
    id: 12, name: '线稿', description: null, cover_image: null, sort_order: 2,
    sizes: [
      { id: 121, name: '头像', base_price: 50, sort_order: 1, addons: [] }
    ]
  }
]

const MOCK_STYLE_CALC_RESULT = {
  styleName: '厚涂', sizeName: '头像', basePrice: 80,
  addonItems: [{ name: '表情差分', quantity: 2, unitPrice: 15, amount: 30, source: 'template_default' }],
  subtotal: 110, usageMultiplier: null, rushMultiplier: null,
  multiplierTotal: 110, discount: null, totalPrice: 110, totalPriceCents: 11000
}

// ─── 工具函数 ───
function setupMocks({ profile = MOCK_PROFILE, pricing = MOCK_PRICING, workflow = { stages: [] }, styles = [] } = {}) {
  artistPublicApi.getProfile.mockResolvedValue(profile)
  artistPublicApi.getWorkflow.mockResolvedValue(workflow)
  artistPublicApi.getPricing.mockResolvedValue(pricing)
  artistPublicApi.calculatePrice.mockResolvedValue(MOCK_CALC_RESULT)
  // 画风接口默认空数组 → isStyleMode=false，旧测试路径不受影响（v0.33）
  artistPublicApi.getPublicStyles.mockResolvedValue(styles)
  artistPublicApi.calculateStylePrice.mockResolvedValue(MOCK_STYLE_CALC_RESULT)
  orderApi.create.mockResolvedValue({ orderNo: 'ALICE-001' })
  uploadApi.reference.mockResolvedValue({ filePath: 'references/test.png', url: '/uploads/references/test.png' })
  ElMessageBox.confirm.mockResolvedValue('confirm')
}

/**
 * 创建 useOrderForm 实例并等待 onMounted 完成
 * @param {object} opts - 配置项
 * @param {object} opts.profile - 画师资料 mock 数据
 * @param {object} opts.pricing - 计价数据 mock 数据
 * @param {Array} opts.styles - 画风列表（空数组 = 旧模型；非空 = 画风模式）
 * @param {object} opts.draft - 预置 sessionStorage 草稿
 * @param {boolean} opts.confirmRejects - 草稿恢复弹窗点"丢弃"
 * @param {object} opts.query - v0.34 任务B：URL query 预选参数（styleId/sizeId）
 */
async function createForm(opts = {}) {
  setupMocks(opts)
  if (opts.confirmRejects) ElMessageBox.confirm.mockRejectedValueOnce('cancel')
  if (opts.draft) sessionStorage.setItem('orderForm_draft_alice', JSON.stringify(opts.draft))

  const formRef = ref({
    validate: vi.fn().mockResolvedValue(true),
    scrollToField: vi.fn()
  })
  let composable
  const wrapper = mount({
    setup() {
      composable = useOrderForm('alice', formRef, opts.query || {})
      return { of: composable }
    },
    template: '<div />'
  })
  await flushPromises()
  return { wrapper, formRef, of: composable }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── 数据加载 ───

describe('数据加载', () => {
  it('加载成功：artist/tiers/rulesContent 正确设置，loading 变 false', async () => {
    const { of } = await createForm()
    expect(of.loading.value).toBe(false)
    expect(of.artist.value.name).toBe('Alice')
    expect(of.tiers.value).toHaveLength(2)
    expect(of.tiers.value[0].name).toBe('头像')
    expect(of.rulesContent.value).toBe('<p>约稿须知</p>')
  })

  it('加载失败：loading 变 false，弹出错误提示', async () => {
    artistPublicApi.getProfile.mockRejectedValue(new Error('网络错误'))
    const formRef = ref({ validate: vi.fn(), scrollToField: vi.fn() })
    let composable
    mount({
      setup() {
        composable = useOrderForm('alice', formRef)
        return { of: composable }
      },
      template: '<div />'
    })
    await flushPromises()
    expect(composable.loading.value).toBe(false)
    expect(composable.artist.value).toBeNull()
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('workflow 和 pricing 异步加载不阻塞主流程', async () => {
    const { of } = await createForm({ workflow: { stages: [{ id: 1, name: '草稿' }] } })
    // workflow 是 fire-and-forget，需额外 flush
    await flushPromises()
    expect(of.workflowStages.value).toHaveLength(1)
    expect(of.pricingData.value).toEqual(MOCK_PRICING)
  })
})

// ─── 档位与计价展示 ───

describe('档位与计价展示', () => {
  it('selectedTier：未选档位 → null', async () => {
    const { of } = await createForm()
    expect(of.selectedTier.value).toBeNull()
  })

  it('selectedTier：选中后返回对应档位对象', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    expect(of.selectedTier.value).toEqual(MOCK_PROFILE.tiers[0])
  })

  it('onTierChange：清空增项/倍率/价格/展开状态', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    await nextTick()
    // 制造一些状态
    of.addonSelections[101] = 2
    of.addonToggles[102] = true
    of.form.usageMultiplierId = 201
    of.form.rushMultiplierId = 202
    of.pricePreview.value = MOCK_CALC_RESULT
    of.pricingExpanded.value = true

    of.onTierChange()

    expect(Object.keys(of.addonSelections)).toHaveLength(0)
    expect(Object.keys(of.addonToggles)).toHaveLength(0)
    expect(of.form.usageMultiplierId).toBeNull()
    expect(of.form.rushMultiplierId).toBeNull()
    expect(of.pricePreview.value).toBeNull()
    expect(of.pricingExpanded.value).toBe(false)
  })

  it('formatAddonPrice：inquiry → 面议', async () => {
    const { of } = await createForm()
    expect(of.formatAddonPrice({ select_mode: 'inquiry' })).toBe('面议')
  })

  it('formatAddonPrice：percent → +N%', async () => {
    const { of } = await createForm()
    expect(of.formatAddonPrice({ select_mode: 'toggle', price_type: 'percent', price_value: 0.3 })).toBe('+30%')
  })

  it('formatAddonPrice：fixed → ¥N/个', async () => {
    const { of } = await createForm()
    expect(of.formatAddonPrice({ select_mode: 'quantity', price_type: 'fixed', price_value: 20 })).toBe('¥20/个')
  })

  it('availableAddons：无档位 → 空数组', async () => {
    const { of } = await createForm()
    expect(of.availableAddons.value).toEqual([])
  })

  it('availableAddons：选中档位 1 → 返回 3 个增项', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    expect(of.availableAddons.value).toHaveLength(3)
    expect(of.availableAddons.value[0].name).toBe('表情差分A')
  })

  it('availableAddons：选中档位 2（无增项）→ 空数组', async () => {
    const { of } = await createForm()
    of.form.tierId = 2
    expect(of.availableAddons.value).toEqual([])
  })

  it('addonGroups：按 category 分组，含元信息', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    const groups = of.addonGroups.value
    expect(groups).toHaveLength(3) // expression, outfit, background
    const expr = groups.find(g => g.category === 'expression')
    expect(expr.label).toBe('表情差分') // v0.34 任务F：emoji 图标已移除，只剩文字标签
    expect(expr.items).toHaveLength(1)
    expect(expr.collapsed).toBe(false)
  })

  it('hasPricingExtras：无增项无倍率 → false', async () => {
    const { of } = await createForm({ pricing: { tiers: [], multipliers: [] } })
    of.form.tierId = 1
    expect(of.hasPricingExtras.value).toBe(false)
  })

  it('hasPricingExtras：有增项 → true', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    expect(of.hasPricingExtras.value).toBe(true)
  })

  it('usageMultipliers / rushMultipliers：按 type 过滤', async () => {
    const { of } = await createForm()
    expect(of.usageMultipliers.value).toHaveLength(1)
    expect(of.usageMultipliers.value[0].name).toBe('商用')
    expect(of.rushMultipliers.value).toHaveLength(1)
    expect(of.rushMultipliers.value[0].name).toBe('加急')
  })
})

// ─── 增项默认值初始化 ───

describe('增项默认值初始化', () => {
  it('quantity → 0，toggle/inquiry → false（防 el-input-number undefined 崩溃）', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    await nextTick() // 触发 availableAddons watcher

    expect(of.addonSelections[101]).toBe(0)   // quantity
    expect(of.addonToggles[102]).toBe(false)   // toggle
    expect(of.addonToggles[103]).toBe(false)   // inquiry
  })
})

// ─── 价格计算 ───

describe('价格计算', () => {
  it('无档位时 pricePreview 为 null', async () => {
    const { of } = await createForm()
    expect(of.pricePreview.value).toBeNull()
  })

  it('选档位后防抖调用 calculatePrice，结果写入 pricePreview', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()

    of.form.tierId = 1
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    expect(artistPublicApi.calculatePrice).toHaveBeenCalledWith(expect.objectContaining({
      subdomain: 'alice',
      tierId: 1
    }))
    expect(of.pricePreview.value).toEqual(MOCK_CALC_RESULT)
  })

  it('calculatePrice 失败 → pricePreview 回退 null', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()
    // 在 createForm 之后覆盖 mock（setupMocks 会设置默认 resolve）
    artistPublicApi.calculatePrice.mockRejectedValue(new Error('计价失败'))

    of.form.tierId = 1
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    expect(of.pricePreview.value).toBeNull()
  })

  it('buildSelectedAddons：quantity>0 和 toggle=true 被包含，inquiry=false 不包含', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()

    of.form.tierId = 1
    await nextTick()
    of.addonSelections[101] = 2  // quantity > 0 → 包含
    of.addonToggles[102] = true  // toggle on → 包含
    // 103 (inquiry) 默认 false → 不包含
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    expect(artistPublicApi.calculatePrice).toHaveBeenCalledWith(expect.objectContaining({
      addons: [
        { addonId: 101, quantity: 2 },
        { addonId: 102, quantity: 1 }
      ]
    }))
  })

  it('inquiry 增项勾选后也被包含', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()

    of.form.tierId = 1
    await nextTick()
    of.addonToggles[103] = true // inquiry 勾选
    await nextTick()
    await vi.advanceTimersByTimeAsync(300)

    const callArgs = artistPublicApi.calculatePrice.mock.calls.at(-1)[0]
    expect(callArgs.addons).toContainEqual({ addonId: 103, quantity: 1 })
  })
})

// ─── 草稿保存 / 恢复（R57 表单防丢失） ───

describe('草稿保存 / 恢复', () => {
  it('表单有内容 → 防抖后写入 sessionStorage', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()

    of.form.tierId = 1
    of.form.description = '想要一个酷酷的头像'
    of.form.clientQq = '123456'
    await nextTick()
    vi.advanceTimersByTime(500)

    const raw = sessionStorage.getItem('orderForm_draft_alice')
    expect(raw).toBeTruthy()
    const draft = JSON.parse(raw)
    expect(draft.form.tierId).toBe(1)
    expect(draft.form.description).toBe('想要一个酷酷的头像')
    expect(draft.form.clientQq).toBe('123456')
  })

  it('表单为空 → 清除已有草稿', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()

    // 先填表单 → 写入草稿
    of.form.tierId = 1
    of.form.clientQq = '123'
    await nextTick()
    vi.advanceTimersByTime(500)
    expect(sessionStorage.getItem('orderForm_draft_alice')).toBeTruthy()

    // 再清空表单 → 草稿应被删除
    of.form.tierId = null
    of.form.clientQq = ''
    await nextTick()
    vi.advanceTimersByTime(500)

    expect(sessionStorage.getItem('orderForm_draft_alice')).toBeNull()
  })

  it('恢复草稿：有效档位 + 增项选择被还原', async () => {
    const draft = {
      form: { tierId: 1, description: '恢复测试', clientQq: '999', clientName: '张三', notifyEnabled: false, usageMultiplierId: 201, rushMultiplierId: null },
      addonSelections: { 101: 3 },
      addonToggles: { 102: true }
    }
    const { of } = await createForm({ draft })

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(of.form.tierId).toBe(1)
    expect(of.form.description).toBe('恢复测试')
    expect(of.form.clientQq).toBe('999')
    expect(of.form.clientName).toBe('张三')
    expect(of.form.notifyEnabled).toBe(false)
    expect(of.form.usageMultiplierId).toBe(201)
    expect(of.addonSelections[101]).toBe(3)
    expect(of.addonToggles[102]).toBe(true)
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('恢复草稿：档位已被画师删除 → tierId 和倍率置空，其余字段保留', async () => {
    const draft = {
      form: { tierId: 999, description: '档位没了', clientQq: '888', clientName: '', notifyEnabled: true, usageMultiplierId: 201, rushMultiplierId: 202 },
      addonSelections: { 101: 2 },
      addonToggles: {}
    }
    const { of } = await createForm({ draft })

    expect(of.form.tierId).toBeNull()
    expect(of.form.usageMultiplierId).toBeNull()
    expect(of.form.rushMultiplierId).toBeNull()
    expect(of.form.description).toBe('档位没了') // 非档位字段仍恢复
    expect(of.form.clientQq).toBe('888')
  })

  it('用户点"丢弃" → 草稿被清除，表单保持空', async () => {
    const draft = { form: { tierId: 1, description: '不要了' } }
    const { of } = await createForm({ draft, confirmRejects: true })

    expect(of.form.tierId).toBeNull()
    expect(of.form.description).toBe('')
    expect(sessionStorage.getItem('orderForm_draft_alice')).toBeNull()
  })

  it('损坏的草稿 JSON → 静默丢弃不崩溃', async () => {
    sessionStorage.setItem('orderForm_draft_alice', '{broken json!!!')
    const { of } = await createForm()

    expect(of.form.tierId).toBeNull()
    expect(of.loading.value).toBe(false)
  })
})

// ─── 草稿画风状态保存 / 恢复（v0.33，三步走防丢失） ───

describe('草稿画风状态保存 / 恢复', () => {
  /** 多画风表单（styles = MOCK_STYLES，isStyleMode + isMultiStyle） */
  const createStyleForm = (opts = {}) => createForm({ styles: MOCK_STYLES, ...opts })

  it('hasDraftContent：多画风下选了画风 → true（其余字段全空也算）', async () => {
    const { of } = await createStyleForm()
    expect(of.hasDraftContent.value).toBe(false)
    of.selectStyle(11)
    expect(of.hasDraftContent.value).toBe(true)
  })

  it('hasDraftContent：单画风自动选中 → false（刚进页面不拦截离开）', async () => {
    const { of } = await createForm({ styles: [MOCK_STYLES[0]] })
    expect(of.selectedStyleId.value).toBe(11) // 自动选中已发生
    expect(of.hasDraftContent.value).toBe(false)
  })

  it('watch：只选画风+尺寸（不填任何文字）→ 也写入草稿', async () => {
    vi.useFakeTimers()
    const { of } = await createStyleForm()

    of.selectStyle(11)
    of.selectSize(111)
    await nextTick()
    vi.advanceTimersByTime(500)

    const raw = sessionStorage.getItem('orderForm_draft_alice')
    expect(raw).toBeTruthy()
    const draft = JSON.parse(raw)
    expect(draft.styleState.styleId).toBe(11)
    expect(draft.styleState.sizeId).toBe(111)
  })

  it('saveDraft：styleState 完整保存（styleId/sizeId/增项勾选）', async () => {
    vi.useFakeTimers()
    const { of } = await createStyleForm()

    of.selectStyle(11)
    of.selectSize(111)
    of.styleAddonSelections[1111].quantity = 2
    of.styleAddonSelections[1112].toggled = true
    of.form.usageMultiplierId = 201
    await nextTick()
    vi.advanceTimersByTime(500)

    const draft = JSON.parse(sessionStorage.getItem('orderForm_draft_alice'))
    expect(draft.styleState.styleId).toBe(11)
    expect(draft.styleState.sizeId).toBe(111)
    expect(draft.styleState.addonSelections[1111].quantity).toBe(2)
    expect(draft.styleState.addonSelections[1112].toggled).toBe(true)
  })

  it('restoreDraft：画风+尺寸+增项勾选+倍率+文本全部恢复，旧模型字段不交叉污染，价格重算', async () => {
    vi.useFakeTimers()
    const draft = {
      form: { tierId: 1, description: '画风草稿', clientQq: '777', clientName: '李四', notifyEnabled: true, usageMultiplierId: 201, rushMultiplierId: 202 },
      addonSelections: { 101: 3 },
      addonToggles: { 102: true },
      styleState: {
        styleId: 11,
        sizeId: 111,
        addonSelections: {
          1111: { toggled: false, quantity: 2, optionLabel: null },
          1112: { toggled: true, quantity: 0, optionLabel: null }
        }
      }
    }
    const { of } = await createStyleForm({ draft })

    // 三步走状态恢复
    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(111)
    expect(of.styleAddonSelections[1111].quantity).toBe(2)
    expect(of.styleAddonSelections[1112].toggled).toBe(true)
    // 倍率恢复（共用字段，画风模式增项步骤可选）
    expect(of.form.usageMultiplierId).toBe(201)
    expect(of.form.rushMultiplierId).toBe(202)
    // 文本字段恢复
    expect(of.form.description).toBe('画风草稿')
    expect(of.form.clientQq).toBe('777')
    // 模式互斥：tierId 置空、旧增项不恢复
    expect(of.form.tierId).toBeNull()
    expect(Object.keys(of.addonSelections)).toHaveLength(0)
    expect(Object.keys(of.addonToggles)).toHaveLength(0)
    // 恢复后触发一次价格重算（防抖 300ms）
    await vi.advanceTimersByTimeAsync(300)
    expect(artistPublicApi.calculateStylePrice).toHaveBeenCalledWith(expect.objectContaining({
      subdomain: 'alice',
      styleSizeId: 111
    }))
    expect(of.stylePricePreview.value).toEqual(MOCK_STYLE_CALC_RESULT)
  })

  it('restoreDraft：增项键不在当前尺寸可用列表 → 丢弃，其余可用增项补默认值', async () => {
    const draft = {
      form: {},
      styleState: {
        styleId: 11,
        sizeId: 112, // 全身：addons = [1111, 1113]，1112（换装）在此尺寸被隐藏
        addonSelections: {
          1111: { toggled: false, quantity: 1, optionLabel: null },
          1112: { toggled: true, quantity: 0, optionLabel: null } // 当前尺寸不可用 → 丢弃
        }
      }
    }
    const { of } = await createStyleForm({ draft })

    expect(of.selectedSizeId.value).toBe(112)
    expect(of.styleAddonSelections[1111].quantity).toBe(1) // 有效键保留
    expect(of.styleAddonSelections[1112]).toBeUndefined()  // 无效键丢弃
    expect(of.styleAddonSelections[1113]).toEqual({ toggled: false, quantity: 0, optionLabel: null }) // 补默认值
  })

  it('restoreDraft：画风已被画师删除 → styleState 整体丢弃，文本字段仍恢复', async () => {
    const draft = {
      form: { description: '画风没了', clientQq: '666' },
      styleState: { styleId: 999, sizeId: 111, addonSelections: { 1111: { quantity: 2 } } }
    }
    const { of } = await createStyleForm({ draft })

    expect(of.selectedStyleId.value).toBeNull()
    expect(of.selectedSizeId.value).toBeNull()
    expect(Object.keys(of.styleAddonSelections)).toHaveLength(0)
    expect(of.form.description).toBe('画风没了')
    expect(of.form.clientQq).toBe('666')
  })

  it('restoreDraft：尺寸已被画师删除 → styleId 恢复但 sizeId/增项丢弃', async () => {
    const draft = {
      form: {},
      styleState: { styleId: 11, sizeId: 999, addonSelections: { 1111: { quantity: 2 } } }
    }
    const { of } = await createStyleForm({ draft })

    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBeNull()
    expect(Object.keys(of.styleAddonSelections)).toHaveLength(0)
  })

  it('模式互斥：草稿只有 tierId 无 styleState → 画风模式下 tierId 丢弃，文本字段保留', async () => {
    const draft = {
      form: { tierId: 1, description: '旧模型草稿', clientQq: '555', usageMultiplierId: 201 },
      addonSelections: { 101: 3 }
    }
    const { of } = await createStyleForm({ draft })

    expect(of.form.tierId).toBeNull()
    expect(of.addonSelections[101]).toBeUndefined()
    expect(of.form.usageMultiplierId).toBeNull()
    expect(of.selectedStyleId.value).toBeNull()
    expect(of.selectedSizeId.value).toBeNull()
    expect(of.form.description).toBe('旧模型草稿')
    expect(of.form.clientQq).toBe('555')
  })

  it('模式互斥：草稿含 styleState 但当前是旧模型 → tierId 恢复，styleState 忽略', async () => {
    const draft = {
      form: { tierId: 1, description: '混合草稿', clientQq: '444' },
      addonSelections: { 101: 2 },
      styleState: { styleId: 11, sizeId: 111, addonSelections: { 1111: { quantity: 3 } } }
    }
    const { of } = await createForm({ draft }) // styles=[] → 旧模型

    expect(of.form.tierId).toBe(1)
    expect(of.addonSelections[101]).toBe(2)
    expect(of.selectedStyleId.value).toBeNull()
    expect(of.selectedSizeId.value).toBeNull()
    expect(Object.keys(of.styleAddonSelections)).toHaveLength(0)
  })

  it('单画风退化：草稿 styleId 与自动选中相同 → 幂等（尺寸/增项正常恢复，不报错）', async () => {
    const draft = {
      form: {},
      styleState: {
        styleId: 11, // 与单画风自动选中值相同
        sizeId: 111,
        addonSelections: { 1112: { toggled: true, quantity: 0, optionLabel: null } }
      }
    }
    const { of } = await createForm({ styles: [MOCK_STYLES[0]], draft })

    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(111)
    expect(of.styleAddonSelections[1112].toggled).toBe(true)
  })

  it('完整往返：画风模式填写 → 保存草稿 → 新实例恢复后三步选择全部回来', async () => {
    vi.useFakeTimers()
    // 第一实例：模拟用户填写（选画风→选尺寸→填文字）
    const first = await createStyleForm()
    first.of.selectStyle(12)
    first.of.selectSize(121)
    first.of.form.description = '想要线稿头像'
    first.of.form.clientQq = '123'
    await nextTick()
    vi.advanceTimersByTime(500)
    const raw = sessionStorage.getItem('orderForm_draft_alice')
    expect(raw).toBeTruthy()
    first.wrapper.unmount()

    // 第二实例：模拟刷新后重新加载（弹窗确认恢复）
    const second = await createStyleForm({ draft: JSON.parse(raw) })
    expect(second.of.selectedStyleId.value).toBe(12)
    expect(second.of.selectedSizeId.value).toBe(121)
    expect(second.of.form.description).toBe('想要线稿头像')
    expect(second.of.form.clientQq).toBe('123')
  })
})

// ─── URL query 预选（v0.34 任务B：主页展示柜带选择跳转下单） ───

describe('URL query 预选', () => {
  it('多画风：styleId+sizeId 有效 → 直接选中画风和尺寸，触发计价', async () => {
    vi.useFakeTimers()
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '11', sizeId: '111' } })

    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(111)
    expect(of.queryPreselect.styleId).toBe(11)
    expect(of.queryPreselect.sizeId).toBe(111)
    await vi.advanceTimersByTimeAsync(300)
    expect(artistPublicApi.calculateStylePrice).toHaveBeenCalledWith(expect.objectContaining({
      styleSizeId: 111
    }))
  })

  it('仅 styleId 有效 → 画风选中、尺寸不选', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '12' } })
    expect(of.selectedStyleId.value).toBe(12)
    expect(of.selectedSizeId.value).toBeNull()
    expect(of.queryPreselect.sizeId).toBeNull()
  })

  it('styleId 无效（已停用/不存在）→ 静默忽略，走正常流程', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '999', sizeId: '111' } })
    expect(of.selectedStyleId.value).toBeNull()
    expect(of.selectedSizeId.value).toBeNull()
  })

  it('sizeId 不属于 query 选中的画风 → 忽略尺寸预选', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '12', sizeId: '111' } })
    expect(of.selectedStyleId.value).toBe(12) // 线稿画风
    expect(of.selectedSizeId.value).toBeNull() // 111 属于厚涂画风 → 忽略
  })

  it('单画风退化：sizeId 有效 → 预选尺寸（styleId 缺省用自动选中项）', async () => {
    const { of } = await createForm({ styles: [MOCK_STYLES[0]], query: { sizeId: '112' } })
    expect(of.selectedStyleId.value).toBe(11) // 单画风自动选中
    expect(of.selectedSizeId.value).toBe(112)
    expect(of.queryPreselect.sizeId).toBe(112)
  })

  it('query 预选 > 草稿恢复：两者并存时 query 命中项不被草稿覆盖', async () => {
    vi.useFakeTimers()
    const draft = {
      form: {},
      styleState: { styleId: 12, sizeId: 121, addonSelections: {} }
    }
    const { of } = await createForm({ styles: MOCK_STYLES, draft, query: { styleId: '11', sizeId: '111' } })

    // query 预选生效，草稿的画风/尺寸不覆盖
    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(111)
  })

  it('query 只有 styleId + 草稿有同画风不同尺寸 → 草稿尺寸正常恢复', async () => {
    const draft = {
      form: {},
      styleState: { styleId: 11, sizeId: 112, addonSelections: {} }
    }
    const { of } = await createForm({ styles: MOCK_STYLES, draft, query: { styleId: '11' } })

    // 画风：query 命中（与草稿相同）；尺寸：query 无 → 草稿恢复 112
    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(112)
  })

  // ─── v0.35 F4: 预选可见横幅（入口 A 展示柜带选择进来） ───

  it('F4：画风+尺寸齐预选 → 横幅显示已预选两者（可见可改）', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '11', sizeId: '111' } })
    expect(of.preselectBannerText.value).toBe('orderForm.preselectedBoth')
  })

  it('F4：多画风仅预选画风 → 横幅提示选尺寸', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '12' } })
    expect(of.preselectBannerText.value).toBe('orderForm.preselectedStyle')
  })

  it('F4：单画风 + 仅尺寸预选（query 无 styleId）→ 不触发横幅', async () => {
    const { of } = await createForm({ styles: [MOCK_STYLES[0]], query: { sizeId: '112' } })
    // 单画风 styleId 缺省但自动选中；queryPreselect.styleId 仅在 query 带 styleId 且命中时记录，
    // 此处 query 无 styleId → queryPreselect.styleId 为 null → 不触发横幅（价格摘要卡已显示尺寸）
    expect(of.preselectBannerText.value).toBe('')
  })

  it('F4：用户改选尺寸后 → 横幅自动消失（预选已被手动选择取代）', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES, query: { styleId: '11', sizeId: '111' } })
    expect(of.preselectBannerText.value).toBe('orderForm.preselectedBoth')
    of.selectSize(112) // 回上一步改选尺寸
    expect(of.preselectBannerText.value).toBe('')
  })

  it('F4：入口 B（无 query）→ 无横幅', async () => {
    const { of } = await createForm({ styles: MOCK_STYLES })
    expect(of.preselectBannerText.value).toBe('')
  })

  it('F4：旧模型（无画风）→ 无横幅', async () => {
    const { of } = await createForm({ styles: [], query: { styleId: '11' } })
    expect(of.preselectBannerText.value).toBe('')
  })
})

// ─── 校验规则 ───

describe('校验规则', () => {
  it('agreed 校验：有须知 + 未勾选 → 报错', async () => {
    const { of } = await createForm()
    const validator = of.rules.agreed[0].validator
    const callback = vi.fn()

    validator(null, false, callback)

    expect(callback).toHaveBeenCalledWith(expect.any(Error))
  })

  it('agreed 校验：有须知 + 已勾选 → 通过', async () => {
    const { of } = await createForm()
    const validator = of.rules.agreed[0].validator
    const callback = vi.fn()

    validator(null, true, callback)

    expect(callback).toHaveBeenCalledWith()
  })

  it('agreed 校验：无须知内容 → 不要求勾选', async () => {
    const { of } = await createForm({ profile: { ...MOCK_PROFILE, rules: '' } })
    const validator = of.rules.agreed[0].validator
    const callback = vi.fn()

    validator(null, false, callback)

    expect(callback).toHaveBeenCalledWith()
  })

  it('tierId 和 clientQq 为必填', async () => {
    const { of } = await createForm()
    expect(of.rules.tierId[0].required).toBe(true)
    expect(of.rules.clientQq[0].required).toBe(true)
  })
})

// ─── 提交 ───

describe('提交', () => {
  it('校验失败 → 不调用 API，submitting 保持 false', async () => {
    const { of, formRef } = await createForm()
    formRef.value.validate.mockRejectedValueOnce({ tierId: [{ message: '请选择档位' }] })

    await of.submit()

    expect(orderApi.create).not.toHaveBeenCalled()
    expect(of.submitting.value).toBe(false)
  })

  it('提交成功 → showSuccess + resultNo + 草稿清除', async () => {
    const { of } = await createForm()
    of.form.tierId = 1
    of.form.clientQq = '12345'
    of.form.agreed = true

    await of.submit()

    expect(orderApi.create).toHaveBeenCalledWith(expect.objectContaining({
      subdomain: 'alice',
      tierId: 1,
      clientQq: '12345'
    }))
    expect(of.showSuccess.value).toBe(true)
    expect(of.resultNo.value).toBe('ALICE-001')
    expect(of.submitting.value).toBe(false)
    expect(sessionStorage.getItem('orderForm_draft_alice')).toBeNull()
  })

  it('提交失败 → 弹出错误提示，showSuccess 保持 false', async () => {
    const { of } = await createForm()
    orderApi.create.mockRejectedValueOnce(new Error('服务器错误'))
    of.form.tierId = 1
    of.form.clientQq = '12345'

    await of.submit()

    expect(ElMessage.error).toHaveBeenCalledWith('服务器错误')
    expect(of.showSuccess.value).toBe(false)
    expect(of.submitting.value).toBe(false)
  })
})

// ─── 参考图上传 ───

describe('参考图上传', () => {
  it('文件超过 10MB → 警告且不上传', async () => {
    const { of } = await createForm()
    const file = { name: 'big.png', size: 11 * 1024 * 1024, uid: 'u1' }

    await of.handleRefUpload({ file })

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(uploadApi.reference).not.toHaveBeenCalled()
  })

  it('非图片扩展名 → 提示但仍上传', async () => {
    const { of } = await createForm()
    const file = { name: 'doc.pdf', size: 1024, uid: 'u1' }

    await of.handleRefUpload({ file })

    expect(ElMessage.info).toHaveBeenCalled()
    expect(uploadApi.reference).toHaveBeenCalledWith(file)
  })

  it('上传成功 → 提交时 references 包含路径', async () => {
    const { of } = await createForm()
    const file = { name: 'ref.png', size: 1024, uid: 'u1' }
    await of.handleRefUpload({ file })

    of.form.tierId = 1
    of.form.clientQq = '12345'
    await of.submit()

    expect(orderApi.create).toHaveBeenCalledWith(expect.objectContaining({
      references: ['references/test.png']
    }))
  })

  it('移除参考图 → 提交时 references 为空', async () => {
    const { of } = await createForm()
    const file = { name: 'ref.png', size: 1024, uid: 'u1' }
    await of.handleRefUpload({ file })
    of.handleRefRemove({ uid: 'u1' })

    of.form.tierId = 1
    of.form.clientQq = '12345'
    await of.submit()

    expect(orderApi.create).toHaveBeenCalledWith(expect.objectContaining({
      references: []
    }))
  })

  it('上传失败 → 弹出错误提示', async () => {
    const { of } = await createForm()
    uploadApi.reference.mockRejectedValueOnce(new Error('上传失败'))
    const file = { name: 'ref.png', size: 1024, uid: 'u1' }

    await expect(of.handleRefUpload({ file })).rejects.toThrow('上传失败')
    expect(ElMessage.error).toHaveBeenCalled()
  })
})
