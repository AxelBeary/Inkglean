// 报价单生成挂载测试（812-tools-a：①报价单生成）
// 覆盖：条目增删、金额分换算与合计展示、文字版复制、PNG 导出
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { ElMessage } = vi.hoisted(() => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))

// 真实 locale 解析：文字版/PNG 文案断言需要译后文本，mock 按 zh-CN 键值+参数插值（键不存在时退化为原键）
import zh from '../../../locales/zh-CN.js'
function resolveKey(key, params) {
  let v = zh
  for (const p of key.split('.')) { v = v?.[p] }
  if (typeof v !== 'string') return params ? `${key}:${JSON.stringify(params)}` : key
  if (params) for (const [k, val] of Object.entries(params)) v = v.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val))
  return v
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, params) => resolveKey(key, params) })
}))
vi.mock('element-plus', () => ({ ElMessage }))

import Quote from '../Quote.vue'

const ElInputStub = {
  props: ['modelValue', 'placeholder', 'type', 'maxlength', 'clearable'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}
const ElButtonStub = {
  props: ['disabled', 'type', 'text', 'loading'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
}

function mountQuote() {
  return mount(Quote, {
    global: {
      mocks: {
        $t: (key, params) => resolveKey(key, params),
        $tm: () => []
      },
      stubs: {
        'el-input': ElInputStub,
        'el-button': ElButtonStub
      }
    }
  })
}

describe('报价单生成（812-tools-a）', () => {
  let originalClipboard
  let originalSecure
  let anchorClickSpy

  beforeEach(() => {
    originalClipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue() },
      configurable: true
    })
    originalSecure = window.isSecureContext
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: () => ({ width: 12 }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setLineDash: vi.fn()
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    if (originalClipboard !== undefined) {
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
    }
    if (originalSecure !== undefined) {
      Object.defineProperty(window, 'isSecureContext', { value: originalSecure, configurable: true })
    }
  })

  it('初始一条空行：合计为 ¥0.00，导出/复制按钮禁用', () => {
    const wrapper = mountQuote()
    expect(wrapper.findAll('.quote-item-row')).toHaveLength(1)
    expect(wrapper.find('.quote-total-value').text()).toBe('¥0.00')
    const buttons = wrapper.findAll('.quote-actions button')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].attributes('disabled')).toBeDefined()
  })

  it('填写条目后合计按分计算并展示（200 + 80 = ¥280.00），按钮可用', async () => {
    const wrapper = mountQuote()
    const rowInputs = wrapper.findAll('.quote-item-row input')
    await rowInputs[0].setValue('头像')
    await rowInputs[1].setValue('200')
    expect(wrapper.find('.quote-total-value').text()).toBe('¥200.00')

    await wrapper.find('.quote-add').trigger('click')
    const secondRow = wrapper.findAll('.quote-item-row')[1]
    const secondInputs = secondRow.findAll('input')
    await secondInputs[0].setValue('背景')
    await secondInputs[1].setValue('80')
    expect(wrapper.find('.quote-total-value').text()).toBe('¥280.00')

    const buttons = wrapper.findAll('.quote-actions button')
    expect(buttons[0].attributes('disabled')).toBeUndefined()
    expect(buttons[1].attributes('disabled')).toBeUndefined()
  })

  it('删除条目后合计同步减少', async () => {
    const wrapper = mountQuote()
    const rowInputs = wrapper.findAll('.quote-item-row input')
    await rowInputs[0].setValue('头像')
    await rowInputs[1].setValue('200')
    await wrapper.find('.quote-add').trigger('click')
    const secondRow = wrapper.findAll('.quote-item-row')[1]
    const secondInputs = secondRow.findAll('input')
    await secondInputs[0].setValue('背景')
    await secondInputs[1].setValue('80')
    expect(wrapper.find('.quote-total-value').text()).toBe('¥280.00')

    await wrapper.findAll('.quote-mini-btn')[0].trigger('click')
    expect(wrapper.findAll('.quote-item-row')).toHaveLength(1)
    expect(wrapper.find('.quote-total-value').text()).toBe('¥80.00')
  })

  it('一键复制文字版：剪贴板收到模板文本并提示成功', async () => {
    const wrapper = mountQuote()
    await wrapper.find('#quote-client').setValue('张三')
    const rowInputs = wrapper.findAll('.quote-item-row input')
    await rowInputs[0].setValue('头像')
    await rowInputs[1].setValue('200')
    await wrapper.find('#quote-note').setValue('含 3 次修改')

    await wrapper.findAll('.quote-actions button')[1].trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
    const text = navigator.clipboard.writeText.mock.calls[0][0]
    expect(text).toContain('客户：张三')
    expect(text).toContain('1. 头像 ¥200.00')
    expect(text).toContain('合计：¥200.00')
    expect(text).toContain('备注：含 3 次修改')
    expect(ElMessage.success).toHaveBeenCalledWith(resolveKey('quote.copied'))
  })

  it('生成 PNG：canvas 导出 dataURL 并触发下载', async () => {
    const wrapper = mountQuote()
    const rowInputs = wrapper.findAll('.quote-item-row input')
    await rowInputs[0].setValue('头像')
    await rowInputs[1].setValue('200')

    await wrapper.findAll('.quote-actions button')[0].trigger('click')
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png')
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(ElMessage.success).toHaveBeenCalledWith(resolveKey('quote.imageGenerated'))
  })

  it('金额非法（0/负数/乱字符）时按钮保持禁用', async () => {
    const wrapper = mountQuote()
    const rowInputs = wrapper.findAll('.quote-item-row input')
    await rowInputs[0].setValue('头像')
    for (const bad of ['0', '-5', 'abc']) {
      await rowInputs[1].setValue(bad)
      const buttons = wrapper.findAll('.quote-actions button')
      expect(buttons[0].attributes('disabled')).toBeDefined()
      expect(buttons[1].attributes('disabled')).toBeDefined()
    }
  })

  it('a1-11: today() 用本地时区拼 YYYY-MM-DD（UTC+8 凌晨不差一天）', () => {
    // 本地 2026-08-13 01:00（Asia/Shanghai）→ toISOString 会落在 08-12
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 13, 1, 0, 0))
    const wrapper = mountQuote()
    expect(wrapper.vm.today()).toBe('2026-08-13')
    vi.useRealTimers()
  })
})
