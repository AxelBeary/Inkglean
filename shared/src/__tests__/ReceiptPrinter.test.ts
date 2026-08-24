// F4 小票哑组件挂载测试（shared-824 搬家批）
// 口径对齐 web 既有挂载测试：happy-dom + canvas Proxy stub；t 桩 (k)=>k；initialDraft=null
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ReceiptPrinter from '../components/ReceiptPrinter.vue'
import type { ReceiptDraft } from '../index'

// happy-dom 无 canvas 2d：统一 stub（口径照抄 web 现有挂载测试）
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
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContextStub()) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

const t = (key: string) => key

function mountReceipt(props: Record<string, unknown> = {}) {
  return mount(ReceiptPrinter, { props: { t, initialDraft: null, ...props } })
}

/** 取最后一次 draft-change 的 payload */
function lastDraft(wrapper: ReturnType<typeof mountReceipt>): ReceiptDraft {
  const evts = wrapper.emitted('draft-change')
  expect(evts, 'draft-change 应已发出').toBeTruthy()
  return evts![evts!.length - 1][0] as ReceiptDraft
}

function lastNotify(wrapper: ReturnType<typeof mountReceipt>): { kind: string; text: string } {
  const evts = wrapper.emitted('notify')
  expect(evts, 'notify 应已发出').toBeTruthy()
  return evts![evts!.length - 1][0] as { kind: string; text: string }
}

describe('ReceiptPrinter 小票哑组件（shared）', () => {
  it('挂载渲染标题与默认 2 行制品', () => {
    const wrapper = mountReceipt()
    expect(wrapper.find('.od-page-title').text()).toBe('receipt.title')
    expect(wrapper.findAll('.rc-item')).toHaveLength(2)
  })

  it('制品行可加至 10 行、减至 1 行钳制', async () => {
    const wrapper = mountReceipt()
    const addBtn = wrapper.find('.rc-btn--ghost')
    for (let i = 0; i < 8; i++) await addBtn.trigger('click')
    expect(wrapper.findAll('.rc-item')).toHaveLength(10)
    expect(wrapper.find('.rc-btn--ghost').attributes('disabled')).toBeDefined()
    await wrapper.find('.rc-btn--ghost').trigger('click')
    expect(wrapper.findAll('.rc-item')).toHaveLength(10) // 上限钳制

    for (let i = 0; i < 9; i++) await wrapper.find('.rc-mini-btn').trigger('click')
    expect(wrapper.findAll('.rc-item')).toHaveLength(1)
    await wrapper.find('.rc-mini-btn').trigger('click')
    expect(wrapper.findAll('.rc-item')).toHaveLength(1) // 下限钳制
  })

  it('表单改动产出 draft-change（含 title/items/style）', async () => {
    const wrapper = mountReceipt()
    await wrapper.find('#rc-title').setValue('星野的小铺')
    const draft = lastDraft(wrapper)
    expect(draft.title).toBe('星野的小铺')
    expect(draft.items).toHaveLength(2)
    expect(draft.style).toBe('retro')
    expect(draft.discountType).toBe('none')
  })

  it('样式分段切换（retro → hand）走自绘分段控件', async () => {
    const wrapper = mountReceipt()
    // 第一组 .rc-seg 是折扣，第二组是样式
    const styleSeg = wrapper.findAll('.rc-seg')[1]
    const handBtn = styleSeg.findAll('.rc-seg-btn')[2]
    expect(styleSeg.findAll('.rc-seg-btn')[0].attributes('aria-pressed')).toBe('true')
    await handBtn.trigger('click')
    expect(wrapper.findAll('.rc-seg')[1].findAll('.rc-seg-btn')[2].attributes('aria-pressed')).toBe('true')
    expect(lastDraft(wrapper).style).toBe('hand')
  })

  it('复制产出 copy-text，文本含金额格式（¥）与分隔线', async () => {
    const wrapper = mountReceipt()
    await wrapper.findAll('.rc-item-name')[0].setValue('头像')
    await wrapper.findAll('.rc-item-price')[0].setValue('100')
    await wrapper.findAll('.rc-actions button')[1].trigger('click') // 第二枚 = 复制纯文字版
    const evts = wrapper.emitted('copy-text')
    expect(evts).toBeTruthy()
    const { text } = evts![0][0] as { text: string }
    expect(text).toContain('¥100.00')
    expect(text).toContain('────────────')
    expect(wrapper.emitted('notify')).toBeFalsy() // 成功/失败提示归宿主，组件不发
  })

  it('制品为空导出 → notify warning，不出 export-png', async () => {
    const wrapper = mountReceipt()
    await wrapper.findAll('.rc-actions button')[0].trigger('click') // 第一枚 = 导出
    expect(lastNotify(wrapper)).toEqual({ kind: 'warning', text: 'receipt.itemsRequired' })
    expect(wrapper.emitted('export-png')).toBeFalsy()
  })

  it('initialDraft 挂载消费：标题/制品/样式回显', async () => {
    const draft: ReceiptDraft = {
      title: '星野的小铺',
      items: [{ name: '头像', qty: 2, priceYuan: 80, gift: false }],
      discountType: 'none',
      discountValue: 0,
      depositYuan: null,
      bottomNote: '',
      style: 'hand'
    }
    const wrapper = mountReceipt({ initialDraft: draft })
    await wrapper.vm.$nextTick()
    expect((wrapper.find('#rc-title').element as HTMLInputElement).value).toBe('星野的小铺')
    expect(wrapper.findAll('.rc-item')).toHaveLength(1)
    expect(wrapper.findAll('.rc-seg')[1].findAll('.rc-seg-btn')[2].attributes('aria-pressed')).toBe('true')
  })
})
