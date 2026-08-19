// 818-D + 819-J「同信息再来一单」：订单详情入口 + 回填选项对话框契约
// 覆盖：终态/非终态按钮都在；弹窗四个选项（描述/款式尺寸/备注/参考图）；
//       默认勾选 desc+style+refs；确认按勾选跳转 /orders/new?from=&fill=；埋点 reorder_start；取消不跳转
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const h = vi.hoisted(() => ({
  order: null as OrderMock | null,
  getOrder: vi.fn(() => Promise.resolve(h.order)),
  push: vi.fn(),
  track: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '806' }, query: {} }),
  useRouter: () => ({ push: h.push })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getOrder: h.getOrder,
    getWorkflow: () => Promise.resolve({ stages: [] }),
    updateStatus: () => Promise.resolve({}),
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

vi.mock('../../../utils/track.js', () => ({
  trackEvent: h.track
}))

vi.mock('../../../components/ArtistLayout.vue', () => ({
  default: { name: 'ArtistLayout', template: '<div><slot /></div>' }
}))
vi.mock('../../../components/shared/OrderTimeline.vue', () => ({
  default: { name: 'OrderTimeline', template: '<div />' }
}))
vi.mock('../../../components/artist/DeliverDialog.vue', () => ({
  default: { name: 'DeliverDialog', template: '<div />' }
}))

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
  useSlideConfirm: () => ({
    active: ref(false),
    progress: ref(0),
    open: () => {},
    close: () => {},
    onStart: () => {},
    onMove: () => {},
    onEnd: () => {}
  })
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

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 806,
    order_no: 'ALICE-006',
    status: 'wip',
    priority: 'medium',
    source: 'manual',
    client_qq: '234652462',
    client_name: 'testtas',
    description: '全身立绘',
    created_at: '2026-08-05 00:44',
    deadline: null as string | null,
    start_date: null as string | null,
    paid_total_cents: 0,
    final_price_cents: 31000,
    total_price_cents: 31000,
    paidTotalCents: 0,
    remainingCents: 31000,
    currentStageId: null as string | null,
    references: [] as unknown[],
    notes: [] as unknown[],
    extraItems: [] as unknown[],
    installments: [] as unknown[],
    logs: [] as unknown[],
    ...overrides
  }
}

type OrderMock = ReturnType<typeof buildOrder>

async function mountDetail(order: OrderMock | null) {
  h.order = order
  const wrapper = mount(OrderDetail, {
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key: string) => [key]
      },
      stubs: {
        'el-card': { template: '<div><slot /><slot name="header" /></div>' },
        'el-button': { inheritAttrs: false, template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-dialog': { template: '<div v-if="modelValue" class="el-dialog"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
        'el-tag': { template: '<span><slot /></span>' },
        'el-checkbox-group': {
          name: 'ElCheckboxGroupStub',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<div class="reorder-fill-group"><slot /></div>'
        },
        'el-checkbox': { props: ['value'], template: '<label class="el-checkbox"><slot /></label>' },
        'el-input': { template: '<input />' },
        'el-form': { template: '<div><slot /></div>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input-number': { template: '<input type="number" />' },
        'el-radio-group': { template: '<div><slot /></div>' },
        'el-radio': { template: '<label><slot /></label>' },
        'el-radio-button': { template: '<label><slot /></label>' },
        'el-date-picker': { template: '<input />' },
        'el-image': { template: '<img />' },
        'el-timeline': { template: '<div><slot /></div>' },
        'el-timeline-item': { template: '<div><slot /></div>' },
        'el-page-header': { template: '<div><slot /></div>' },
        'el-descriptions': { template: '<div><slot /></div>' },
        'el-descriptions-item': { template: '<div><slot /></div>' },
        'el-scrollbar': { template: '<div><slot /></div>' },
        Teleport: { template: '<div><slot /></div>' },
        Plus: true,
        Picture: true
      }
    }
  })
  await flushPromises()
  return wrapper
}

/** 按文案找 el-button stub（DOM 顺序不可靠：el-card stub 先渲染默认插槽再渲染 header） */
function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(b => b.text() === text)
}

describe('OrderDetail 再来一单（818-D）', () => {
  beforeEach(() => {
    h.push.mockReset()
    h.track.mockReset()
  })

  it('终态/非终态订单均显示「再来一单」按钮', async () => {
    for (const status of ['wip', 'delivered', 'cancelled']) {
      const wrapper = await mountDetail(buildOrder({ status }))
      expect(wrapper.text()).toContain('orderDetail.reorderBtn')
    }
  })

  it('点击按钮弹出回填选项对话框：默认勾选描述+款式尺寸+参考图，含四个选项', async () => {
    const wrapper = await mountDetail(buildOrder())
    await buttonByText(wrapper, 'orderDetail.reorderBtn')!.trigger('click')
    const dialog = wrapper.find('.el-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('orderDetail.reorderDialogHint')

    const checks = dialog.findAll('.el-checkbox')
    expect(checks.length).toBe(4)
    expect(dialog.text()).toContain('orderDetail.reorderFillDesc')
    expect(dialog.text()).toContain('orderDetail.reorderFillStyle')
    expect(dialog.text()).toContain('orderDetail.reorderFillNote')
    expect(dialog.text()).toContain('orderDetail.reorderFillRefs')

    const group = dialog.findComponent({ name: 'ElCheckboxGroupStub' })
    expect(group.props('modelValue')).toEqual(['desc', 'style', 'refs'])
  })

  it('确认后按默认勾选跳转录单页（from+fill），并埋点 reorder_start', async () => {
    const wrapper = await mountDetail(buildOrder())
    await buttonByText(wrapper, 'orderDetail.reorderBtn')!.trigger('click')
    await buttonByText(wrapper, 'orderDetail.reorderConfirm')!.trigger('click')

    expect(h.push).toHaveBeenCalledWith({
      path: '/orders/new',
      query: { from: 806, fill: 'desc,style,refs' }
    })
    expect(h.track).toHaveBeenCalledWith('artist_action', {
      action: 'reorder_start',
      fromOrderId: 806,
      fill: 'desc,style,refs'
    })
  })

  it('修改勾选后确认：fill 反映勾选集合（如只勾备注 → fill=note）', async () => {
    const wrapper = await mountDetail(buildOrder())
    await buttonByText(wrapper, 'orderDetail.reorderBtn')!.trigger('click')
    const group = wrapper.findComponent({ name: 'ElCheckboxGroupStub' })
    await group.vm.$emit('update:modelValue', ['note'])
    await buttonByText(wrapper, 'orderDetail.reorderConfirm')!.trigger('click')

    expect(h.push).toHaveBeenCalledWith({
      path: '/orders/new',
      query: { from: 806, fill: 'note' }
    })
  })

  it('只勾参考图 → fill=refs（819-J 二期）', async () => {
    const wrapper = await mountDetail(buildOrder())
    await buttonByText(wrapper, 'orderDetail.reorderBtn')!.trigger('click')
    const group = wrapper.findComponent({ name: 'ElCheckboxGroupStub' })
    await group.vm.$emit('update:modelValue', ['refs'])
    await buttonByText(wrapper, 'orderDetail.reorderConfirm')!.trigger('click')

    expect(h.push).toHaveBeenCalledWith({
      path: '/orders/new',
      query: { from: 806, fill: 'refs' }
    })
    expect(h.track).toHaveBeenCalledWith('artist_action', {
      action: 'reorder_start',
      fromOrderId: 806,
      fill: 'refs'
    })
  })

  it('取消关闭弹窗，不跳转不埋点', async () => {
    const wrapper = await mountDetail(buildOrder())
    await buttonByText(wrapper, 'orderDetail.reorderBtn')!.trigger('click')
    await buttonByText(wrapper, 'common.cancel')!.trigger('click')
    expect(wrapper.find('.el-dialog').exists()).toBe(false)
    expect(h.push).not.toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })
})
