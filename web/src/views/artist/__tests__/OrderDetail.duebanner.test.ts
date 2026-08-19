// OrderDetail 待收横幅组件测试（REQ-025 二阶段 B 路：订单级总待收横幅 + 负数退款 label 切换）
// 覆盖：总横幅显示/隐藏边界（remainingCents 为 0/null、终态）、主副信息内容、负数 label 动态切换
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
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

// 订单数据容器 + 可注入 spy：每个用例 mount 前设置 h.order / mock 返回
const h = vi.hoisted(() => ({
  order: null as OrderMock | null,
  getOrder: vi.fn(() => Promise.resolve(h.order)),
  updateStatus: vi.fn(() => Promise.resolve({})),
  cancelOrder: vi.fn(() => Promise.resolve({})),
  undoCancelOrder: vi.fn(() => Promise.resolve({})),
  confirm: vi.fn(() => Promise.resolve('confirm')),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  slideConfirm: { onConfirm: null as (() => void) | null, trigger: null as (() => void) | null }
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
    cancelOrder: h.cancelOrder,
    undoCancelOrder: h.undoCancelOrder,
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

// 子组件 stub——横幅逻辑在 OrderDetail 本身，不依赖这些子件渲染细节
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
  useSlideConfirm: (opts: { onConfirm?: (() => void) | null }) => {
    // 捕获 onConfirm，测试用 trigger 模拟滑块拖到底（对齐真实 useSlideConfirm 的调用点）
    h.slideConfirm.onConfirm = opts.onConfirm ?? null
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
function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 806,
    order_no: 'ALICE-006',
    status: 'wip',
    priority: 'medium',
    source: 'manual',
    client_qq: '234652462',
    client_name: 'testtas',
    description: null as string | null,
    created_at: '2026-08-05 00:44',
    deadline: null as string | null,
    start_date: null as string | null,
    paid_total_cents: 17640,
    final_price_cents: 31000,
    total_price_cents: 31000,
    // 后端 enrich 字段
    paidTotalCents: 17640,
    remainingCents: 13360,
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

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface OrderDetailVM {
  order: {
    remainingCents: number | null
    status: string
    order_no: string
    paidTotalCents: number
  }
  payDialogVisible: boolean
  payForm: { amountYuan: number | null }
  loadOrder: () => Promise<void>
}

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
        'el-button': { template: '<button @click="$listeners?.click?.()"><slot /></button>' },
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
  return { wrapper, vm: wrapper.vm as unknown as OrderDetailVM }
}

describe('OrderDetail 待收横幅（REQ-025 二阶段 B 路）', () => {
  it('总待收 > 0：显示横幅，主信息=订单级总待收，副信息=当前节点', async () => {
    const order = buildOrder({
      remainingCents: 13360,
      installments: [
        { id: 1, name: '排期确认', amountCents: 9300, paidCents: 9300, remainingCents: 0, status: 'paid' },
        { id: 2, name: '线稿确认', amountCents: 10230, paidCents: 8340, remainingCents: 1890, status: 'partial' },
        { id: 3, name: '交付', amountCents: 11470, paidCents: 0, remainingCents: 11470, status: 'pending' }
      ]
    })
    const { wrapper } = await mountDetail(order)
    const banner = wrapper.find('.next-due-banner')
    expect(banner.exists()).toBe(true)
    // 主信息：总待收 ¥133.60
    expect(banner.find('.next-due-text').text()).toContain('orderDetail.totalDueLabel')
    expect(banner.find('.next-due-text').text()).toContain('¥133.60')
    // 副信息：第一个 remaining>0 的节点（线稿确认 ¥18.90）
    const sub = banner.find('.next-due-sub')
    expect(sub.exists()).toBe(true)
    expect(sub.text()).toContain('orderDetail.currentDueSuffix')
    expect(sub.text()).toContain('线稿确认')
    expect(sub.text()).toContain('¥18.90')
  })

  it('无节点订单（installments 为空）：只显示总额，无副信息', async () => {
    const { wrapper } = await mountDetail(buildOrder({ remainingCents: 5000, installments: [] }))
    const banner = wrapper.find('.next-due-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('¥50.00')
    expect(banner.find('.next-due-sub').exists()).toBe(false)
  })

  it('收齐（remainingCents = 0）：横幅不显示', async () => {
    const { wrapper } = await mountDetail(buildOrder({ remainingCents: 0, paid_total_cents: 31000, paidTotalCents: 31000 }))
    expect(wrapper.find('.next-due-banner').exists()).toBe(false)
  })

  it('无总价（remainingCents = null）：横幅不显示', async () => {
    const { wrapper } = await mountDetail(buildOrder({ remainingCents: null, final_price_cents: null, total_price_cents: null }))
    expect(wrapper.find('.next-due-banner').exists()).toBe(false)
  })

  it('终态（delivered）：横幅不显示（即使 remainingCents > 0）', async () => {
    const { wrapper } = await mountDetail(buildOrder({ status: 'delivered', remainingCents: 13360 }))
    expect(wrapper.find('.next-due-banner').exists()).toBe(false)
  })

  it('改价后总待收跟随（remainingCents 更新 → 横幅金额更新）', async () => {
    const order = buildOrder({ remainingCents: 13360 })
    const { wrapper, vm } = await mountDetail(order)
    expect(wrapper.find('.next-due-text').text()).toContain('¥133.60')
    // 模拟改价后后端返回新 remainingCents（总价 280 − 已收 176.40 = 103.60）
    vm.order.remainingCents = 10360
    await flushPromises()
    expect(wrapper.find('.next-due-text').text()).toContain('¥103.60')
  })
})

describe('OrderDetail 收款弹窗负数 label（REQ-025 二阶段 B 路）', () => {
  it('正数：备注 label 为「备注（可选）」键；负数：切换为「退款原因（必填）」键', async () => {
    const { wrapper, vm } = await mountDetail(buildOrder())
    // 打开收款弹窗
    vm.payDialogVisible = true
    await flushPromises()
    const labels = () => [...wrapper.findAll('.form-item-label')].map(l => l.text())
    // 正数（默认 null → 非负）
    expect(labels()).toContain('orderDetail.payNoteLabel')
    expect(labels()).not.toContain('orderDetail.payRefundNoteLabel')
    // 切负数
    vm.payForm.amountYuan = -5
    await flushPromises()
    expect(labels()).toContain('orderDetail.payRefundNoteLabel')
    expect(labels()).not.toContain('orderDetail.payNoteLabel')
    // 改回正数恢复
    vm.payForm.amountYuan = 50
    await flushPromises()
    expect(labels()).toContain('orderDetail.payNoteLabel')
  })
})

describe('OrderDetail 取消已收款订单确认流（R-2）', () => {
  beforeEach(() => {
    h.updateStatus.mockReset()
    h.updateStatus.mockResolvedValue({})
    h.cancelOrder.mockReset()
    h.cancelOrder.mockResolvedValue({})
    h.confirm.mockReset()
    h.confirm.mockResolvedValue('confirm')
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
  })

  it('未收款订单直接取消：一次请求、不带 confirmPaidCancel、不走二次确认', async () => {
    const order = buildOrder({ paidTotalCents: 0, remainingCents: 0 })
    const updated = { ...order, status: 'cancelled' }
    h.cancelOrder.mockResolvedValue(updated)
    await mountDetail(order)

    await h.slideConfirm.trigger!()
    await flushPromises()

    expect(h.cancelOrder).toHaveBeenCalledTimes(1)
    expect(h.cancelOrder).toHaveBeenCalledWith(806)
    expect(h.confirm).not.toHaveBeenCalled()
    expect(h.msgSuccess).toHaveBeenCalled()
  })

  it('已收款订单：第一次 409 → 弹确认（金额=detail.paidCents）→ 确认后带 confirmPaidCancel 重发成功', async () => {
    const order = buildOrder({ paidTotalCents: 17640 })
    const updated = { ...order, status: 'cancelled' }
    h.cancelOrder
      .mockRejectedValueOnce(Object.assign(new Error('blocked'), {
        code: 'CANCEL_WITH_PAYMENT',
        status: 409,
        detail: { paidCents: 17640 }
      }))
      .mockResolvedValue(updated)
    const { vm } = await mountDetail(order)

    await h.slideConfirm.trigger!()
    await flushPromises()

    // 确认框文案带金额（formatCents 17640 → ¥176.40）
    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect((h.confirm.mock.calls as unknown[][])[0][0]).toContain('orderDetail.cancelPaidConfirm')
    expect((h.confirm.mock.calls as unknown[][])[0][0]).toContain('"amount":"176.40"')

    // 用户点确认 → 第二次带 confirmPaidCancel
    expect(h.cancelOrder).toHaveBeenCalledTimes(2)
    expect(h.cancelOrder).toHaveBeenLastCalledWith(806, { confirmPaidCancel: true })
    expect(vm.order.status).toBe('cancelled')
    expect(h.msgSuccess).toHaveBeenCalled()
  })

  it('二次确认取消 → 不重发取消请求', async () => {
    const order = buildOrder({ paidTotalCents: 17640 })
    h.cancelOrder.mockRejectedValueOnce(Object.assign(new Error('blocked'), {
      code: 'CANCEL_WITH_PAYMENT',
      detail: { paidCents: 17640 }
    }))
    h.confirm.mockRejectedValueOnce('cancel')
    await mountDetail(order)

    await h.slideConfirm.trigger!()
    await flushPromises()

    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect(h.cancelOrder).toHaveBeenCalledTimes(1) // 没有第二次重发
    expect(h.msgSuccess).not.toHaveBeenCalled()
  })

  it('非 CANCEL_WITH_PAYMENT 错误 → 直接报错，不弹二次确认', async () => {
    const order = buildOrder({ paidTotalCents: 0 })
    h.cancelOrder.mockRejectedValueOnce(new Error('其他错误'))
    await mountDetail(order)

    await h.slideConfirm.trigger!()
    await flushPromises()

    expect(h.confirm).not.toHaveBeenCalled()
    expect(h.msgError).toHaveBeenCalledWith('其他错误')
    expect(h.cancelOrder).toHaveBeenCalledTimes(1)
  })
})

describe('OrderDetail loadOrder 竞态守卫（R-14）', () => {
  it('两次请求乱序返回：最终 order 为最后一次请求的结果', async () => {
    const stale = buildOrder({ order_no: 'STALE-001', paidTotalCents: 1000, remainingCents: 1000 })
    const fresh = buildOrder({ order_no: 'FRESH-001', paidTotalCents: 5000, remainingCents: 5000 })
    let resolveStale: ((value: OrderMock | PromiseLike<OrderMock>) => void) | undefined
    let resolveFresh: ((value: OrderMock | PromiseLike<OrderMock>) => void) | undefined
    const stalePromise = new Promise<OrderMock>(resolve => { resolveStale = resolve })
    const freshPromise = new Promise<OrderMock>(resolve => { resolveFresh = resolve })

    h.getOrder.mockReset()
      .mockReturnValueOnce(stalePromise) // mount 触发请求 #1
      .mockReturnValueOnce(freshPromise) // 手动触发请求 #2
    h.order = stale
    const { vm } = await mountDetail(stale)

    const secondLoad = vm.loadOrder()
    // 新请求先返回，旧请求后返回
    resolveFresh!(fresh)
    await flushPromises()
    resolveStale!(stale)
    await flushPromises()
    await secondLoad

    expect(vm.order.order_no).toBe('FRESH-001')
    expect(vm.order.paidTotalCents).toBe(5000)
    expect(h.getOrder).toHaveBeenCalledTimes(2)
  })

  it('晚到请求失败不弹错误（旧请求已过期）', async () => {
    const fresh = buildOrder({ order_no: 'FRESH-002', paidTotalCents: 5000, remainingCents: 5000 })
    let resolveFresh: ((value: OrderMock | PromiseLike<OrderMock>) => void) | undefined
    let rejectStale: ((reason?: unknown) => void) | undefined
    const stalePromise = new Promise<OrderMock>((_resolve, reject) => { rejectStale = reject })
    const freshPromise = new Promise<OrderMock>(resolve => { resolveFresh = resolve })

    h.getOrder.mockReset()
      .mockReturnValueOnce(stalePromise)
      .mockReturnValueOnce(freshPromise)
    h.order = fresh
    h.msgError.mockClear()
    const { vm } = await mountDetail(fresh)

    const secondLoad = vm.loadOrder()
    resolveFresh!(fresh)
    await flushPromises()
    rejectStale!(new Error('stale error'))
    await flushPromises()
    await secondLoad

    expect(vm.order.order_no).toBe('FRESH-002')
    expect(h.msgError).not.toHaveBeenCalled()
  })
})
