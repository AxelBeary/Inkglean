// 围剿 a1-2: ManualOrder QQ 历史防抖定时器离页清理 + 在途请求作废
// 覆盖：卸载清 qqTimer（未到期请求不再发出）；卸载递增 qqSeq（已发出的慢响应不再写已卸载组件）
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

interface OrdersResult {
  items: { id: number; client_qq: string }[]
}

interface ManualOrderVM {
  form: { clientQq: string }
  qqHistory: unknown[]
  $nextTick: () => Promise<void>
}

const h = vi.hoisted(() => ({
  profile: { subdomain: 'alice' },
  getOrders: vi.fn((): Promise<OrdersResult> => Promise.resolve({ items: [] }))
}))

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

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('element-plus')
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) },
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
  }
})

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: () => Promise.resolve(h.profile),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getOrders: h.getOrders,
    getToolsClient: () => Promise.resolve(null),
    createManualOrder: () => Promise.resolve({ id: 1, order_no: 'TEST-001' }),
    updatePrice: () => Promise.resolve({}),
    addExtraItem: () => Promise.resolve({}),
    updateDeadline: () => Promise.resolve({}),
    updateStartDate: () => Promise.resolve({}),
    advanceStage: () => Promise.resolve({}),
    updateStatus: () => Promise.resolve({})
  },
  artistPublicApi: {
    getPricing: () => Promise.resolve({ styles: [], installments: [], discountEnabled: false }),
    getPublicStyles: () => Promise.resolve([]),
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

function mountPage() {
  h.getOrders.mockClear()
  localStorage.clear()
  const wrapper = mount(ManualOrder, {
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
  return { wrapper, vm: wrapper.vm as unknown as ManualOrderVM }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ManualOrder QQ 历史定时器（a1-2）', () => {
  it('卸载清 qqTimer：未到期的 QQ 历史请求不再发出', async () => {
    const { wrapper, vm } = mountPage()
    await flushPromises()
    const callsBefore = h.getOrders.mock.calls.length

    vm.form.clientQq = '10001'
    await vm.$nextTick() // 确保 watcher 已运行、qqTimer 已排期
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(600)

    expect(h.getOrders.mock.calls.length).toBe(callsBefore)
  })

  it('卸载递增序号：已发出的慢响应不得写已卸载组件', async () => {
    let resolveOrders: ((value: OrdersResult) => void) | undefined
    h.getOrders.mockImplementationOnce(() => new Promise<OrdersResult>((resolve) => { resolveOrders = resolve }))
    const { wrapper, vm } = mountPage()
    await flushPromises()

    vm.form.clientQq = '10001'
    await vm.$nextTick()
    vi.advanceTimersByTime(500) // 防抖到期 → 请求发出并挂起
    await Promise.resolve()
    expect(h.getOrders).toHaveBeenCalled()

    wrapper.unmount()
    resolveOrders!({ items: [{ id: 1, client_qq: '10001' }] })
    await flushPromises()
    expect(vm.qqHistory).toHaveLength(0)
  })
})
