// 围剿 a1-3: OrderDetail 优先级点选即保存——快切时旧响应不得写共享 prevPriority / 回滚过期快照
// 基建沿用 OrderDetail.loadfail.test.js 同款 mock（api/router/element-plus/composables）
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

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '806' }, query: {} }),
  useRouter: () => ({ push: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

const h = vi.hoisted(() => ({
  order: null as ReturnType<typeof buildOrder> | null,
  getOrder: vi.fn(() => Promise.resolve(h.order)),
  updatePriority: vi.fn(),
  updateStatus: vi.fn(() => Promise.resolve({})),
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
    updatePriority: h.updatePriority,
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
  useSlideConfirm: (opts: { onConfirm?: (() => void) | null }) => {
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

interface Deferred<T> {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface OrderDetailVM {
  order: { priority: string }
  prevPriority: string | null
  changePriority: (priority: string) => Promise<void>
}

async function mountDetail(order: ReturnType<typeof buildOrder> | null) {
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
        'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
        'el-tag': { template: '<span><slot /></span>' },
        'el-input': { template: '<input />' },
        'el-form': { template: '<div><slot /></div>' },
        'el-form-item': { template: '<div><slot /></div>' },
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
  return wrapper.vm as unknown as OrderDetailVM
}

describe('OrderDetail 优先级快切守卫（a1-3）', () => {
  beforeEach(() => {
    h.getOrder.mockReset()
    h.getOrder.mockImplementation(() => Promise.resolve(h.order))
    h.updatePriority.mockReset()
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
  })

  it('后发先至：旧响应不得覆盖 prevPriority，最新失败回滚到最新基线', async () => {
    const vm = await mountDetail(buildOrder())
    const deferreds: Deferred<void>[] = []
    h.updatePriority.mockImplementation(() => new Promise<void>((resolve, reject) => {
      deferreds.push({ resolve, reject })
    }))

    // 快切：high（seq1）→ low（seq2）
    vm.order.priority = 'high'
    const p1 = vm.changePriority('high')
    vm.order.priority = 'low'
    const p2 = vm.changePriority('low')

    // 后发的 low 先成功 → 基线为 low
    deferreds[1].resolve()
    await flushPromises()
    expect(vm.prevPriority).toBe('low')
    expect(h.msgSuccess).toHaveBeenCalledTimes(1)

    // 先发的 high 随后成功 → 序号守卫丢弃，不得把基线改回 high
    deferreds[0].resolve()
    await flushPromises()
    expect(vm.prevPriority).toBe('low')
    expect(h.msgSuccess).toHaveBeenCalledTimes(1)

    // 最新一次（high）失败 → 回滚到最新基线 low，不弹旧快照
    vm.order.priority = 'high'
    const p3 = vm.changePriority('high')
    deferreds[2].reject(new Error('save boom'))
    await flushPromises()
    expect(vm.order.priority).toBe('low')
    expect(h.msgError).toHaveBeenCalledWith('save boom')

    await Promise.all([p1, p2, p3])
  })
})
