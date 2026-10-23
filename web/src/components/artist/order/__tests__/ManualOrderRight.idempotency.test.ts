// 审计 #21 条目 3（PR #27 补口）回归：手动录单撞 409 IDEMPOTENCY_CONFLICT 后必须换新 key
// 覆盖：
//   1. createManualOrder 返回 409 → 下一次提交换新 idempotency-key（否则用户改完再点会一直撞同一个 409，直到刷新页面）
//   2. 非 409 失败（网络/其他 4xx）仍复用同 key——同一次意图的重试语义不变（对齐 useOrderForm/useOrderPayments 口径）
//   3. 提交成功 → key 置空，下一次是全新意图的新 key
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// happy-dom 无 ResizeObserver，Element Plus 内部可能用到
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Mocks（vi.mock 自动提升） ───
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) })
  }
})

const h = vi.hoisted(() => ({
  createKeys: [] as string[],
  createImpl: null as ((...args: unknown[]) => unknown) | null,
  styleCalc: null as Record<string, unknown> | null
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    createManualOrder: (_data: unknown, opts: { headers: Record<string, string> }) => {
      h.createKeys.push(opts.headers['idempotency-key'])
      return (h.createImpl ?? (() => Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null })))()
    },
    updatePrice: () => Promise.resolve({}),
    addExtraItem: () => Promise.resolve({}),
    updateDeadline: () => Promise.resolve({}),
    updateStartDate: () => Promise.resolve({}),
    advanceStage: () => Promise.resolve({}),
    updateStatus: () => Promise.resolve({}),
    addNote: () => Promise.resolve({})
  },
  artistPublicApi: {
    calculateStylePrice: () => Promise.resolve(h.styleCalc)
  }
}))

import ManualOrderRight from '../ManualOrderRight.vue'

const MOCK_STYLES = [
  {
    id: 11, name: '厚涂', description: null as string | null, cover_image: null as string | null, sort_order: 1,
    sizes: [
      {
        id: 111, name: '头像', base_price: 100, sort_order: 1,
        image: null as string | null, image_artwork_id: null as number | null,
        artwork_image_path: null as string | null, description: null as string | null,
        work_days: 3, display_status: 'available', addons: [] as unknown[]
      }
    ]
  }
]

function mountComp() {
  return mount(ManualOrderRight, {
    props: {
      styles: MOCK_STYLES as never[],
      subdomain: 'alice',
      validateForm: () => Promise.resolve(true),
      clientQq: '123456789'
    },
    global: {
      plugins: [ElementPlus],
      mocks: { $t: (key: string) => key },
      stubs: {
        'el-tooltip': { template: '<span><slot /></span>' },
        'el-icon': { template: '<span><slot /></span>' },
        transition: { template: '<div><slot /></div>' }
      }
    }
  })
}

function conflict409(): Error {
  return Object.assign(new Error('本次提交与此前已受理的提交内容不同'), { code: 'IDEMPOTENCY_CONFLICT' })
}

const MOCK_STYLE_CALC = {
  styleName: '厚涂', sizeName: '头像', baseCents: 10000,
  fixedAddonItems: [] as unknown[], percentAddonItems: [] as unknown[],
  subtotalCents: 10000, usage: null, rush: null,
  afterMultipliersCents: 10000, discount: null, totalCents: 10000
}

/** 选尺寸（画风模式提交守卫要求）→ 等防抖算价完成 */
async function selectSizeAndWaitCalc(wrapper: ReturnType<typeof mountComp>) {
  await wrapper.find('.tier-card').trigger('click')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

async function submitOnce(wrapper: ReturnType<typeof mountComp>) {
  await wrapper.find('.mo-submit-btn').trigger('click')
  await flushPromises()
}

describe('ManualOrderRight 幂等键 409 换 key 回归（PR #27 补口）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.createKeys = []
    h.createImpl = null
    h.styleCalc = MOCK_STYLE_CALC
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('撞 409 IDEMPOTENCY_CONFLICT 后重提 → 换新 key（不再一直撞同一个 409）', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)

    h.createImpl = () => Promise.reject(conflict409())
    await submitOnce(wrapper)
    expect(h.createKeys).toHaveLength(1)

    h.createImpl = () => Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null })
    await submitOnce(wrapper)
    expect(h.createKeys).toHaveLength(2)
    expect(h.createKeys[1]).not.toBe(h.createKeys[0])

    wrapper.unmount()
  })

  it('非 409 失败仍复用同 key——同一次意图的重试语义不变', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)

    h.createImpl = () => Promise.reject(Object.assign(new Error('boom'), { code: 'VALIDATION' }))
    await submitOnce(wrapper)
    h.createImpl = () => Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null })
    await submitOnce(wrapper)

    expect(h.createKeys).toHaveLength(2)
    expect(h.createKeys[1]).toBe(h.createKeys[0])

    wrapper.unmount()
  })

  it('提交成功后 key 置空，下一次提交是新 key（新意图）', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)

    h.createImpl = () => Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null })
    await submitOnce(wrapper)
    await submitOnce(wrapper)

    expect(h.createKeys).toHaveLength(2)
    expect(h.createKeys[1]).not.toBe(h.createKeys[0])

    wrapper.unmount()
  })
})
