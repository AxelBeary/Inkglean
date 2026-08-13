// ManualOrder 多标签草稿互害测试（G-4 / R-17）
// 覆盖：storage 事件——未修改静默同步、已修改不打断（last-edit-wins）、
//       他标签页清除信号重置本地草稿状态、提交成功清草稿（广播源）+ 幂等键 header 透传
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// happy-dom 无 ResizeObserver，Element Plus 内部可能用到，补齐
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// crypto.randomUUID（提交意图幂等键用；Node 低版本无全局暴露时兜底）
if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: { ...(globalThis.crypto || {}), randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    configurable: true
  })
}

const h = vi.hoisted(() => ({
  profile: { subdomain: 'alice' },
  created: null,
  createdOptions: null
}))

// 部分 mock：保留真实 createI18n（stores/artist 顶层 import i18n/index 需初始化），仅覆写 useI18n
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
    ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) },
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
  }
})

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: () => Promise.resolve(h.profile),
    getWorkflow: () => Promise.resolve({ stages: [] }),
    getOrders: () => Promise.resolve({ items: [] }),
    createManualOrder: (data, options) => {
      h.created = data
      h.createdOptions = options
      return Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null })
    },
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

const DRAFT_KEY = 'huiyue_manual_order_draft_alice'

function draftPayload(clientName = 'Remote') {
  return JSON.stringify({
    form: {
      clientQq: '10001',
      clientName,
      description: '',
      priority: 'medium',
      deadline: null,
      startDate: null,
      clientNotify: false
    },
    styleState: {},
    customAddons: [],
    finalPriceYuan: null,
    priceTouched: false
  })
}

function dispatchStorage(key, newValue) {
  const ev = new Event('storage')
  Object.defineProperty(ev, 'key', { value: key })
  Object.defineProperty(ev, 'newValue', { value: newValue })
  window.dispatchEvent(ev)
}

function mountPage() {
  h.created = null
  h.createdOptions = null
  localStorage.clear()
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

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ManualOrder 多标签草稿（G-4）', () => {
  it('storage 事件（他标签页草稿变更）→ 本页未被修改则静默同步表单并落盘', async () => {
    const wrapper = mountPage()
    await flushPromises()

    dispatchStorage(DRAFT_KEY, draftPayload('Remote'))
    await flushPromises()
    await vi.advanceTimersByTimeAsync(800)

    expect(wrapper.vm.form.clientQq).toBe('10001')
    expect(wrapper.vm.form.clientName).toBe('Remote')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
    wrapper.unmount()
  })

  it('storage 事件 → 本页已被用户修改则不打断（last-edit-wins）', async () => {
    const wrapper = mountPage()
    await flushPromises()

    // 先远端同步一版
    dispatchStorage(DRAFT_KEY, draftPayload('Remote1'))
    await flushPromises()
    expect(wrapper.vm.form.clientName).toBe('Remote1')

    // 用户本地修改
    wrapper.vm.form.clientName = 'LocalEdit'
    await flushPromises()

    // 他标签页又来一版 → 不覆盖本地正在编辑的内容
    dispatchStorage(DRAFT_KEY, draftPayload('Remote2'))
    await flushPromises()
    expect(wrapper.vm.form.clientName).toBe('LocalEdit')
    wrapper.unmount()
  })

  it('清除信号（他标签页提交清草稿）→ 本页重置本地草稿状态（防重复提交）', async () => {
    const wrapper = mountPage()
    await flushPromises()

    dispatchStorage(DRAFT_KEY, draftPayload())
    await flushPromises()
    expect(wrapper.vm.form.clientQq).toBe('10001')

    dispatchStorage(DRAFT_KEY, null)
    await flushPromises()
    expect(wrapper.vm.form.clientQq).toBe('')
    expect(wrapper.vm.form.clientName).toBe('')
    wrapper.unmount()
  })

  it('提交成功清草稿（storage 天然广播源）且幂等键 header 随提交携带', async () => {
    const wrapper = mountPage()
    await flushPromises()

    dispatchStorage(DRAFT_KEY, draftPayload())
    await flushPromises()
    await vi.advanceTimersByTimeAsync(800) // 等防抖落盘
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()

    await wrapper.find('.mo-submit-btn').trigger('click')
    await flushPromises()

    expect(h.created).not.toBeNull()
    expect(h.created.clientQq).toBe('10001')
    // G-4（D-2 契约衔接）: 提交意图幂等键随 header 携带
    expect(h.createdOptions.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    wrapper.unmount()
  })
})
