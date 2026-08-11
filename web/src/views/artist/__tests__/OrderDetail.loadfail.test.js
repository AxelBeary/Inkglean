// OrderDetail 首载失败错误态测试（REQ-037 F1/F2）
// 覆盖：getOrder reject → 页内错误态（loadFailed 文案 + 重试按钮，不弹 toast）；
//       点击重试 → getOrder 再次调用，resolve 后错误态消失；首载进行中渲染骨架屏。
// 基建沿用 OrderDetail.duebanner.test.js 同款 mock（vi.mock api/router/element-plus/composables）；
// 唯一差异：el-button stub 改 $emit('click')——原 duebanner 的 $listeners 写法在 Vue 3 无效，
// 本用例需要真实点击重试按钮，故只调整这一个 stub 的点击派发，不新增 mock 体系。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// happy-dom 无 ResizeObserver，Element Plus 内部可能用到，补齐
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '806' }, query: {} }),
  useRouter: () => ({ push: () => {} })
}))

vi.mock('vue-i18n', () => ({
  // 带参键输出 key+params，便于断言金额/节点名传参正确
  useI18n: () => ({ t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

// 订单数据容器 + 可注入 spy：每个用例 mount 前设置 h.order / mock 返回
const h = vi.hoisted(() => ({
  order: null,
  getOrder: vi.fn(() => Promise.resolve(h.order)),
  updateStatus: vi.fn(() => Promise.resolve({})),
  confirm: vi.fn(() => Promise.resolve('confirm')),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  slideConfirm: { onConfirm: null, trigger: null }
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: h.confirm }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getOrder: h.getOrder,
    getWorkflow: () => Promise.resolve({ stages: [] }),
    updateStatus: h.updateStatus,
    updatePriority: () => Promise.resolve(h.order),
    updateDeadline: () => Promise.resolve(h.order),
    updateStartDate: () => Promise.resolve(h.order),
    updatePrice: () => Promise.resolve(h.order),
    addExtraItem: () => Promise.resolve(h.order),
    deleteExtraItem: () => Promise.resolve(h.order),
    addNote: () => Promise.resolve(h.order),
    deleteNote: () => Promise.resolve({}),
    advanceStage: () => Promise.resolve(h.order),
    stageBack: () => Promise.resolve(h.order),
    stageOff: () => Promise.resolve(h.order),
    trackOn: () => Promise.resolve(h.order),
    addReference: () => Promise.resolve(h.order),
    deleteReference: () => Promise.resolve(h.order),
    setFocusImage: () => Promise.resolve(h.order),
    deliverNoFile: () => Promise.resolve(h.order),
    getOrderLogs: () => Promise.resolve({ items: [], total: 0 })
  },
  uploadApi: { upload: () => Promise.resolve({ path: '' }) }
}))

// 子组件 stub——错误态/骨架/详情分支逻辑在 OrderDetail 本身，不依赖这些子件渲染细节
vi.mock('../../../components/ArtistLayout.vue', () => ({
  default: { name: 'ArtistLayout', template: '<div><slot /></div>' }
}))
vi.mock('../../../components/shared/OrderTimeline.vue', () => ({
  default: { name: 'OrderTimeline', template: '<div />' }
}))
vi.mock('../../../components/artist/DeliverDialog.vue', () => ({
  default: { name: 'DeliverDialog', template: '<div />' }
}))

// composables：给齐解构面，行为置空
vi.mock('../../../composables/usePasteUpload.js', () => ({
  usePasteUpload: () => ({ pasteError: ref(null) })
}))
vi.mock('../../../composables/useDropGuard.js', () => ({
  useDropGuard: () => ({
    isSystemFileDrag: () => true,
    guardDragEnter: () => true,
    guardDragOver: () => true,
    guardDrop: () => true
  })
}))
vi.mock('../../../composables/useSignatureRefresh.js', () => ({
  useSignatureRefresh: () => ({ refreshNow: () => {} })
}))
vi.mock('../../../composables/useSlideConfirm.js', () => ({
  useSlideConfirm: (opts) => {
    // 捕获 onConfirm，测试用 trigger 模拟滑块拖到底（对齐真实 useSlideConfirm 的调用点）
    h.slideConfirm.onConfirm = opts.onConfirm
    h.slideConfirm.trigger = () => h.slideConfirm.onConfirm?.()
    return {
      active: ref(false),
      progress: ref(0),
      open: () => {},
      close: () => {},
      onStart: () => {},
      onMove: () => {},
      onEnd: () => {}
    }
  }
}))
vi.mock('../../../composables/useOrderPayments.js', () => ({
  useOrderPayments: () => ({
    payments: ref([]),
    loading: ref(false),
    submitting: ref(false),
    loadPayments: () => {},
    addPayment: () => Promise.resolve({}),
    revokePayment: () => Promise.resolve({})
  })
}))
vi.mock('../../../composables/useActivityLog.js', () => ({
  useActivityLog: () => ({
    logs: ref([]),
    total: ref(0),
    page: ref(1),
    pageSize: ref(50),
    typeFilter: ref(''),
    loading: ref(false),
    loadLogs: () => {},
    onPageChange: () => {},
    onTypeChange: () => {}
  })
}))

import OrderDetail from '../OrderDetail.vue'

/** 构造订单 mock（字段对齐后端 enrich 响应） */
function buildOrder(overrides = {}) {
  return {
    id: 806,
    order_no: 'ALICE-006',
    status: 'wip',
    priority: 'medium',
    source: 'manual',
    client_qq: '234652462',
    client_name: 'testtas',
    description: null,
    created_at: '2026-08-05 00:44',
    deadline: null,
    start_date: null,
    paid_total_cents: 17640,
    final_price_cents: 31000,
    total_price_cents: 31000,
    // 后端 enrich 字段
    paidTotalCents: 17640,
    remainingCents: 13360,
    currentStageId: null,
    references: [],
    notes: [],
    extraItems: [],
    installments: [],
    logs: [],
    ...overrides
  }
}

async function mountDetail(order) {
  h.order = order
  const wrapper = mount(OrderDetail, {
    global: {
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key) => [key]
      },
      stubs: {
        'el-card': { template: '<div><slot /><slot name="header" /></div>' },
        // REQ-037 测试差异：click 真实 emit（原 duebanner 的 $listeners 写法在 Vue 3 无效）；
        // inheritAttrs:false 防止父级 onClick 经 $attrs 继承到内部 button 造成双触发
        'el-button': { inheritAttrs: false, template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
        'el-tag': { template: '<span><slot /></span>' },
        'el-input': { template: '<input />' },
        'el-form': { template: '<div><slot /></div>' },
        'el-form-item': { template: '<div><span class="form-item-label">{{ label }}</span><slot /></div>', props: ['label'] },
        'el-input-number': { template: '<input type="number" />' },
        'el-table': { template: '<div><slot /></div>' },
        'el-table-column': { template: '<div />' },
        'el-radio-group': { template: '<div><slot /></div>' },
        'el-radio': { template: '<label><slot /></label>' },
        'el-radio-button': { template: '<label><slot /></label>' },
        'el-progress': { template: '<div />' },
        'el-empty': { template: '<div />' },
        'el-divider': { template: '<hr />' },
        'el-image': { template: '<img />' },
        'el-date-picker': { template: '<input />' },
        'el-select': { template: '<div><slot /></div>' },
        'el-option': { template: '<div />' },
        'el-timeline': { template: '<div><slot /></div>' },
        'el-timeline-item': { template: '<div><slot /></div>' },
        'el-tooltip': { template: '<div><slot /></div>' },
        'el-popconfirm': { template: '<div><slot /></div>' },
        'el-switch': { template: '<input type="checkbox" />' },
        'el-checkbox': { template: '<label><slot /></label>' },
        'el-avatar': { template: '<div><slot /></div>' },
        'el-icon': { template: '<i><slot /></i>' },
        'el-page-header': { template: '<div><slot /></div>' },
        'el-result': { template: '<div><slot /></div>' },
        'el-descriptions': { template: '<div><slot /></div>' },
        'el-descriptions-item': { template: '<div><slot /></div>' },
        'el-scrollbar': { template: '<div><slot /></div>' },
        'el-dropdown': { template: '<div><slot /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>' },
        Teleport: { template: '<div><slot /></div>' },
        Plus: true,
        Picture: true
      }
    }
  })
  await flushPromises()
  return wrapper
}

describe('OrderDetail 首载失败错误态 + 骨架（REQ-037 F1/F2）', () => {
  beforeEach(() => {
    h.getOrder.mockReset()
    h.msgError.mockClear()
  })

  it('getOrder reject：渲染页内错误态（loadFailed 文案 + 重试按钮），不弹 toast', async () => {
    h.getOrder.mockRejectedValueOnce(new Error('load boom'))
    const wrapper = await mountDetail(null)

    const failed = wrapper.find('.od-load-failed')
    expect(failed.exists()).toBe(true)
    expect(failed.text()).toContain('orderDetail.loadFailed')
    expect(failed.find('button').text()).toContain('orderDetail.loadFailedRetry')
    // F1: 首载失败走页内错误态，不弹 toast（对齐 Settings profileLoadFailed 模式）
    expect(h.msgError).not.toHaveBeenCalled()
  })

  it('点击重试 → getOrder 再次调用 → resolve 后错误态消失', async () => {
    const order = buildOrder()
    h.order = order
    h.getOrder
      .mockRejectedValueOnce(new Error('load boom')) // mount 首载失败
      .mockResolvedValueOnce(order)                  // 点击重试成功
    const wrapper = await mountDetail(null)
    expect(wrapper.find('.od-load-failed').exists()).toBe(true)

    await wrapper.find('.od-load-failed button').trigger('click')
    await flushPromises()

    expect(h.getOrder).toHaveBeenCalledTimes(2)
    expect(h.getOrder).toHaveBeenCalledWith('806')
    expect(wrapper.find('.od-load-failed').exists()).toBe(false)
    expect(wrapper.find('.order-detail').exists()).toBe(true)
  })

  it('首载进行中（请求未返回且未失败）：渲染骨架屏，成功后骨架消失', async () => {
    let resolveOrder
    h.getOrder.mockReturnValueOnce(new Promise((resolve) => { resolveOrder = resolve }))
    const wrapper = await mountDetail(null)

    // 请求仍挂起 → 骨架替代白屏（F2）
    expect(wrapper.find('.hy-skeleton').exists()).toBe(true)
    expect(wrapper.find('.od-load-failed').exists()).toBe(false)

    resolveOrder(buildOrder())
    await flushPromises()

    expect(wrapper.find('.hy-skeleton').exists()).toBe(false)
    expect(wrapper.find('.order-detail').exists()).toBe(true)
  })
})
