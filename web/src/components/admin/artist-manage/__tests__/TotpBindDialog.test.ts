// TotpBindDialog 副作用回归（B6: F0189/F0195）
// F0189 修复后口径：打开弹窗零副作用（不再自动 bind-init——该调用会覆盖画师旧密钥
// 并 bump token_version 踢掉全端会话）；生成二维码必须显式确认触发，取消路径保留。
// F0195 补测：上述关键时序此前无任何测试覆盖。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TotpBindDialog from '../TotpBindDialog.vue'
import type { AdminArtistItem } from '../../../../api/types'

const h = vi.hoisted(() => ({
  bindInit: vi.fn(),
  bindConfirm: vi.fn(),
  reset: vi.fn(),
  confirm: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn()
}))

// __tests__ 在 artist-manage/ 下，到 src 需四级 ../../../../（少一级 mock 即失效，见 StepUpDialog.test.ts 注）
vi.mock('../../../../api/index.js', () => ({
  adminApi: {
    totpBindInit: h.bindInit,
    totpBindConfirm: h.bindConfirm,
    totpReset: h.reset
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.messageSuccess, error: h.messageError, warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: h.confirm }
}))

// api 响应拦截器动态 import i18n/index.js（真实模块会调 createI18n），按 StepUpDialog.test.ts 先例 mock
vi.mock('../../../../i18n/index.js', () => ({
  default: { global: { t: (key: string) => key } },
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
  // 防 $attrs 透传根按钮造成双触发（同 StepUpDialog.test.ts 口径）
  inheritAttrs: false,
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
}

const EP_STUBS = {
  'el-dialog': ElDialogStub,
  'el-input': ElInputStub,
  'el-button': ElButtonStub
}

const ARTIST = { id: 5, name: '画师甲', totp_verified: 1 } as unknown as AdminArtistItem

function mountDialog(open = false) {
  return mount(TotpBindDialog, {
    props: { modelValue: open, artist: ARTIST },
    global: {
      stubs: EP_STUBS,
      // 本组件模板走全局 $t（script 走 useI18n().t，两者都已 mock 成原样返回 key）
      mocks: { $t: (key: string) => key }
    }
  })
}

/** 找到文本等于给定 i18n key 的按钮（t mock 原样返回 key） */
function buttonByText(wrapper: ReturnType<typeof mountDialog>, text: string) {
  const btn = wrapper.findAll('button').find((b) => b.text() === text)
  expect(btn).toBeDefined()
  return btn!
}

beforeEach(() => {
  h.bindInit.mockReset()
  h.bindConfirm.mockReset()
  h.reset.mockReset()
  h.confirm.mockReset()
  h.messageSuccess.mockReset()
  h.messageError.mockReset()
  // 默认确认框走「确认」分支；取消用例单独 mockRejectedValue
  h.confirm.mockResolvedValue('confirm')
})

describe('TotpBindDialog 换绑副作用时序（F0189/F0195）', () => {
  it('F0189: 打开弹窗不触发 bind-init（旧口径打开即覆盖旧密钥并踢全端会话）', async () => {
    h.bindInit.mockResolvedValue({ qrDataUrl: 'data:image/png;base64,QR' })
    const wrapper = mountDialog(false)
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(h.bindInit).not.toHaveBeenCalled()
    expect(h.confirm).not.toHaveBeenCalled()
    // 未生成 → 首产按钮在位（显式触发入口）
    expect(wrapper.find('img.totp-qr').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === 'admin.totpGenerate')).toBe(true)
  })

  it('显式点「生成二维码」并确认 → 弹副作用警示确认框且 bind-init 只调一次，二维码渲染', async () => {
    h.bindInit.mockResolvedValue({ qrDataUrl: 'data:image/png;base64,QR' })
    // 确认框挂起态用受控 deferred，先断言「确认未决时零副作用」再放行（避免 mockResolved 微任务竞态）
    let release!: () => void
    h.confirm.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    const wrapper = mountDialog(true)

    await buttonByText(wrapper, 'admin.totpGenerate').trigger('click')
    // 确认框先于请求：携带副作用警示文案（新键 totpGenConfirm），未决期间不碰 bind-init
    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect(h.confirm.mock.calls[0]?.[0]).toBe('admin.totpGenConfirm')
    expect(h.bindInit).not.toHaveBeenCalled()

    release()
    await flushPromises()

    expect(h.bindInit).toHaveBeenCalledTimes(1)
    expect(h.bindInit).toHaveBeenCalledWith(5)
    expect(wrapper.find('img.totp-qr').exists()).toBe(true)
  })

  it('取消路径保留：确认框点「取消」→ 不调 bind-init、无任何副作用', async () => {
    h.confirm.mockRejectedValue(new Error('cancel'))
    const wrapper = mountDialog(true)

    await buttonByText(wrapper, 'admin.totpGenerate').trigger('click')
    await flushPromises()

    expect(h.bindInit).not.toHaveBeenCalled()
    expect(wrapper.find('img.totp-qr').exists()).toBe(false)
    expect(h.messageError).not.toHaveBeenCalled()
  })

  it('footer「重新生成」同走显式确认（bind-init 无旁路）', async () => {
    h.bindInit.mockResolvedValue({ qrDataUrl: 'data:image/png;base64,QR' })
    const wrapper = mountDialog(true)

    await buttonByText(wrapper, 'admin.totpRegenerate').trigger('click')
    expect(h.confirm).toHaveBeenCalledTimes(1)
    await flushPromises()
    expect(h.bindInit).toHaveBeenCalledTimes(1)
  })

  it('绑定确认原口径回归：输码确认成功 → 成功提示 + 关闭弹窗 + emit refresh', async () => {
    h.bindConfirm.mockResolvedValue({ success: true })
    const wrapper = mountDialog(true)

    await wrapper.get('input').setValue('123456')
    await buttonByText(wrapper, 'admin.totpBindConfirm').trigger('click')
    await flushPromises()

    expect(h.bindConfirm).toHaveBeenCalledWith(5, '123456')
    expect(h.messageSuccess).toHaveBeenCalledWith('admin.totpBindSuccess')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})
