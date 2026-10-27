// useOrderForm composable 测试（SPEC-PRICE-2 v50 统一价格模型）
// 覆盖：数据加载、画风三步走、增项三区选择（普通多选/用途单选/加急单选）、
//       计价调用、草稿保存/恢复、URL 预选、校验规则、提交流程、折扣预估、参考图上传
// R58 架构：OrderForm.vue 是纯布局壳，全部业务逻辑在此 composable——测它即覆盖下单页关键交互
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
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
    getPublicStyles: vi.fn(),
    calculateStylePrice: vi.fn(),
    validateDiscount: vi.fn()
  },
  orderApi: { create: vi.fn() },
  uploadApi: { reference: vi.fn() }
}))

// 粘贴回调捕获：usePasteUpload 内部注册 onFiles，这里抓住它才能从测试驱动粘贴链路
const pasteCapture = vi.hoisted(() => ({ onFiles: null as ((files: File[]) => void | Promise<void>) | null }))

vi.mock('../usePasteUpload.js', async () => {
  const { ref } = await import('vue')
  return {
    usePasteUpload: (opts: { onFiles: (files: File[]) => void | Promise<void> }) => {
      pasteCapture.onFiles = opts.onFiles
      return { isPasteUploading: ref(false), pasteError: ref('') }
    }
  }
})

// sanitize 已在 sanitize.test.js 中充分测试，此处用透传 mock 隔离
vi.mock('../../utils/sanitize.js', () => ({
  sanitizeHtml: (html: string) => html || ''
}))

// G-7: useOrderForm 依赖匿名凭证链路，测试统一走固定 token
vi.mock('../../utils/track.js', () => ({
  getAnonToken: () => Promise.resolve('anon-token-test'),
  getFreshAnonToken: () => Promise.resolve('anon-token-fresh-test')
}))

import { useOrderForm } from '../useOrderForm'
import { artistPublicApi, orderApi, uploadApi } from '../../api/index'
import { MAX_IMAGE_COUNT } from '../../constants/upload'
import { ElMessage, ElMessageBox } from 'element-plus'

// ─── 被 vi.mock 替换的 API 方法（断言为 Mock 以便读取调用记录） ───
const getProfileMock = artistPublicApi.getProfile as unknown as Mock
const getWorkflowMock = artistPublicApi.getWorkflow as unknown as Mock
const getPricingMock = artistPublicApi.getPricing as unknown as Mock
const getPublicStylesMock = artistPublicApi.getPublicStyles as unknown as Mock
const calcPriceMock = artistPublicApi.calculateStylePrice as unknown as Mock
const orderCreateMock = orderApi.create as unknown as Mock
const refUploadMock = uploadApi.reference as unknown as Mock
const confirmMock = ElMessageBox.confirm as unknown as Mock

// ─── 测试数据（SPEC-PRICE-2 公开结构：category 真实维度） ───
const MOCK_PROFILE = {
  name: 'Alice',
  subdomain: 'alice',
  rules: '<p>约稿须知</p>',
  notifyEnabled: true
}

const MOCK_PRICING = {
  styles: [],
  installments: [
    { label: '定金', basisPoints: 3000 },
    { label: '尾款', basisPoints: 7000 }
  ],
  discountEnabled: true
}

// 增项 fixture（后端 getPublicStyles 返回结构：含 category/price_mode）
const ADDON_BG = { id: 1111, addon_template_id: 91, name: '背景', control_type: 'switch', price_mode: 'fixed', price: 30, unit_label: null, category: 'add', max_quantity: null, is_enabled: true }
const ADDON_PERSON = { id: 1112, addon_template_id: 92, name: '加人', control_type: 'quantity', price_mode: 'fixed', price: 15, unit_label: '位', category: 'add', max_quantity: 5, is_enabled: true }
const ADDON_DETAIL = { id: 1113, addon_template_id: 93, name: '精细刻画', control_type: 'switch', price_mode: 'percent', price: 20, unit_label: null, category: 'add', max_quantity: null, is_enabled: true }
const ADDON_COMM = { id: 1114, addon_template_id: 94, name: '商用', control_type: 'switch', price_mode: 'percent', price: 50, unit_label: null, category: 'usage', max_quantity: null, is_enabled: true }
const ADDON_BUYOUT = { id: 1115, addon_template_id: 95, name: '买断', control_type: 'switch', price_mode: 'percent', price: 100, unit_label: null, category: 'usage', max_quantity: null, is_enabled: true }
const ADDON_RUSH = { id: 1116, addon_template_id: 96, name: '加急', control_type: 'switch', price_mode: 'percent', price: 100, unit_label: null, category: 'rush', max_quantity: null, is_enabled: true }
const ADDON_SRUSH = { id: 1117, addon_template_id: 97, name: '超级加急', control_type: 'switch', price_mode: 'percent', price: 200, unit_label: null, category: 'rush', max_quantity: null, is_enabled: true }

const HEAD_ADDONS = [ADDON_BG, ADDON_PERSON, ADDON_DETAIL, ADDON_COMM, ADDON_BUYOUT, ADDON_RUSH, ADDON_SRUSH]

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: '厚涂风格', cover_image: null, sort_order: 1,
    sizes: [
      { id: 111, name: '头像', base_price: 80, sort_order: 1, display_status: 'available', addons: HEAD_ADDONS },
      { id: 112, name: '全身', base_price: 200, sort_order: 2, display_status: 'available', addons: [ADDON_BG] },
      { id: 113, name: '展示尺寸', base_price: 300, sort_order: 3, display_status: 'showcase', addons: [] }
    ]
  },
  {
    id: 12, name: '线稿', description: null, cover_image: null, sort_order: 2,
    sizes: [
      { id: 121, name: '头像', base_price: 50, sort_order: 1, display_status: 'available', addons: [] }
    ]
  }
]

// calculate-style-price 响应（SPEC-PRICE-2 整数分口径）
// 场景：基础 80 + 背景 30 + 加人×2 30 + 精细刻画 20%×80=16 = 156；商用 +50% → 234；加急 +100% → 468
const MOCK_STYLE_CALC_RESULT = {
  styleName: '厚涂', sizeName: '头像', baseCents: 8000,
  fixedAddonItems: [
    { name: '背景', quantity: 1, unitCents: 3000, amountCents: 3000 },
    { name: '加人', quantity: 2, unitCents: 1500, amountCents: 3000 }
  ],
  percentAddonItems: [{ name: '精细刻画', percent: 20, amountCents: 1600 }],
  subtotalCents: 15600,
  usage: { name: '商用', percent: 50, incrementCents: 7800 },
  rush: { name: '加急', percent: 100, incrementCents: 23400 },
  afterMultipliersCents: 46800,
  discount: null,
  totalCents: 46800
}

// ─── 工具函数 ───
interface SetupMocksOpts {
  profile?: unknown
  pricing?: unknown
  workflow?: unknown
  styles?: unknown[]
}

function setupMocks({ profile = MOCK_PROFILE, pricing = MOCK_PRICING, workflow = { stages: [] }, styles = [] }: SetupMocksOpts = {}) {
  getProfileMock.mockResolvedValue(profile)
  getWorkflowMock.mockResolvedValue(workflow)
  getPricingMock.mockResolvedValue(pricing)
  getPublicStylesMock.mockResolvedValue(styles)
  calcPriceMock.mockResolvedValue(MOCK_STYLE_CALC_RESULT)
  orderCreateMock.mockResolvedValue({ orderNo: 'ALICE-001' })
  // 路径按文件名派生（reference 上传接口的真实形状：filePath + url）
  refUploadMock.mockImplementation((file: File) => Promise.resolve({
    filePath: `references/${file.name}`,
    url: `/uploads/references/${file.name}`
  }))
  confirmMock.mockResolvedValue('confirm')
}

interface CreateFormOpts {
  styles?: unknown[]
  profile?: unknown
  pricing?: unknown
  workflow?: unknown
  draft?: Record<string, unknown>
  confirmRejects?: boolean
  query?: Record<string, string>
}

interface AddonSelection {
  toggled: boolean
  quantity: number
}
type AddonSelections = Record<number, AddonSelection>

/** 执行 clientQq 的格式校验规则，返回错误文案（通过返回 null） */
function runQqFormat(
  rules: ReturnType<typeof useOrderForm>['rules'],
  qq: string
): string | null {
  const rule = rules.clientQq.find(r => 'validator' in r) as
    | { validator: (rule: unknown, value: unknown, cb: (error?: Error) => void) => void }
  let message: string | null = null
  rule.validator(null, qq, (error?: Error) => { message = error ? error.message : null })
  return message
}

interface DraftState {
  styleState: {
    styleId: number
    sizeId: number
    usageId: number
    rushId: number
    addonSelections: Record<number, Partial<AddonSelection>>
  }
}

/**
 * 创建 useOrderForm 实例并等待 onMounted 完成
 * @param {object} opts - 配置项
 * @param {Array} opts.styles - 画风列表（默认双画风 MOCK_STYLES）
 * @param {object} opts.draft - 预置 sessionStorage 草稿
 * @param {boolean} opts.confirmRejects - 草稿恢复弹窗点"丢弃"
 * @param {object} opts.query - URL query 预选参数（styleId/sizeId）
 */
async function createForm(opts: CreateFormOpts = {}) {
  setupMocks({ styles: MOCK_STYLES, ...opts })
  if (opts.confirmRejects) confirmMock.mockRejectedValueOnce('cancel')
  if (opts.draft) sessionStorage.setItem('orderForm_draft_alice', JSON.stringify(opts.draft))

  const formRef = ref({
    validate: vi.fn().mockResolvedValue(true),
    scrollToField: vi.fn()
  })
  let composable!: ReturnType<typeof useOrderForm>
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

/**
 * 等 300ms 防抖计价落地。issue #50-1 之后报价未就绪不得提交，
 * 凡是选了尺寸的提交用例都必须先让报价就位，否则会被 priceBlocking 正当拦下。
 */
async function settlePrice() {
  await new Promise(r => setTimeout(r, 350))
  await flushPromises()
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
  it('加载成功：artist/rulesContent/styles 正确设置，loading 变 false', async () => {
    const { of } = await createForm()
    expect(of.loading.value).toBe(false)
    expect(of.artist.value!.name).toBe('Alice')
    expect(of.rulesContent.value).toBe('<p>约稿须知</p>')
    expect(of.styles.value).toHaveLength(2)
    expect(of.isStyleMode.value).toBe(true)
    expect(of.isMultiStyle.value).toBe(true)
  })

  it('加载失败：loading 变 false，loadError=true，不再 toast（页面层错误态接管，P0 修复）', async () => {
    getProfileMock.mockRejectedValueOnce(new Error('网络错误'))
    setupMocks({ styles: MOCK_STYLES })
    getProfileMock.mockRejectedValue(new Error('网络错误'))
    const formRef = ref({ validate: vi.fn() })
    let composable!: ReturnType<typeof useOrderForm>
    mount({
      setup() {
        composable = useOrderForm('alice', formRef)
        return {}
      },
      template: '<div />'
    })
    await flushPromises()
    expect(composable.loading.value).toBe(false)
    expect(composable.loadError.value).toBe(true)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('retryLoad：失败后重试成功 → loadError 清零，artist 到位', async () => {
    setupMocks({ styles: MOCK_STYLES })
    getProfileMock.mockRejectedValueOnce(new Error('网络错误'))
    const formRef = ref({ validate: vi.fn() })
    let composable!: ReturnType<typeof useOrderForm>
    mount({
      setup() {
        composable = useOrderForm('alice', formRef)
        return {}
      },
      template: '<div />'
    })
    await flushPromises()
    expect(composable.loadError.value).toBe(true)
    // 重试时 getProfile 恢复正常（mockRejectedValueOnce 只生效一次）
    await composable.retryLoad()
    await flushPromises()
    expect(composable.loadError.value).toBe(false)
    expect(composable.loading.value).toBe(false)
    expect(composable.artist.value!.name).toBe('Alice')
  })

  it('无画风配置：isStyleMode=false（页面显示空态）', async () => {
    const { of } = await createForm({ styles: [] })
    expect(of.isStyleMode.value).toBe(false)
  })

  it('单画风：自动选中唯一画风，isMultiStyle=false', async () => {
    const { of } = await createForm({ styles: [MOCK_STYLES[0]] })
    expect(of.isMultiStyle.value).toBe(false)
    expect(of.selectedStyleId.value).toBe(11)
  })

  it('workflow 与 pricing 异步加载不阻塞主流程', async () => {
    getWorkflowMock.mockResolvedValueOnce({ stages: [{ id: 1, name: '定金' }] })
    const { of } = await createForm()
    await flushPromises()
    expect(of.loading.value).toBe(false)
  })
})

// ─── 画风三步走选择 ───

describe('画风/尺寸选择', () => {
  it('selectStyle：切换画风重置尺寸/增项/用途加急/预览', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    ;(of.styleAddonSelections as AddonSelections)[1111] = { toggled: true, quantity: 0 }
    of.toggleUsage(1114)
    of.selectStyle(12)
    expect(of.selectedSizeId.value).toBeNull()
    expect((of.styleAddonSelections as AddonSelections)[1111]).toBeUndefined()
    expect(of.selectedUsageId.value).toBeNull()
    expect(of.stylePricePreview.value).toBeNull()
  })

  it('selectSize：初始化普通增项默认选择结构', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    expect((of.styleAddonSelections as AddonSelections)[1111]).toEqual({ toggled: false, quantity: 0 })
    expect((of.styleAddonSelections as AddonSelections)[1112]).toEqual({ toggled: false, quantity: 0 })
  })

  it('selectSize：展示态（showcase）尺寸不可选并提示', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(113)
    expect(of.selectedSizeId.value).toBeNull()
    expect(ElMessage.info).toHaveBeenCalledWith('orderForm.sizeShowcaseBlocked')
  })

  it('selectSize：切换尺寸重置增项与用途/加急', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.toggleRush(1116)
    of.selectSize(112)
    expect(of.selectedRushId.value).toBeNull()
    expect(Object.keys(of.styleAddonSelections)).toHaveLength(1) // 只剩全身尺寸的 ADDON_BG
  })
})

// ─── 增项三区分类与单选 ───

describe('增项分类与选择', () => {
  it('regularAddons/usageAddons/rushAddons 按真实 category 分类', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    expect(of.regularAddons.value.map((a: { id: number }) => a.id)).toEqual([1111, 1112, 1113])
    expect(of.usageAddons.value.map((a: { id: number }) => a.id)).toEqual([1114, 1115])
    expect(of.rushAddons.value.map((a: { id: number }) => a.id)).toEqual([1116, 1117])
  })

  it('toggleUsage：单选切换，再点取消', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.toggleUsage(1114)
    expect(of.selectedUsageId.value).toBe(1114)
    of.toggleUsage(1115)
    expect(of.selectedUsageId.value).toBe(1115) // 换选
    of.toggleUsage(1115)
    expect(of.selectedUsageId.value).toBeNull() // 再点取消
  })

  it('toggleRush：单选切换', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.toggleRush(1116)
    expect(of.selectedRushId.value).toBe(1116)
    of.toggleRush(1117)
    expect(of.selectedRushId.value).toBe(1117)
  })

  it('buildStyleAddons：普通增项（开关/数量）+ 用途 + 加急', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    ;(of.styleAddonSelections as AddonSelections)[1111].toggled = true
    ;(of.styleAddonSelections as AddonSelections)[1112].quantity = 2
    of.toggleUsage(1114)
    of.toggleRush(1116)
    expect(of.buildStyleAddons()).toEqual([
      { styleAddonId: 1111 },
      { styleAddonId: 1112, quantity: 2 },
      { styleAddonId: 1114 },
      { styleAddonId: 1116 }
    ])
  })

  it('styleAddonPriceText：¥/单价单位/+百分比 三种形态', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    expect(of.styleAddonPriceText(ADDON_BG)).toBe('¥30')
    expect(of.styleAddonPriceText(ADDON_PERSON)).toBe('¥15/位')
    expect(of.styleAddonPriceText(ADDON_DETAIL)).toBe('+20%')
  })
})

// ─── 计价调用 ───

describe('计价', () => {
  it('选尺寸后防抖调 calculate-style-price（新契约：无倍率 ID 参数）', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    await vi.advanceTimersByTimeAsync(800)
    expect(artistPublicApi.calculateStylePrice).toHaveBeenCalled()
    const arg = calcPriceMock.mock.calls.at(-1)![0]
    expect(arg.styleSizeId).toBe(111)
    expect(arg).not.toHaveProperty('usageMultiplierId')
    expect(arg).not.toHaveProperty('rushMultiplierId')
    expect((of.stylePricePreview.value as unknown as { totalCents: number }).totalCents).toBe(46800)
  })

  it('calculate-style-price 失败 → 预览置 null 不抛错', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()
    calcPriceMock.mockRejectedValue(new Error('boom'))
    of.selectStyle(11)
    of.selectSize(111)
    await vi.advanceTimersByTimeAsync(800)
    expect(of.stylePricePreview.value).toBeNull()
  })

  it('styleDisplayCents：无报价一律 null（⛔ 回退基础价）；计价后=总价整数分', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    expect(of.styleDisplayCents.value).toBeNull() // 未选尺寸
    of.selectSize(111)
    // issue #50-2 拍板 A：未计价不再回退基础价（旧行为显示 ¥80，漏掉全部增项）
    expect(of.styleDisplayCents.value).toBeNull()
    expect(of.priceBlocking.value).toBe(true)
    await settlePrice()
    expect(of.styleDisplayCents.value).toBe(46800)
    expect(of.priceBlocking.value).toBe(false)
  })

  it('issue #50-6：折扣码未验证通过时不随算价请求下发（逐字输入不再打断计价）', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.form.discountCode = 'SAVE10'
    await vi.advanceTimersByTimeAsync(800)
    expect(calcPriceMock.mock.calls.at(-1)![0].discountCode).toBeNull()
    vi.useRealTimers()
  })

  it('installmentPreview：定金30%/尾款70% 分摊（尾差归末节点）', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    const inst = of.installmentPreview.value
    expect(inst).toHaveLength(2)
    expect(inst[0].label).toBe('定金')
    expect(inst[0].amountCents + inst[1].amountCents).toBe(46800)
    expect(inst[0].amountCents).toBe(Math.round(46800 * 3000 / 10000))
  })
})

// ─── 折扣预估 ───

describe('折扣预估', () => {
  it('percent 折扣：floor(倍率后总价 × value/100)（与后端口径一致）', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    ;(of.discountResult as { value: unknown }).value = { discountType: 'percent', discountValue: 10 }
    // afterMultipliersCents=46800 → floor(4680)=4680 分
    expect(of.discountPreviewCents.value).toBe(4680)
    expect(of.discountedTotalYuan.value).toBe(421.2)
  })

  it('fixed 折扣：不超过倍率后总价', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    ;(of.discountResult as { value: unknown }).value = { discountType: 'fixed', discountValue: 9999 }
    expect(of.discountPreviewCents.value).toBe(46800) // 封顶
    expect(of.discountedTotalYuan.value).toBe(0)
  })
})

// ─── 草稿保存 / 恢复 ───

describe('草稿保存 / 恢复', () => {
  it('表单无内容 → 不落草稿键', async () => {
    const { of } = await createForm()
    expect(of.hasDraftContent.value).toBe(false)
  })

  it('多画风主动选了画风 → 算有内容', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    expect(of.hasDraftContent.value).toBe(true)
  })

  it('选了用途/加急 → 算有内容', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.toggleUsage(1114)
    expect(of.hasDraftContent.value).toBe(true)
  })

  it('saveDraft：styleState 含 styleId/sizeId/普通增项/用途/加急', async () => {
    vi.useFakeTimers()
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    ;(of.styleAddonSelections as AddonSelections)[1111].toggled = true
    of.toggleUsage(1114)
    of.toggleRush(1116)
    await vi.advanceTimersByTimeAsync(800)
    const draft = JSON.parse(sessionStorage.getItem('orderForm_draft_alice')!) as DraftState
    expect(draft.styleState.styleId).toBe(11)
    expect(draft.styleState.sizeId).toBe(111)
    expect(draft.styleState.usageId).toBe(1114)
    expect(draft.styleState.rushId).toBe(1116)
    expect(draft.styleState.addonSelections[1111]).toMatchObject({ toggled: true })
  })

  // GHSA Wave2 issue #53-2：防抖窗口内离开页面，最后一笔草稿随卸载落盘（旧实现只清定时器 → 丢）
  it('卸载 flush：防抖窗口内的最后一笔仍写进 sessionStorage', async () => {
    vi.useFakeTimers()
    const { of, wrapper } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    // 刻意不推进 500ms 定时器：模拟「刚选完就走」
    wrapper.unmount()

    const draft = JSON.parse(sessionStorage.getItem('orderForm_draft_alice')!) as DraftState
    expect(draft.styleState.sizeId).toBe(111)
  })

  // 同一条 flush 的反面：saveDraft 的既有语义是「无内容即删键」，卸载路径不能拿它去抹掉上一轮存着的草稿
  it('卸载 flush：无内容时不写也不删已存草稿', async () => {
    const { wrapper } = await createForm()
    sessionStorage.setItem('orderForm_draft_alice', JSON.stringify({ form: { clientQq: '999888777' }, styleState: {} }))

    wrapper.unmount()

    expect(sessionStorage.getItem('orderForm_draft_alice')).toContain('999888777')
  })

  it('restoreDraft：画风+尺寸+增项+用途加急+文本全量恢复', async () => {
    const { of } = await createForm({
      draft: {
        form: { clientQq: '12345678', clientName: '小王', description: '要一只猫', notifyEnabled: true },
        styleState: {
          styleId: 11, sizeId: 111,
          addonSelections: { 1111: { toggled: true, quantity: 0 } },
          usageId: 1114, rushId: 1116
        }
      }
    })
    expect(of.form.clientQq).toBe('12345678')
    expect(of.form.description).toBe('要一只猫')
    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(111)
    expect((of.styleAddonSelections as AddonSelections)[1111]).toMatchObject({ toggled: true })
    expect(of.selectedUsageId.value).toBe(1114)
    expect(of.selectedRushId.value).toBe(1116)
  })

  it('restoreDraft：增项已不在当前尺寸可用列表 → 丢弃该勾选项', async () => {
    const { of } = await createForm({
      draft: {
        form: {},
        styleState: { styleId: 11, sizeId: 112, addonSelections: { 1112: { toggled: false, quantity: 3 } }, usageId: 1114, rushId: null }
      }
    })
    // 全身尺寸只有 ADDON_BG（1111）；1112 与 usage 1114 都不可用
    expect((of.styleAddonSelections as AddonSelections)[1112]).toBeUndefined()
    expect(of.selectedUsageId.value).toBeNull()
  })

  it('restoreDraft：旧版草稿（含 tierId/倍率字段）→ 过时字段静默忽略', async () => {
    const { of } = await createForm({
      draft: {
        form: { clientQq: '87654321', tierId: 5, usageMultiplierId: 201, rushMultiplierId: 202 },
        styleState: {}
      }
    })
    expect(of.form.clientQq).toBe('87654321')
    expect(of.form).not.toHaveProperty('tierId')
    expect(of.selectedUsageId.value).toBeNull()
    expect(of.selectedRushId.value).toBeNull()
  })

  it('用户点"丢弃" → 草稿键被清除且不恢复', async () => {
    const { of } = await createForm({
      confirmRejects: true,
      draft: { form: { clientQq: '11112222' }, styleState: {} }
    })
    expect(of.form.clientQq).toBe('')
    expect(sessionStorage.getItem('orderForm_draft_alice')).toBeNull()
  })

  it('损坏的草稿 JSON → 静默丢弃不弹错', async () => {
    sessionStorage.setItem('orderForm_draft_alice', '{broken')
    const { of } = await createForm()
    expect(of.form.clientQq).toBe('')
  })
})

// ─── URL query 预选 ───

describe('URL query 预选', () => {
  it('多画风：styleId+sizeId 有效 → 直接选中画风和尺寸', async () => {
    const { of } = await createForm({ query: { styleId: '11', sizeId: '111' } })
    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBe(111)
    expect(of.queryPreselect.sizeId).toBe(111)
  })

  it('仅 styleId 有效 → 只选画风，尺寸不选', async () => {
    const { of } = await createForm({ query: { styleId: '11' } })
    expect(of.selectedStyleId.value).toBe(11)
    expect(of.selectedSizeId.value).toBeNull()
  })

  it('sizeId 属于展示态 → 不预选', async () => {
    const { of } = await createForm({ query: { styleId: '11', sizeId: '113' } })
    expect(of.selectedSizeId.value).toBeNull()
  })

  it('sizeId 不属于 query 选中的画风 → 忽略尺寸预选', async () => {
    const { of } = await createForm({ query: { styleId: '12', sizeId: '111' } })
    expect(of.selectedSizeId.value).toBeNull()
  })

  it('F4：画风+尺寸都预选 → 横幅显示两者', async () => {
    const { of } = await createForm({ query: { styleId: '11', sizeId: '111' } })
    expect(of.preselectBannerText.value).toBe('orderForm.preselectedBoth')
  })

  it('F4：用户改选尺寸 → 横幅自动消失', async () => {
    const { of } = await createForm({ query: { styleId: '11', sizeId: '111' } })
    of.selectSize(112)
    expect(of.preselectBannerText.value).toBe('')
  })

  it('F4：无 query → 无横幅', async () => {
    const { of } = await createForm()
    expect(of.preselectBannerText.value).toBe('')
  })
})

// ─── 校验规则 ───

describe('校验规则', () => {
  it('agreed 校验：有须知 + 未勾选 → 报错', async () => {
    const { of } = await createForm()
    await expect(new Promise<void>((resolve, reject) => {
      of.rules.agreed[0].validator(null, false, (err: unknown) => (err ? reject(err) : resolve()))
    })).rejects.toMatchObject({ message: 'order.validation.agreeRequired' })
  })

  it('agreed 校验：有须知 + 已勾选 → 通过', async () => {
    const { of } = await createForm()
    await expect(new Promise<void>((resolve, reject) => {
      of.rules.agreed[0].validator(null, true, (err: unknown) => (err ? reject(err) : resolve()))
    })).resolves.toBeUndefined()
  })

  it('agreed 校验：无须知内容 → 不要求勾选', async () => {
    const { of } = await createForm({ profile: { ...MOCK_PROFILE, rules: '' } })
    await expect(new Promise<void>((resolve, reject) => {
      of.rules.agreed[0].validator(null, false, (err: unknown) => (err ? reject(err) : resolve()))
    })).resolves.toBeUndefined()
  })

  it('clientQq 为必填', async () => {
    const { of } = await createForm()
    expect(of.rules.clientQq[0].required).toBe(true)
  })

  // issue #50-5：QQ 格式与服务端 POST /api/orders 同口径（5-15 位数字，提交前 trim）
  describe('clientQq 格式（#50-5）', () => {
    it('5 位数字 → 通过', async () => {
      const { of } = await createForm()
      expect(runQqFormat(of.rules, '12345')).toBeNull()
    })

    it('4 位数字 → 拒（低于 minLength 5）', async () => {
      const { of } = await createForm()
      expect(runQqFormat(of.rules, '1234')).toBe('errors.QQ_FORMAT')
    })

    it('16 位数字 → 拒（超过 maxLength 15）', async () => {
      const { of } = await createForm()
      expect(runQqFormat(of.rules, '1234567890123456')).toBe('errors.QQ_FORMAT')
    })

    it('含字母/空格 → 拒（服务端 pattern ^[0-9]+$）', async () => {
      const { of } = await createForm()
      expect(runQqFormat(of.rules, '1234a')).toBe('errors.QQ_FORMAT')
      expect(runQqFormat(of.rules, '123 456')).toBe('errors.QQ_FORMAT')
    })

    it('首尾空格 trim 后合法 → 通过', async () => {
      const { of } = await createForm()
      expect(runQqFormat(of.rules, '  12345  ')).toBeNull()
    })

    it('空值不报格式错（交给 required 规则，避免双报）', async () => {
      const { of } = await createForm()
      expect(runQqFormat(of.rules, '')).toBeNull()
    })
  })
})

// ─── 提交 ───

describe('提交', () => {
  it('校验失败 → 不调用 API，submitting 保持 false', async () => {
    const { of, formRef } = await createForm()
    formRef.value.validate.mockResolvedValueOnce(false)
    await of.submit()
    expect(orderApi.create).not.toHaveBeenCalled()
    expect(of.submitting.value).toBe(false)
  })

  it('提交成功 → payload 为 SPEC-PRICE-2 契约（styleSizeId + styleAddons，无旧字段）', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    ;(of.styleAddonSelections as AddonSelections)[1111].toggled = true
    ;(of.styleAddonSelections as AddonSelections)[1112].quantity = 2
    of.toggleUsage(1114)
    of.toggleRush(1116)
    await settlePrice()
    of.form.clientQq = '12345678'
    of.form.agreed = true
    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
    const payload = orderCreateMock.mock.calls[0][0]
    expect(payload.styleSizeId).toBe(111)
    expect(payload.styleAddons).toEqual([
      { styleAddonId: 1111 },
      { styleAddonId: 1112, quantity: 2 },
      { styleAddonId: 1114 },
      { styleAddonId: 1116 }
    ])
    expect(payload).not.toHaveProperty('tierId')
    expect(payload).not.toHaveProperty('usageMultiplierId')
    expect(payload).not.toHaveProperty('rushMultiplierId')
    // D-2（R-9）: 提交带 idempotency-key header（UUID）
    const options = orderCreateMock.mock.calls[0][1]
    expect(options.headers['idempotency-key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(of.showSuccess.value).toBe(true)
    expect(of.resultNo.value).toBe('ALICE-001')
    // 提交成功清草稿键
    expect(sessionStorage.getItem('orderForm_draft_alice')).toBeNull()
  })

  it('提交失败 → 错误消息提示，showSuccess 保持 false', async () => {
    orderCreateMock.mockRejectedValueOnce(new Error('服务器错误'))
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    await settlePrice()
    of.form.clientQq = '12345678'
    await of.submit()
    expect(ElMessage.error).toHaveBeenCalledWith('服务器错误')
    expect(of.showSuccess.value).toBe(false)
  })

  it('D-2: 同一次提交失败重试复用同 key，成功后换新 key', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    await settlePrice()
    of.form.clientQq = '12345678'
    orderCreateMock.mockRejectedValueOnce(new Error('服务器错误'))
    await of.submit()
    await of.submit()
    const key1 = orderCreateMock.mock.calls[0][1].headers['idempotency-key']
    const key2 = orderCreateMock.mock.calls[1][1].headers['idempotency-key']
    expect(key1).toBe(key2)
    // 成功后下一次提交换新 key
    of.form.clientQq = '87654321'
    await of.submit()
    const key3 = orderCreateMock.mock.calls[2][1].headers['idempotency-key']
    expect(key3).not.toBe(key1)
  })

  it('issue #50-1：报价未就绪 → 拦下提交并提示；报价就位后放行', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.form.clientQq = '12345678'
    of.form.agreed = true
    expect(of.priceBlocking.value).toBe(true)
    await of.submit()
    expect(orderApi.create).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('orderForm.priceNotReady')
    expect(of.submitting.value).toBe(false)

    await settlePrice()
    expect(of.priceBlocking.value).toBe(false)
    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
  })

  it('issue #50-2：计价失败 → 报价态出「待确认」而非基础价，且提交被拦', async () => {
    const { of } = await createForm()
    calcPriceMock.mockRejectedValue(new Error('boom'))
    of.selectStyle(11)
    of.selectSize(111)
    await settlePrice()
    expect(of.styleDisplayCents.value).toBeNull()
    expect(of.priceStatusText.value).toBe('orderForm.pricePending')
    expect(of.priceBlocking.value).toBe(true)
  })

  it('issue #50-6：填了折扣码但未验证 → 拦下提交；验证通过后带码放行', async () => {
    const { of } = await createForm()
    of.selectStyle(11)
    of.selectSize(111)
    of.form.discountCode = 'SAVE10'
    await settlePrice()
    of.form.clientQq = '12345678'
    of.form.agreed = true

    await of.submit()
    expect(orderApi.create).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('orderForm.discountNotValidated')
    expect(of.submitting.value).toBe(false)

    ;(of.discountResult as { value: unknown }).value = { discountType: 'percent', discountValue: 10 }
    await of.submit()
    expect(orderApi.create).toHaveBeenCalledTimes(1)
    expect(orderCreateMock.mock.calls[0][0].discountCode).toBe('SAVE10')
  })
})

// ─── 参考图上传 ───
// issue #50-3：点选与粘贴必须共用 useOrderForm.refFileList 一个数组（EP 走 v-model:file-list）。
// 这里的 landRefItem 模拟 EP 的 onStart（选文件即把条目落进同一数组），随后调 http-request，
// 与真实时序一致——回退到「两个数组」时，点选条目不会带 filePath，用例即转红。

/** 模拟 EP onStart：选文件先把条目落进共享数组（真实由 v-model:file-list 回写） */
function landRefItem(of: ReturnType<typeof useOrderForm>, name: string, uid: string) {
  of.refFileList.value.push({ name, uid, status: 'ready' })
}

/** 模拟 EP 点选一张：落条目 → http-request（见 DetailStep.vue 的 v-model:file-list） */
async function pickRefItem(of: ReturnType<typeof useOrderForm>, name: string, uid: string) {
  landRefItem(of, name, uid)
  const file = { size: 1024, name, uid } as unknown as File & { uid: string | number }
  await of.handleRefUpload({ file })
  return file
}

function makeRefFile(name: string): File {
  return new File([new Uint8Array(8)], name, { type: 'image/png' })
}

describe('参考图上传', () => {
  it('文件超过 10MB → 警告且不上传', async () => {
    const { of } = await createForm()
    const bigFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    await of.handleRefUpload({ file: bigFile as File & { uid: string | number } })
    expect(uploadApi.reference).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('非图片扩展名 → 提示仍可上传', async () => {
    const { of } = await createForm()
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    await of.handleRefUpload({ file: file as File & { uid: string | number } })
    expect(ElMessage.info).toHaveBeenCalledWith('orderForm.typeWarning')
    expect(uploadApi.reference).toHaveBeenCalled()
  })

  it('上传成功 → 按 uid 回填同一数组的条目（不新增），提交 references 取自该数组', async () => {
    const { of } = await createForm()
    await pickRefItem(of, 'a.png', 'u-a')
    expect(of.refFileList.value).toHaveLength(1)
    expect(of.refFileList.value[0].filePath).toBe('references/a.png')
    of.form.clientQq = '12345678'
    await of.submit()
    expect(orderCreateMock.mock.calls[0][0].references).toEqual(['references/a.png'])
  })

  it('从同一数组移除条目（EP on-remove 即过滤数组）→ 提交不再带该路径', async () => {
    const { of } = await createForm()
    await pickRefItem(of, 'a.png', 'u-a')
    of.refFileList.value.splice(0, 1)
    of.form.clientQq = '12345678'
    await of.submit()
    expect(orderCreateMock.mock.calls[0][0].references).toEqual([])
  })

  it('上传失败 → 错误消息提示', async () => {
    refUploadMock.mockRejectedValueOnce(new Error('上传失败'))
    const { of } = await createForm()
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await expect(of.handleRefUpload({ file: file as File & { uid: string | number } })).rejects.toThrow('上传失败')
    expect(ElMessage.error).toHaveBeenCalledWith('上传失败')
  })

  it('点选 3 张 + 粘贴 3 张 → 合并后共 5 张，第 6 张被拒（上限只在同一数组判一次）', async () => {
    const { of } = await createForm()
    for (let i = 0; i < 3; i++) await pickRefItem(of, `pick${i}.png`, `u-pick-${i}`)
    // 点选链路必须写进同一数组（旧实现只 push uploadedRefs，这里就是空的）
    expect(of.refFileList.value).toHaveLength(3)
    expect(of.refFileList.value.every(f => !!f.filePath)).toBe(true)

    refUploadMock.mockClear()
    await pasteCapture.onFiles!([makeRefFile('p0.png'), makeRefFile('p1.png'), makeRefFile('p2.png')])

    // 3 张粘贴只剩 2 个名额：第 3 张在循环入口被上限拦下（break + 一次提示）
    expect(refUploadMock).toHaveBeenCalledTimes(2)
    expect(of.refFileList.value).toHaveLength(MAX_IMAGE_COUNT)
    expect(ElMessage.warning).toHaveBeenCalledWith('orderForm.refExceed')
  })

  it('提交 payload 的 references 与 refFileList 同源（同一数组取 filePath，顺序一致）', async () => {
    const { of } = await createForm()
    await pickRefItem(of, 'a.png', 'u-a')
    await pasteCapture.onFiles!([makeRefFile('b.png')])
    of.form.clientQq = '12345678'
    await of.submit()
    const payload = orderCreateMock.mock.calls[0][0]
    expect(payload.references).toEqual(['references/a.png', 'references/b.png'])
    expect(payload.references).toEqual(of.refFileList.value.map(f => f.filePath))
  })
})
