// 围剿 a1-15: PuzzlePage 订单切换请求序号——慢的旧订单响应不得覆盖新选中订单
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const h = vi.hoisted(() => ({
  getAllOrders: vi.fn(),
  getOrder: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: h.msgError, success: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../api/index.js', () => ({
  artistApi: {
    getAllOrders: h.getAllOrders,
    getOrder: h.getOrder
  }
}))

import PuzzlePage from '../PuzzlePage.vue'

async function mountPuzzle() {
  h.getAllOrders.mockResolvedValue([{ id: 1, order_no: 'A', tier_name: 'T', client_name: 'x' }])
  const wrapper = shallowMount(PuzzlePage, {
    global: {
      mocks: { $t: (key) => key, $tm: () => [] }
    }
  })
  await flushPromises()
  return wrapper
}

describe('PuzzlePage 订单切换守卫（a1-15）', () => {
  beforeEach(() => {
    h.getAllOrders.mockReset()
    h.getOrder.mockReset()
    h.msgError.mockClear()
  })

  it('快切订单：慢的旧订单响应不覆盖新选中订单', async () => {
    const deferreds = []
    h.getOrder.mockImplementation(() => new Promise((resolve) => {
      deferreds.push(resolve)
    }))
    const wrapper = await mountPuzzle()

    const p1 = wrapper.vm.onOrderChange(1)
    const p2 = wrapper.vm.onOrderChange(2)

    // 新订单先返回 → 展示新订单
    deferreds[1]({ id: 2, order_no: 'B', deliverables: [], references: [] })
    await flushPromises()
    expect(wrapper.vm.order.id).toBe(2)

    // 旧订单慢返回 → 丢弃
    deferreds[0]({ id: 1, order_no: 'A', deliverables: [], references: [] })
    await flushPromises()
    expect(wrapper.vm.order.id).toBe(2)

    await Promise.all([p1, p2])
  })

  it('旧订单失败（已被新选中取代）不弹错误', async () => {
    const deferreds = []
    h.getOrder.mockImplementation(() => new Promise((resolve, reject) => {
      deferreds.push({ resolve, reject })
    }))
    const wrapper = await mountPuzzle()

    const p1 = wrapper.vm.onOrderChange(1)
    const p2 = wrapper.vm.onOrderChange(2)
    deferreds[1].resolve({ id: 2, order_no: 'B', deliverables: [], references: [] })
    await flushPromises()
    deferreds[0].reject(new Error('stale boom'))
    await flushPromises()

    expect(wrapper.vm.order.id).toBe(2)
    expect(h.msgError).not.toHaveBeenCalled()

    await Promise.all([p1, p2])
  })
})
