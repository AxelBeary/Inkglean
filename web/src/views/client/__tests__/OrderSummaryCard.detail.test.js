// OrderSummaryCard 档位说明+示意图测试（E13：尺寸行下方补显描述/工期/示意图）
// 覆盖：有描述+工期 / 有示意图（含字段优先级）/ 全空三渲染分支
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

import OrderSummaryCard from '../order-form/OrderSummaryCard.vue'

function mountCard(selectedSize) {
  return mount(OrderSummaryCard, {
    props: {
      clientName: '',
      description: '',
      isStyleMode: true,
      selectedStyle: { id: 1, name: '厚涂' },
      selectedSize,
      preview: null,
      installments: [],
      displayPrice: selectedSize?.base_price ?? 0
    },
    global: { mocks: { $t: (key) => key } }
  })
}

const baseSize = { id: 111, name: '半身', base_price: 200 }

describe('OrderSummaryCard 档位说明+示意图（E13）', () => {
  it('有描述+工期：尺寸行下方渲染描述与「约 N 天」，无图块', () => {
    const wrapper = mountCard({ ...baseSize, description: '半身彩绘', work_days: 5 })

    const detail = wrapper.find('.summary-size-detail')
    expect(detail.exists()).toBe(true)
    expect(detail.find('.summary-size-desc').text()).toBe('半身彩绘')
    const days = detail.find('.summary-size-days')
    expect(days.text()).toContain('orderForm.summaryWorkDays')
    expect(days.text()).toContain('"n":5')
    expect(detail.find('.summary-size-img').exists()).toBe(false)
  })

  it('有示意图：渲染缩略图（artwork_image_path 优先于 image）', () => {
    const wrapper = mountCard({
      ...baseSize,
      image: 'sizes/standalone.png',
      artwork_image_path: 'artworks/cover.png'
    })

    const img = wrapper.find('.summary-size-img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/uploads/artworks/cover.png')
    expect(img.attributes('alt')).toBe('orderForm.summarySizeImgAlt')
  })

  it('仅 image 字段：回退独立上传图', () => {
    const wrapper = mountCard({ ...baseSize, image: 'sizes/standalone.png' })
    expect(wrapper.find('.summary-size-img').attributes('src')).toBe('/uploads/sizes/standalone.png')
  })

  it('全空（无描述/无工期/无图）：补显块整体不渲染，既有摘要结构不变', () => {
    const wrapper = mountCard({ ...baseSize })

    expect(wrapper.find('.summary-size-detail').exists()).toBe(false)
    // 尺寸行与价格照常
    expect(wrapper.find('.summary-lines').text()).toContain('半身')
  })

  it('纯空白描述视为空：描述块不渲染', () => {
    const wrapper = mountCard({ ...baseSize, description: '   ', work_days: 3 })

    const detail = wrapper.find('.summary-size-detail')
    expect(detail.exists()).toBe(true) // 工期仍在
    expect(detail.find('.summary-size-desc').exists()).toBe(false)
    expect(detail.find('.summary-size-days').exists()).toBe(true)
  })
})
