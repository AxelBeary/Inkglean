// CC-1 回归：手动录单「复合写」幂等——create 之后的后置写失败，重试不得再建一张订单
// 覆盖：
//   1. addExtraItem 失败 → emit submit-partial（带 failedSteps），不发 submit-success
//   2. 重提只重放失败步骤：createManualOrder 仍只调 1 次；增项派生键与首轮一致（服务端可去重）
//   3. 全链成功 → emit submit-success + 换新 key（下一次是新意图）
//   4. 上锁先于 await：同一时刻两次提交只发一次 create
//   5. B-1 回归：增项派生键必须是**服务端合规**的（长度 ≤64 且 [A-Za-z0-9-]），且不同增项互不相同——
//      PR #116 原先直接拼 `${idemKey}:extra:${uid}` = 82 字符 + 冒号，被 server readIdempotencyKey 判 400，
//      自定义增项永远写不进、重试永远失败。这组断言防再写坏。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ElInputNumber } from 'element-plus'
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
  extraCalls: [] as Array<{ priceCents: number; key: string }>,
  failExtra: false,
  styleCalc: null as Record<string, unknown> | null
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: {
    createManualOrder: (_data: unknown, opts: { headers: Record<string, string> }) => {
      h.createKeys.push(opts.headers['idempotency-key'])
      return Promise.resolve({ id: 1, order_no: 'TEST-001', quote_snapshot: null })
    },
    addExtraItem: (_id: number, data: { priceCents: number }, opts: { headers: Record<string, string> }) => {
      h.extraCalls.push({ priceCents: data.priceCents, key: opts.headers['idempotency-key'] })
      return h.failExtra ? Promise.reject(new Error('boom')) : Promise.resolve({})
    },
    updatePrice: () => Promise.resolve({}),
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

const MOCK_STYLE_CALC = {
  styleName: '厚涂', sizeName: '头像', baseCents: 10000,
  fixedAddonItems: [] as unknown[], percentAddonItems: [] as unknown[],
  subtotalCents: 10000, usage: null, rush: null,
  afterMultipliersCents: 10000, discount: null, totalCents: 10000
}

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

/** 选尺寸 → 等防抖算价完成 */
async function selectSizeAndWaitCalc(wrapper: ReturnType<typeof mountComp>) {
  await wrapper.find('.tier-card').trigger('click')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

/** 添加一条自定义增项（提交后走 addExtraItem 补写） */
async function addCustomAddon(wrapper: ReturnType<typeof mountComp>, name: string, priceYuan: number) {
  await wrapper.find('.mo-price-sticky .custom-addon-label button').trigger('click')
  await flushPromises()
  const editor = wrapper.find('.mo-price-sticky .custom-addon-editor')
  await editor.find('input').setValue(name)
  const numComp = editor.findComponent(ElInputNumber)
  await numComp.vm.$emit('update:modelValue', priceYuan)
  await editor.findAll('button').at(0)!.trigger('click')
  await flushPromises()
}

async function submitOnce(wrapper: ReturnType<typeof mountComp>) {
  await wrapper.find('.mo-submit-btn').trigger('click')
  await flushPromises()
}

describe('ManualOrderRight 复合写幂等回归（CC-1）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    h.createKeys = []
    h.extraCalls = []
    h.failExtra = false
    h.styleCalc = MOCK_STYLE_CALC
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('后置写失败 → submit-partial 不发 success；重提只补失败步骤，不再 create', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)
    await addCustomAddon(wrapper, '加急费', 50)

    h.failExtra = true
    await submitOnce(wrapper)

    expect(h.createKeys).toHaveLength(1)
    expect(wrapper.emitted('submit-success')).toBeUndefined()
    const partial = wrapper.emitted('submit-partial')
    expect(partial).toHaveLength(1)
    const payload = partial![0][0] as { order: { order_no: string }; failedSteps: string[] }
    expect(payload.order.order_no).toBe('TEST-001')
    expect(payload.failedSteps.join()).toContain('manualOrder.postCreateFailed.extraItem')

    // 重试：create 不重复（关键：不会建出第二张单），增项派生键与首轮一致 → 服务端可去重
    h.failExtra = false
    await submitOnce(wrapper)
    expect(h.createKeys).toHaveLength(1)
    expect(h.extraCalls).toHaveLength(2)
    expect(h.extraCalls[1].priceCents).toBe(5000)
    expect(h.extraCalls[1].key).toBe(h.extraCalls[0].key)
    // B-1：派生键必须合规（长度 ≤64、纯 [A-Za-z0-9-]），否则真服务端必 400
    for (const call of h.extraCalls) {
      expect(call.key.length).toBeLessThanOrEqual(64)
      expect(call.key).toMatch(/^[A-Za-z0-9-]+$/)
      expect(call.key).not.toContain(':')
    }
    expect(wrapper.emitted('submit-success')).toHaveLength(1)
    expect((wrapper.emitted('submit-success')![0][0] as { postCreateFailed: string | null }).postCreateFailed).toBeNull()

    wrapper.unmount()
  })

  it('B-1 回归：多条自定义增项的派生键各自合规且互不相同（不因共用 idemKey 被服务端合并）', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)
    await addCustomAddon(wrapper, '加急费', 50)
    await addCustomAddon(wrapper, '背景费', 80)

    await submitOnce(wrapper)
    expect(h.extraCalls).toHaveLength(2)
    // ① 两条都合规（≤64 + 服务端字符集）
    for (const call of h.extraCalls) {
      expect(call.key.length).toBeLessThanOrEqual(64)
      expect(call.key).toMatch(/^[A-Za-z0-9-]+$/)
    }
    // ② 必须按 uid 区分：若退化成同一个键，第二次会被服务端当成重放而**静默丢弃**（只加一项）
    expect(h.extraCalls[0].key).not.toBe(h.extraCalls[1].key)

    wrapper.unmount()
  })

  it('全链成功 → 下一次提交是新意图（换新 key）', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)

    await submitOnce(wrapper)
    await submitOnce(wrapper)

    expect(wrapper.emitted('submit-success')).toHaveLength(2)
    expect(h.createKeys).toHaveLength(2)
    expect(h.createKeys[1]).not.toBe(h.createKeys[0])

    wrapper.unmount()
  })

  it('上锁先于 await：同一时刻两次提交只发一次 create', async () => {
    const wrapper = mountComp()
    await flushPromises()
    await selectSizeAndWaitCalc(wrapper)

    const vm = wrapper.vm as unknown as { submit: () => Promise<void> }
    await Promise.all([vm.submit(), vm.submit()])
    await flushPromises()

    expect(h.createKeys).toHaveLength(1)

    wrapper.unmount()
  })
})
