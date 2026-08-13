// 围剿 a1-8/a1-9: Watermark 订单切换与预览合成请求序号——慢响应/慢合成不得覆盖新选择/新预览
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

const h = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getAllOrders: vi.fn(),
  getArtworks: vi.fn(),
  compose: vi.fn(),
  loadImage: vi.fn()
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ profile: { id: 1 }, artistName: '画师A' })
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getOrder: h.getOrder,
    getAllOrders: h.getAllOrders,
    getArtworks: h.getArtworks
  }
}))

vi.mock('../../../utils/watermark.js', () => ({
  WM_POSITIONS: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
  WM_POSITION_CORNERS: 'corners',
  loadImage: h.loadImage,
  composeWatermarked: h.compose
}))

vi.mock('../../../utils/storage.js', () => ({
  safeGetItem: () => null,
  safeSetItem: () => {}
}))

import Watermark from '../Watermark.vue'

function mountWatermark() {
  return shallowMount(Watermark, {
    global: {
      mocks: { $t: (key) => key },
      directives: { loading: () => {} }
    }
  })
}

describe('Watermark 竞态守卫（a1-8/a1-9）', () => {
  beforeEach(() => {
    h.getOrder.mockReset()
    h.compose.mockReset()
    h.loadImage.mockReset()
  })

  it('a1-8: 订单下拉快切时慢响应不覆盖新选中订单的完稿图', async () => {
    const deferreds = []
    h.getOrder.mockImplementation(() => new Promise((resolve) => {
      deferreds.push(resolve)
    }))
    const wrapper = mountWatermark()

    const p1 = wrapper.vm.onOrderChange(1)
    const p2 = wrapper.vm.onOrderChange(2)

    // 后选订单先返回
    deferreds[1]({ id: 2, deliverables: [{ id: 'D2' }] })
    await flushPromises()
    expect(wrapper.vm.deliverables.map(d => d.id)).toEqual(['D2'])
    expect(wrapper.vm.deliverablesLoading).toBe(false)

    // 旧订单慢返回 → 丢弃
    deferreds[0]({ id: 1, deliverables: [{ id: 'D1' }] })
    await flushPromises()
    expect(wrapper.vm.deliverables.map(d => d.id)).toEqual(['D2'])
    expect(wrapper.vm.src).toBe('')

    await Promise.all([p1, p2])
  })

  it('a1-9: 预览合成慢响应不覆盖新预览', async () => {
    const deferreds = []
    h.compose.mockImplementation(() => new Promise((resolve) => {
      deferreds.push(resolve)
    }))
    const wrapper = mountWatermark()
    wrapper.vm.src = '/uploads/a.png'

    const p1 = wrapper.vm.renderPreview()
    wrapper.vm.src = '/uploads/b.png'
    const p2 = wrapper.vm.renderPreview()

    deferreds[1]('data:b')
    await flushPromises()
    expect(wrapper.vm.previewDataUrl).toBe('data:b')

    deferreds[0]('data:a')
    await flushPromises()
    expect(wrapper.vm.previewDataUrl).toBe('data:b')

    await Promise.all([p1, p2])
  })

  it('a1-8/9: 卸载后在途合成响应作废（不写已卸载组件）', async () => {
    const deferreds = []
    h.compose.mockImplementation(() => new Promise((resolve) => {
      deferreds.push(resolve)
    }))
    const wrapper = mountWatermark()
    wrapper.vm.src = '/uploads/a.png'
    const p = wrapper.vm.renderPreview()

    wrapper.unmount()
    deferreds[0]('data:late')
    await flushPromises()

    expect(wrapper.vm.previewDataUrl).toBe('')
    await p
  })
})
