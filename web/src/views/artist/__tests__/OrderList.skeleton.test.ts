// OrderList 加载期骨架形态回归（#58 返工 3）
// 原缺陷：骨架只有行式一种形态，而 ≤768px 容器档的内容整体换成 .order-cards 卡片视图
// ——行式骨架在窄屏与内容不同形；且那次改动把 HySkeleton 的 import 一并删了。
// 现口径：行式 + 卡片式两副骨架同时挂载，由与内容同一个容器查询互斥显示。
// 注：jsdom 不解析 @container，本测试钉的是「两副都在、表格不在」这个结构前提。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: () => {} })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({ getOrders: vi.fn() }))
vi.mock('../../../api/index.js', () => ({ artistApi: { getOrders: h.getOrders } }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('../../../components/artist/visual/InkEmpty.vue', () => ({
  default: { name: 'InkEmpty', template: '<div class="ink-empty" />' }
}))
// 真实 HySkeleton（要断言它确实进了卡片档骨架，而不是被 stub 掉）
import HySkeleton from '../../../components/shared/HySkeleton.vue'

import OrderList from '../OrderList.vue'

const STUBS = {
  'el-card': { template: '<div><slot /><slot name="header" /></div>' },
  'el-button': { inheritAttrs: false, template: '<button><slot /></button>' },
  'el-dialog': { template: '<div v-if="modelValue"><slot /></div>', props: ['modelValue'] },
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

function mountLoadingList() {
  // 请求挂起：组件停在 loading=true
  h.getOrders.mockReturnValue(new Promise(() => {}))
  return mount(OrderList, {
    global: {
      mocks: { $t: (key: string) => key, $tm: () => [] },
      stubs: { ...STUBS, HySkeleton: false }
    }
  })
}

describe('OrderList 加载期骨架', () => {
  beforeEach(() => {
    h.getOrders.mockReset()
    localStorage.clear()
  })

  it('loading 期行式骨架出 6 行，且带表头占位（表格档镜像）', () => {
    const w = mountLoadingList()
    const rows = w.findAll('.order-skeleton-row')
    expect(rows).toHaveLength(6)
    expect(w.find('.order-skeleton-rows').exists()).toBe(true)
    expect(w.find('.order-skeleton-head').exists()).toBe(true)
  })

  it('loading 期卡片档骨架在场（HySkeleton 未被摘掉），窄容器查询才有东西可显', () => {
    const w = mountLoadingList()
    const cards = w.find('.order-skeleton-cards')
    expect(cards.exists()).toBe(true)
    expect(cards.findComponent(HySkeleton).exists()).toBe(true)
    expect(cards.findAll('.hy-skeleton-card')).toHaveLength(6)
  })

  it('请求落地后两副骨架一起撤场，表格接管（骨架不是常驻层）', async () => {
    h.getOrders.mockResolvedValue({ items: [{ id: 1, order_no: 'A-1', status: 'wip', priority: 'medium', source: 'self', client_qq: '10001', client_name: 'test', tier_name: 'Q版', created_at: '2026-08-05 00:44', focus_image_path: null }], total: 1 })
    const w = mount(OrderList, {
      global: {
        mocks: { $t: (key: string) => key, $tm: () => [] },
        stubs: { ...STUBS, HySkeleton: false }
      }
    })
    await flushPromises()
    expect(w.find('.order-skeleton-rows').exists()).toBe(false)
    expect(w.find('.order-skeleton-cards').exists()).toBe(false)
    expect(w.find('.order-table-wrap').exists()).toBe(true)
  })
})
