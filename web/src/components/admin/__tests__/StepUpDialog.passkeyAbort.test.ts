// S083 回归：StepUpDialog 取消/关闭后仍在飞的验证必须作废
// 覆盖：弹窗关闭（用户取消）→ 系统生物识别框被 signal 打断 → 迟到的凭据不得 emit verified；
//       组件卸载同样作废；TOTP 分支同一口径；正常路径仍只 emit 一次。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StepUpDialog from '../StepUpDialog.vue'

const h = vi.hoisted(() => ({
  me: vi.fn(),
  loginOptions: vi.fn(),
  verify: vi.fn(),
  getCredentials: vi.fn(),
  credentialsGet: vi.fn()
}))

// 注意：__tests__ 在 admin/ 下，到 src 需三级 ../（两级会让 mock 失效，真实 api 发出 HTTP）
vi.mock('../../../api/index.js', () => ({
  stepUpApi: { verify: h.verify },
  webauthnApi: { getCredentials: h.getCredentials, loginOptions: h.loginOptions },
  authApi: { me: h.me }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// api 响应拦截器动态 import i18n/index.js（真实模块会调 createI18n）
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
  // 防止父级 onClick 经 $attrs 透传到 stub 根按钮造成双触发
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

/** 手动控制 resolve/reject 的 Promise（模拟「用户关窗后凭据才回来」） */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 组件只用到 toJSON() 分支（现代浏览器口径） */
function fakeCredential() {
  return {
    id: 'cred-1',
    toJSON: () => ({
      id: 'cred-1',
      response: { authenticatorData: 'auth-data', clientDataJSON: 'client-data', signature: 'sig' }
    })
  }
}

function mountDialog(open: boolean) {
  return mount(StepUpDialog, {
    props: { modelValue: open },
    global: { stubs: EP_STUBS }
  })
}

/** 打开弹窗（以关闭态挂载再置 true，才能触发 watch 里的凭据探测） */
async function openDialog(wrapper: ReturnType<typeof mountDialog>) {
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
}

beforeEach(() => {
  h.me.mockReset().mockResolvedValue({ qq_number: '10001' })
  h.loginOptions.mockReset().mockResolvedValue({ challenge: 'AAAA' })
  h.verify.mockReset().mockResolvedValue({ upgraded: true })
  h.getCredentials.mockReset().mockResolvedValue({ credentials: [{ id: 1 }] })
  h.credentialsGet.mockReset()
  // 组件 setup 时读 window.PublicKeyCredential + isSecureContext 决定是否渲染 Passkey 按钮
  Object.defineProperty(window, 'PublicKeyCredential', { value: function FakePKC() {}, configurable: true })
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'credentials', {
    value: { get: h.credentialsGet },
    configurable: true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('S083 StepUpDialog：取消后 Passkey 竞态', () => {
  it('关闭弹窗 → signal 打断系统弹框 → 迟到的凭据不得 emit verified', async () => {
    const gate = deferred<unknown>()
    h.credentialsGet.mockReturnValue(gate.promise)
    const wrapper = mountDialog(false)
    await openDialog(wrapper)

    const passkeyBtn = wrapper.get('.stepup-passkey-btn')
    expect(passkeyBtn.text()).toBe('stepup.passkeyVerify')
    await passkeyBtn.trigger('click')
    await flushPromises()

    expect(h.credentialsGet).toHaveBeenCalledTimes(1)
    const requestOptions = h.credentialsGet.mock.calls[0][0] as { signal?: AbortSignal }
    // 修复前这里没有 signal：取消只能等系统弹框自己超时
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal)
    expect(requestOptions.signal!.aborted).toBe(false)

    // 用户点取消 / 关闭
    await wrapper.setProps({ modelValue: false })
    expect(requestOptions.signal!.aborted).toBe(true)

    // 凭据迟到返回（修复前会一路走到 onVerified）
    gate.resolve(fakeCredential())
    await flushPromises()

    expect(wrapper.emitted('verified')).toBeUndefined()
    expect(h.verify).not.toHaveBeenCalled()
    expect(wrapper.find('.stepup-error').exists()).toBe(false)
  })

  it('取消后重开：passkey 按钮回到可点状态（loading 未被竞态卡死）', async () => {
    const gate = deferred<unknown>()
    h.credentialsGet.mockReturnValue(gate.promise)
    const wrapper = mountDialog(false)
    await openDialog(wrapper)

    await wrapper.get('.stepup-passkey-btn').trigger('click')
    await flushPromises()
    await wrapper.setProps({ modelValue: false })
    gate.resolve(null)
    await flushPromises()

    await openDialog(wrapper)
    const reopened = wrapper.get('.stepup-passkey-btn')
    expect(reopened.attributes('disabled')).toBeUndefined()
    expect(reopened.text()).toBe('stepup.passkeyVerify')
  })

  it('关闭后迟到的失败不得写 error（弹窗都关了，文案没有落点）', async () => {
    const gate = deferred<unknown>()
    h.credentialsGet.mockReturnValue(gate.promise)
    const wrapper = mountDialog(false)
    await openDialog(wrapper)

    await wrapper.get('.stepup-passkey-btn').trigger('click')
    await flushPromises()
    await wrapper.setProps({ modelValue: false })

    gate.reject(Object.assign(new Error('boom'), { name: 'NotAllowedError' }))
    await flushPromises()

    expect(wrapper.find('.stepup-error').exists()).toBe(false)
    expect(wrapper.emitted('verified')).toBeUndefined()
  })

  it('组件卸载（父级销毁）同样作废在飞的验证', async () => {
    const gate = deferred<unknown>()
    h.credentialsGet.mockReturnValue(gate.promise)
    const wrapper = mountDialog(false)
    await openDialog(wrapper)

    await wrapper.get('.stepup-passkey-btn').trigger('click')
    await flushPromises()
    const requestOptions = h.credentialsGet.mock.calls[0][0] as { signal?: AbortSignal }

    wrapper.unmount()
    expect(requestOptions.signal!.aborted).toBe(true)

    gate.resolve(fakeCredential())
    await flushPromises()
    expect(wrapper.emitted('verified')).toBeUndefined()
    expect(h.verify).not.toHaveBeenCalled()
  })

  it('正常路径：验证成功 emit verified 一次，且 signal 全程未中止', async () => {
    h.credentialsGet.mockResolvedValue(fakeCredential())
    const wrapper = mountDialog(false)
    await openDialog(wrapper)

    await wrapper.get('.stepup-passkey-btn').trigger('click')
    await flushPromises()

    const requestOptions = h.credentialsGet.mock.calls[0][0] as { signal?: AbortSignal }
    expect(requestOptions.signal!.aborted).toBe(false)
    expect(h.verify).toHaveBeenCalledTimes(1)
    expect(h.verify).toHaveBeenCalledWith({
      method: 'passkey',
      credentialId: 'cred-1',
      authenticatorData: 'auth-data',
      signature: 'sig',
      clientDataJSON: 'client-data'
    })
    expect(wrapper.emitted('verified')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('TOTP 分支：关闭后迟到的成功不得 emit verified', async () => {
    const gate = deferred<unknown>()
    h.verify.mockReturnValue(gate.promise)
    const wrapper = mountDialog(true)

    await wrapper.get('input').setValue('123456')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'stepup.confirm')
    await confirmBtn!.trigger('click')
    await flushPromises()
    expect(h.verify).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ modelValue: false })
    gate.resolve({ upgraded: true })
    await flushPromises()

    expect(wrapper.emitted('verified')).toBeUndefined()
    expect(wrapper.find('.stepup-error').exists()).toBe(false)
  })

  it('TOTP 分支：关闭后迟到的失败不得写 error', async () => {
    const gate = deferred<unknown>()
    h.verify.mockReturnValue(gate.promise)
    const wrapper = mountDialog(true)

    await wrapper.get('input').setValue('123456')
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'stepup.confirm')
    await confirmBtn!.trigger('click')
    await flushPromises()

    await wrapper.setProps({ modelValue: false })
    gate.reject(new Error('TOTP 校验失败'))
    await flushPromises()

    expect(wrapper.find('.stepup-error').exists()).toBe(false)
    expect(wrapper.emitted('verified')).toBeUndefined()
  })
})
