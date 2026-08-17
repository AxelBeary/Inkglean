// 818-D「同信息再来一单」一期：手动录单页预填逻辑
// 覆盖：query 解析；QQ/昵称必带；描述/备注按勾选；款式尺寸按源单尺寸回填；
//       新单从零（deadline/startDate 不写入）；源单读取失败降级；尺寸缺失降级
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const h = vi.hoisted(() => ({
  profile: { subdomain: 'alice' },
  styles: [],
  routeQuery: { from: '806', fill: 'desc,style,note' },
  sourceOrder: null,
  getOrder: vi.fn(() => Promise.resolve(h.sourceOrder)),
  created: null,
  noteCalls: [],
  deadlineCalls: 0,
  startDateCalls: 0,
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  msgInfo: vi.fn()
}))

// 818-D: ManualOrder 读 /orders/new?from=&fill= 预填；每用例改 h.routeQuery 即可
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: h.routeQuery })
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useI18n: () => ({ t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) })
  }
})

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: h.msgSuccess, error: h.msgError, warning: h.msgWarning, info: h.msgInfo },
    ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
  }
})

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: () => Promise.resolve(h.profile),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getOrders: () => Promise.resolve({ items: [] }),
    getToolsClient: () => Promise.resolve(null),
    getOrder: h.getOrder,
    createManualOrder: (data) => { h.created = data; return Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null }) },
    updatePrice: () => Promise.resolve({}),
    addExtraItem: () => Promise.resolve({}),
    addNote: (id, data) => { h.noteCalls.push({ id, data }); return Promise.resolve({}) },
    updateDeadline: () => { h.deadlineCalls += 1; return Promise.resolve({}) },
    updateStartDate: () => { h.startDateCalls += 1; return Promise.resolve({}) },
    advanceStage: () => Promise.resolve({}),
    updateStatus: () => Promise.resolve({})
  },
  artistPublicApi: {
    getPricing: () => Promise.resolve({ styles: [], installments: [], discountEnabled: false }),
    getPublicStyles: () => Promise.resolve(h.styles),
    calculateStylePrice: () => Promise.resolve(null)
  },
  uploadApi: { reference: () => Promise.resolve({ filePath: 'references/t.png', url: '/uploads/references/t.png' }) }
}))

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

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: null, cover_image: null, sort_order: 1,
    sizes: [
      { id: 111, name: '头像', base_price: 80, sort_order: 1, image: null, image_artwork_id: null, artwork_image_path: null, description: null, work_days: 3, display_status: 'available', addons: [] },
      { id: 112, name: '全身', base_price: 200, sort_order: 2, image: null, image_artwork_id: null, artwork_image_path: null, description: null, work_days: 7, display_status: 'available', addons: [] }
    ]
  }
]

const SOURCE_ORDER = {
  id: 806,
  order_no: 'ALICE-006',
  status: 'delivered',
  client_qq: '234652462',
  client_name: '老客户',
  description: '全身立绘 双人',
  style_size_id: 112,
  deadline: '2026-09-01',
  start_date: '2026-08-20',
  priority: 'high',
  notes: [
    { id: 1, content: '系统备注：改价', created_by: 'system' },
    { id: 2, content: '客户喜欢暖色调', created_by: 'artist' },
    { id: 3, content: '线下已谈好加急', created_by: 'artist' }
  ],
  // 819-J 二期: 源单参考图（详情接口返回签名 url + file_path）
  references: [
    { id: 11, file_path: 'references/alice/a.png', original_name: 'a.png', url: '/signed/a' },
    { id: 12, file_path: 'references/alice/b.png', original_name: 'b.png', url: '/signed/b' }
  ]
}

function setup({ styles = MOCK_STYLES, sourceOrder = SOURCE_ORDER, query = { from: '806', fill: 'desc,style,note' } } = {}) {
  h.styles = styles
  h.sourceOrder = sourceOrder
  h.routeQuery = query
  h.created = null
  h.noteCalls = []
  h.deadlineCalls = 0
  h.startDateCalls = 0
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.msgWarning.mockReset()
  h.msgInfo.mockReset()
  h.getOrder.mockClear()
}

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

describe('ManualOrder 再来一单预填（818-D）', () => {
  beforeEach(() => {
    setup()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('QQ/昵称必带 + 描述/备注/款式尺寸按勾选回填；完成后轻提示', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('input[placeholder="manualOrder.clientQqPlaceholder"]').element.value).toBe('234652462')
    expect(wrapper.find('input[placeholder="manualOrder.clientNamePlaceholder"]').element.value).toBe('老客户')
    expect(wrapper.find('textarea[placeholder="manualOrder.descPlaceholder"]').element.value).toBe('全身立绘 双人')
    expect(wrapper.find('textarea[placeholder="manualOrder.notePlaceholder"]').element.value).toBe('客户喜欢暖色调\n线下已谈好加急')
    // 款式尺寸：源单尺寸在画风列表 → 尺寸卡选中（系统备注不进入备注预填）
    const active = wrapper.find('.tier-card--active')
    expect(active.exists()).toBe(true)
    expect(active.text()).toContain('全身')
    expect(h.msgSuccess).toHaveBeenCalledWith('manualOrder.reorderPrefilled:{"no":"ALICE-006"}')
  })

  it('提交新单：带上回填文字与 styleSizeId；不带 deadline/startDate（新单从零）', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    expect(h.created).toMatchObject({
      clientQq: '234652462',
      clientName: '老客户',
      description: '全身立绘 双人',
      styleSizeId: 112
    })
    expect(h.created.styleAddons).toEqual([])
    // 备注经既有 addNote 接口写入新单
    expect(h.noteCalls).toEqual([{ id: 1, data: { content: '客户喜欢暖色调\n线下已谈好加急' } }])
    // deadline/startDate 一律不带
    expect(h.deadlineCalls).toBe(0)
    expect(h.startDateCalls).toBe(0)
  })

  it('未勾选 desc/note：只带 QQ/昵称（fill=style 时仍回填款式尺寸）', async () => {
    setup({ query: { from: '806', fill: 'style' } })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('input[placeholder="manualOrder.clientQqPlaceholder"]').element.value).toBe('234652462')
    expect(wrapper.find('input[placeholder="manualOrder.clientNamePlaceholder"]').element.value).toBe('老客户')
    expect(wrapper.find('textarea[placeholder="manualOrder.descPlaceholder"]').element.value).toBe('')
    expect(wrapper.find('textarea[placeholder="manualOrder.notePlaceholder"]').element.value).toBe('')
    expect(wrapper.find('.tier-card--active').text()).toContain('全身')
  })

  it('源单尺寸已删除/无尺寸：款式尺寸降级不选中，其余描述类照常回填', async () => {
    setup({ query: { from: '806', fill: 'desc,style,note' }, sourceOrder: { ...SOURCE_ORDER, style_size_id: 999 } })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('textarea[placeholder="manualOrder.descPlaceholder"]').element.value).toBe('全身立绘 双人')
    expect(wrapper.find('textarea[placeholder="manualOrder.notePlaceholder"]').element.value).toBe('客户喜欢暖色调\n线下已谈好加急')
    expect(wrapper.find('.tier-card--active').exists()).toBe(false)
  })

  it('源单读取失败：页内提示错误，不崩溃、不回填', async () => {
    h.getOrder.mockRejectedValueOnce(new Error('网络错误'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('input[placeholder="manualOrder.clientQqPlaceholder"]').element.value).toBe('')
    expect(h.msgError).toHaveBeenCalledWith('manualOrder.reorderSourceFailed:{"message":"网络错误"}')
  })

  it('无 fill query：仅 QQ/昵称必带，其余为空', async () => {
    setup({ query: { from: '806' } })
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('input[placeholder="manualOrder.clientQqPlaceholder"]').element.value).toBe('234652462')
    expect(wrapper.find('input[placeholder="manualOrder.clientNamePlaceholder"]').element.value).toBe('老客户')
    expect(wrapper.find('textarea[placeholder="manualOrder.descPlaceholder"]').element.value).toBe('')
    expect(wrapper.find('textarea[placeholder="manualOrder.notePlaceholder"]').element.value).toBe('')
    expect(wrapper.find('.tier-card--active').exists()).toBe(false)
  })

  it('勾选参考图：源单参考图路径引用灌入并随新单提交（819-J 二期）', async () => {
    setup({ query: { from: '806', fill: 'desc,style,note,refs' } })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    // 参考图走既有 references 提交链路（路径引用，非重复上传产物）
    expect(h.created.references).toEqual([
      'references/alice/a.png',
      'references/alice/b.png'
    ])
    expect(h.msgWarning).not.toHaveBeenCalled()
    expect(h.msgInfo).not.toHaveBeenCalled()
  })

  it('源单参考图超上限：截断到 MAX_IMAGE_COUNT 并轻提示，提交只带前 N 张', async () => {
    const manyRefs = Array.from({ length: 7 }, (_, i) => ({
      id: 100 + i,
      file_path: `references/alice/f${i}.png`,
      original_name: `f${i}.png`,
      url: `/signed/f${i}`
    }))
    setup({ query: { from: '806', fill: 'desc,style,refs' }, sourceOrder: { ...SOURCE_ORDER, references: manyRefs } })
    const wrapper = mountPage()
    await flushPromises()

    expect(h.msgWarning).toHaveBeenCalledWith('manualOrder.reorderRefsTruncated:{"count":5}')

    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    expect(h.created.references).toEqual([
      'references/alice/f0.png',
      'references/alice/f1.png',
      'references/alice/f2.png',
      'references/alice/f3.png',
      'references/alice/f4.png'
    ])
  })

  it('源单无参考图：选项仍可勾但提示降级，不崩溃、不预填参考图', async () => {
    setup({
      query: { from: '806', fill: 'desc,style,note,refs' },
      sourceOrder: { ...SOURCE_ORDER, references: [] }
    })
    const wrapper = mountPage()
    await flushPromises()

    expect(h.msgInfo).toHaveBeenCalledWith('manualOrder.reorderNoRefs')
    // 文字预填不受参考图降级影响
    expect(wrapper.find('textarea[placeholder="manualOrder.descPlaceholder"]').element.value).toBe('全身立绘 双人')

    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    expect(h.created.references).toEqual([])
  })
})
