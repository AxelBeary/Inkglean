// 价目分享卡挂载测试（812 工具波 B ④）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import PriceCard from '../PriceCard.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

// happy-dom 无 canvas 2d 实现：统一 stub，避免预览/导出路径抛错
function canvasContextStub() {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'canvas') return { width: 0, height: 0 }
      return () => undefined
    },
    set() {
      return true
    }
  })
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub())
  localStorage.clear()
})

function mountPriceCard() {
  return mount(PriceCard, {
    global: {
      mocks: {
        $t: (key) => key,
        $tm: () => []
      }
    }
  })
}

describe('PriceCard 价目分享卡', () => {
  it('挂载后渲染标题与默认 3 行档位', () => {
    const wrapper = mountPriceCard()
    expect(wrapper.find('.od-page-title').text()).toBe('priceCard.title')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3)
  })

  it('档位行可加至 6 行、至少保留 3 行', async () => {
    const wrapper = mountPriceCard()
    const addBtn = wrapper.find('.pc-btn--ghost')
    for (let i = 0; i < 3; i++) {
      await addBtn.trigger('click')
    }
    expect(wrapper.findAll('.pc-tier')).toHaveLength(6)
    expect(addBtn.attributes('disabled')).toBeDefined()

    await wrapper.findAll('.pc-mini-btn')[0].trigger('click')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(5)
  })

  it('从 localStorage 恢复草稿标题', async () => {
    localStorage.setItem('huiyue_price_card_draft', JSON.stringify({
      title: '头像 · 立绘价目',
      contact: 'QQ 123456',
      tiers: [
        { id: 'a', name: '头像', priceYuan: 80, note: '大头' },
        { id: 'b', name: '半身', priceYuan: 160, note: '' },
        { id: 'c', name: '全身', priceYuan: 300, note: '含背景' }
      ],
      exampleThumb: ''
    }))
    const wrapper = mountPriceCard()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#pc-title').element.value).toBe('头像 · 立绘价目')
    expect(wrapper.findAll('.pc-tier')).toHaveLength(3)
  })

  it('复制纯文字版使用 formatYuan 金额格式', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    const wrapper = mountPriceCard()
    wrapper.vm.form.title = '头像价目'
    wrapper.vm.form.tiers[0].name = '头像'
    wrapper.vm.form.tiers[0].priceYuan = 120
    wrapper.vm.form.tiers[1].name = '半身'
    wrapper.vm.form.tiers[1].priceYuan = 200
    wrapper.vm.form.tiers[2].name = '全身'
    wrapper.vm.form.tiers[2].priceYuan = 350
    await wrapper.vm.copyText()

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0]
    expect(text).toContain('头像价目')
    expect(text).toContain('¥120.00')
    expect(text).toContain('¥350.00')
  })
})
