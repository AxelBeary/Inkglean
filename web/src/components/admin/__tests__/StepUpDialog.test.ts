// REQ-041 StepUpDialog 二次验证对话框单测（812-chores C3）
// 覆盖：弹出条件（modelValue 驱动）、TOTP 分支提交成功/失败两态、
//       非 6 位动态码本地拦截、取消关闭行为
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StepUpDialog from '../StepUpDialog.vue'

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  getCredentials: vi.fn()
}))

// 注意：__tests__ 在 admin/ 下，到 src 需三级 ../（错误写成两级会让 mock 失效，
// 真实 api 模块被加载并发出真实 HTTP 请求，上一轮 10 例失败的主根因）
vi.mock('../../../api/index.js', () => ({
  stepUpApi: { verify: h.verify },
  webauthnApi: { getCredentials: h.getCredentials },
  authApi: {}
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// api 响应拦截器动态 import i18n/index.js（真实模块会调 createI18n）；
// 按 layouts.session.test.js 先例 mock 实例模块，避免 vue-i18n mock 缺 createI18n 报错
vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue'],
  template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>'
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}

const ElButtonStub = {
  name: 'ElButton',
  // 防止父级 onClick 经 $attrs 透传到 stub 根按钮造成双触发（emit + 原生监听各一次）
  inheritAttrs: false,
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
}

const EP_STUBS = {
  'el-dialog': ElDialogStub,
  'el-input': ElInputStub,
  'el-button': ElButtonStub,
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  Lock: { template: '<span />' }
}

function mountDialog(open = true) {
  return mount(StepUpDialog, {
    props: { modelValue: open },
    global: { stubs: EP_STUBS }
  })
}

beforeEach(() => {
  h.verify.mockReset()
  h.getCredentials.mockReset()
})

describe('StepUpDialog 二次验证对话框（REQ-041）', () => {
  it('modelValue=true 时弹出，false 时关闭', async () => {
    const wrapper = mountDialog(true)
    expect(wrapper.find('.dialog-stub').exists()).toBe(true)
    await wrapper.setProps({ modelValue: false })
    expect(wrapper.find('.dialog-stub').exists()).toBe(false)
  })

  it('TOTP 提交成功 → 调 stepUpApi.verify 并 emit verified/关闭', async () => {
    h.verify.mockResolvedValue({ upgraded: true })
    const wrapper = mountDialog()

    await wrapper.get('input').setValue('123456')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'stepup.confirm')
    expect(confirmBtn).toBeDefined()
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(h.verify).toHaveBeenCalledWith({ method: 'totp', code: '123456' })
    expect(wrapper.emitted('verified')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('TOTP 提交失败 → 显示错误且不 emit verified、不关闭', async () => {
    h.verify.mockRejectedValue(new Error('TOTP 校验失败'))
    const wrapper = mountDialog()

    await wrapper.get('input').setValue('654321')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'stepup.confirm')
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-error').text()).toBe('TOTP 校验失败')
    expect(wrapper.emitted('verified')).toBeUndefined()
    expect(wrapper.find('.dialog-stub').exists()).toBe(true)
  })

  it('非 6 位动态码 → 本地拦截，不调 verify', async () => {
    const wrapper = mountDialog()

    await wrapper.get('input').setValue('12345')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'stepup.confirm')
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(h.verify).not.toHaveBeenCalled()
    expect(wrapper.find('.stepup-error').text()).toBe('stepup.codeFormat')
  })

  it('取消 → emit cancel 并关闭', async () => {
    const wrapper = mountDialog()

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'common.cancel')
    await cancelBtn!.trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
