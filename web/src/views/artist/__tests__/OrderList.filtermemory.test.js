// OrderList.filtermemory.test.js
// E9（2026-08-14）: 订单列表筛选记忆
// 覆盖：①记忆恢复（无 URL 时按 localStorage 上次的筛选加载）
//       ②筛选变更写入记忆 ③URL ?status= 优先于记忆并写入记忆
//       ④脏存储形状静默回落全部 ⑤单选与复合互斥恢复
// mock 基建对齐 OrderList.composite.test.js。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ─── Mocks ───
const routeHolder = vi.hoisted(() => ({ query: {} }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: routeHolder.query }),
  useRouter: () => ({ push: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key) })
}))

const h = vi.hoisted(() => ({
  getOrders: vi.fn(),
  msgError: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: h.msgError }
}))

function buildOrder(id, overrides = {}) {
  return {
    id,
    order_no: `ALICE-${String(id).padStart(3, '0')}`,
    status: 'wip',
    priority: 'medium',
    source: 'self',
    client_qq: '10001',
    client_name: 'test',
    tier_name: 'Q版',
    created_at: '2026-08-05 00:44',
    focus_image_path: null,
    ...overrides
  }
}

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getOrders: h.getOrders
  }
}))

vi.mock('../../../components/artist/visual/InkEmpty.vue', () => ({
  default: { name: 'InkEmpty', template: '<div class="ink-empty" />' }
}))
vi.mock('../../../components/shared/HySkeleton.vue', () => ({
  default: { name: 'HySkeleton', template: '<div class="hy-skeleton" />' }
}))

import OrderList from '../OrderList.vue'

const MEM_KEY = 'orderlist_filter_memory'

async function mountOrderList() {
  const wrapper = mount(OrderList, {
    global: {
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        $tm: (key) => [key]
      },
      stubs: {
        'el-card': { template: '<div><slot /><slot name="header" /></div>' },
        'el-button': { inheritAttrs: false, template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
        'el-tag': { template: '<span><slot /></span>' },
        'el-input': { template: '<input />' },
        'el-table': { template: '<div><slot /></div>' },
        'el-table-column': { template: '<div />' },
        'el-radio-group': { template: '<div><slot /></div>' },
        'el-radio-button': { template: '<label><slot /></label>' },
        'el-progress': { template: '<div class="el-progress" />' },
        'el-pagination': { template: '<div />' },
        'el-image': { template: '<img />' },
        'el-icon': { template: '<i><slot /></i>' },
        'router-link': { template: '<a><slot /></a>' },
        Teleport: { template: '<div><slot /></div>' },
        Plus: true,
        Search: true,
        Picture: true
      }
    }
  })
  await flushPromises()
  return wrapper
}

describe('OrderList 筛选记忆（E9）', () => {
  beforeEach(() => {
    h.getOrders.mockReset()
    h.msgError.mockClear()
    routeHolder.query = {}
    localStorage.clear()
    h.getOrders.mockResolvedValue({ items: [buildOrder(1)], total: 1 })
  })

  it('无 URL 参数时按记忆值恢复筛选（wip）', async () => {
    localStorage.setItem(MEM_KEY, JSON.stringify({ filter: 'wip', composite: '' }))
    await mountOrderList()
    expect(h.getOrders).toHaveBeenCalledTimes(1)
    expect(h.getOrders.mock.calls[0][0]).toBe('wip')
  })

  it('手动切筛选写入记忆', async () => {
    const wrapper = await mountOrderList()
    wrapper.vm.filter = 'done'
    wrapper.vm.onFilterChange()
    await flushPromises()
    expect(JSON.parse(localStorage.getItem(MEM_KEY))).toEqual({ filter: 'done', composite: '' })
  })

  it('URL ?status= 优先于记忆值，并回写记忆', async () => {
    localStorage.setItem(MEM_KEY, JSON.stringify({ filter: 'wip', composite: '' }))
    routeHolder.query = { status: 'pending' }
    await mountOrderList()
    expect(h.getOrders.mock.calls[0][0]).toBe('pending')
    expect(JSON.parse(localStorage.getItem(MEM_KEY)).filter).toBe('pending')
  })

  it('脏存储形状静默回落全部（不崩页）', async () => {
    localStorage.setItem(MEM_KEY, '{这不是JSON')
    await mountOrderList()
    expect(h.msgError).not.toHaveBeenCalled()
    expect(h.getOrders.mock.calls[0][0]).toBeUndefined() // 全部：status undefined
    // 白名单外的枚举同样不信任
    localStorage.setItem(MEM_KEY, JSON.stringify({ filter: 'evil;drop', composite: 'nope' }))
    h.getOrders.mockClear()
    await mountOrderList()
    expect(h.getOrders.mock.calls[0][0]).toBeUndefined()
  })

  it('复合筛选记忆恢复（无单选时生效）+ 单选存在时复合作废', async () => {
    localStorage.setItem(MEM_KEY, JSON.stringify({ filter: '', composite: 'active' }))
    const wrapper = await mountOrderList()
    expect(wrapper.vm.compositeFilter).toBe('active')

    localStorage.setItem(MEM_KEY, JSON.stringify({ filter: 'wip', composite: 'active' }))
    const wrapper2 = await mountOrderList()
    expect(wrapper2.vm.filter).toBe('wip')
    expect(wrapper2.vm.compositeFilter).toBe('')
  })
})
