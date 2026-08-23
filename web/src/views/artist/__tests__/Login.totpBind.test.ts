// Login.vue TOTP 绑定失效提示 + 首绑防刷新/找回入口测试（824）
// 覆盖：旗标消费展示后清除；防刷新状态恢复第 2 步；建号成功写状态；关闭叠加层清状态；
//       找回入口成功/错误分流；Passkey 入口 TOTP_BIND_REQUIRED 就地展示
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { INVITE_TOTP_PROGRESS_KEY, TOTP_BIND_REQUIRED_NOTICE_KEY } from '../../../constants/auth'

const h = vi.hoisted(() => ({
  status: vi.fn(),
  register: vi.fn(),
  totpConfirm: vi.fn(),
  loginOptions: vi.fn(),
  loginVerify: vi.fn(),
  login: vi.fn(),
  applySession: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } })
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: (...args: unknown[]) => h.push(...args) })
}))

vi.mock('../../../api/index.js', () => ({
  inviteApi: {
    status: (...a: unknown[]) => h.status(...a),
    register: (...a: unknown[]) => h.register(...a),
    totpConfirm: (...a: unknown[]) => h.totpConfirm(...a)
  },
  webauthnApi: {
    loginOptions: (...a: unknown[]) => h.loginOptions(...a),
    loginVerify: (...a: unknown[]) => h.loginVerify(...a)
  }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    applySession: (...a: unknown[]) => h.applySession(...a),
    login: (...a: unknown[]) => h.login(...a),
    $reset: vi.fn()
  })
}))

// 登录页壳组件打桩（断言只针对文案与逻辑，不测视觉）
vi.mock('../../../components/artist/login/LoginBackdrop.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../../components/artist/login/PaperCard.vue', () => ({ default: { template: '<div><slot /></div>' } }))
vi.mock('../../../components/artist/login/LoginPrefs.vue', () => ({ default: { template: '<div />' } }))
// useLocaleSwitch 依赖的 setLocale（不测语言切换动效）
vi.mock('../../../i18n/index.js', () => ({ setLocale: vi.fn() }))
// 二维码生成打桩（jsdom/happy-dom 无 canvas 绘图）
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mockqr')) }
}))

import Login from '../Login.vue'

function mountLogin(): VueWrapper {
  return mount(Login)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  h.status.mockResolvedValue({ enabled: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Login 绑定失效提示旗标（824）', () => {
  it('挂载消费旗标：醒目展示 i18n 文案并清除', async () => {
    sessionStorage.setItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
    const wrapper = mountLogin()
    await flushPromises()

    const notice = wrapper.find('.notice-bind')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('errors.TOTP_BIND_REQUIRED')
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
  })

  it('无旗标时不展示提示', async () => {
    const wrapper = mountLogin()
    await flushPromises()
    expect(wrapper.find('.notice-bind').exists()).toBe(false)
  })
})

describe('Login 首绑防刷新（824）', () => {
  it('建号成功 → 写进行中状态并进入第 2 步', async () => {
    h.register.mockResolvedValue({ otpauthUri: 'otpauth://totp/x?secret=AAA', qqNumber: '12345678' })
    const wrapper = mountLogin()
    await flushPromises()

    await wrapper.find('.invite-entry').trigger('click')
    await wrapper.find('#invite-code').setValue('ABCD1234')
    await wrapper.find('#invite-qq').setValue('12345678')
    await wrapper.find('#invite-name').setValue('画师甲')
    await wrapper.find('#invite-subdomain').setValue('myart')
    const step1Form = wrapper.findAll('form').find(f => f.find('#invite-code').exists())
    expect(step1Form).toBeDefined()
    await step1Form!.trigger('submit')
    await flushPromises()

    expect(h.register).toHaveBeenCalledWith({ code: 'ABCD1234', qqNumber: '12345678', name: '画师甲', subdomain: 'myart' })
    expect(sessionStorage.getItem(INVITE_TOTP_PROGRESS_KEY)).toBe(
      JSON.stringify({ qqNumber: '12345678', otpauthUri: 'otpauth://totp/x?secret=AAA' })
    )
    // 已进入第 2 步：6 位码输入框 + 防刷新提示在场
    expect(wrapper.find('#invite-totp').exists()).toBe(true)
    expect(wrapper.find('.invite-warn').text()).toContain('invite.noRefreshNotice')
  })

  it('刷新后加载：有进行中状态则直接恢复第 2 步并预填找回 QQ', async () => {
    sessionStorage.setItem(
      INVITE_TOTP_PROGRESS_KEY,
      JSON.stringify({ qqNumber: '12345678', otpauthUri: 'otpauth://totp/x?secret=AAA' })
    )
    const wrapper = mountLogin()
    await flushPromises()

    expect(wrapper.find('.invite-overlay').exists()).toBe(true)
    expect(wrapper.find('#invite-totp').exists()).toBe(true)
    // 二维码已重新渲染（qrcode 打桩出图）
    expect(wrapper.find('.invite-qr').exists()).toBe(true)
    // 找回入口预填 QQ，少填一项
    expect((wrapper.find('#recover-qq').element as HTMLInputElement).value).toBe('12345678')
  })

  it('进行中的坏数据不恢复不崩溃', async () => {
    sessionStorage.setItem(INVITE_TOTP_PROGRESS_KEY, '{broken')
    const wrapper = mountLogin()
    await flushPromises()
    expect(wrapper.find('.invite-overlay').exists()).toBe(false)
  })

  it('用户主动关闭叠加层 → 清除防刷新状态', async () => {
    sessionStorage.setItem(
      INVITE_TOTP_PROGRESS_KEY,
      JSON.stringify({ qqNumber: '12345678', otpauthUri: 'otpauth://totp/x?secret=AAA' })
    )
    const wrapper = mountLogin()
    await flushPromises()
    expect(wrapper.find('.invite-overlay').exists()).toBe(true)

    await wrapper.find('.invite-back').trigger('click')
    expect(wrapper.find('.invite-overlay').exists()).toBe(false)
    expect(sessionStorage.getItem(INVITE_TOTP_PROGRESS_KEY)).toBeNull()
  })
})

describe('Login 首绑找回入口（824）', () => {
  it('找回成功：直调 totp-confirm + applySession + 跳面板 + 清状态', async () => {
    vi.useFakeTimers()
    h.totpConfirm.mockResolvedValue({ artist: { id: 1, name: '画师甲' }, isAdmin: false })
    const wrapper = mountLogin()
    await flushPromises()

    await wrapper.find('.invite-entry').trigger('click')
    await wrapper.find('#invite-recover-toggle').trigger('click')
    await wrapper.find('#recover-qq').setValue('12345678')
    await wrapper.find('#recover-code').setValue('654321')
    const recoverForm = wrapper.findAll('form').find(f => f.find('#recover-qq').exists())
    expect(recoverForm).toBeDefined()
    await recoverForm!.trigger('submit')
    await flushPromises()

    expect(h.totpConfirm).toHaveBeenCalledWith({ qqNumber: '12345678', code: '654321' })
    expect(h.applySession).toHaveBeenCalledWith({ id: 1, name: '画师甲' }, false)
    await vi.advanceTimersByTimeAsync(600)
    expect(h.push).toHaveBeenCalledWith('/dashboard')
    expect(sessionStorage.getItem(INVITE_TOTP_PROGRESS_KEY)).toBeNull()
  })

  it('找回失败错误分流对齐 mapInviteTotpErr：stale/锁定', async () => {
    const wrapper = mountLogin()
    await flushPromises()
    await wrapper.find('.invite-entry').trigger('click')
    await wrapper.find('#invite-recover-toggle').trigger('click')
    await wrapper.find('#recover-qq').setValue('12345678')
    await wrapper.find('#recover-code').setValue('654321')
    const recoverForm = wrapper.findAll('form').find(f => f.find('#recover-qq').exists())!

    // 码刚轮换 → stale 文案
    h.totpConfirm.mockRejectedValueOnce({ code: 'TOTP_BIND_INVALID', message: 'x', detail: { stale: true } })
    await recoverForm.trigger('submit')
    await flushPromises()
    expect(wrapper.find('.invite-recover .notice-error').text()).toContain('invite.totpStale')

    // 锁定 → 剩余分钟文案
    h.totpConfirm.mockRejectedValueOnce({ code: 'TOTP_LOCKED', message: 'x', detail: { remainingLockMs: 120000 } })
    await wrapper.find('#recover-code').setValue('654321')
    await recoverForm.trigger('submit')
    await flushPromises()
    expect(wrapper.find('.invite-recover .notice-error').text()).toContain('invite.totpLockedMin')
    expect(h.applySession).not.toHaveBeenCalled()
  })

  it('找回表单本地校验：空/非法输入不发请求', async () => {
    const wrapper = mountLogin()
    await flushPromises()
    await wrapper.find('.invite-entry').trigger('click')
    await wrapper.find('#invite-recover-toggle').trigger('click')
    const recoverForm = wrapper.findAll('form').find(f => f.find('#recover-qq').exists())!

    await recoverForm.trigger('submit')
    await flushPromises()
    expect(h.totpConfirm).not.toHaveBeenCalled()
    expect(wrapper.find('.invite-recover .notice-error').text()).toContain('invite.qqRequired')

    await wrapper.find('#recover-qq').setValue('12345678')
    await wrapper.find('#recover-code').setValue('12')
    await recoverForm.trigger('submit')
    await flushPromises()
    expect(h.totpConfirm).not.toHaveBeenCalled()
    expect(wrapper.find('.invite-recover .notice-error').text()).toContain('invite.totpFormat')
  })
})

describe('Login 登录入口的 TOTP_BIND_REQUIRED 分流（824）', () => {
  it('Passkey 入口收到绑定失效码：就地展示同一文案，不产生额外登出噪音', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', { value: class {}, configurable: true })
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    // 残留旗标也应被就地消费清除（防下次挂载重复展示）
    sessionStorage.setItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
    h.loginOptions.mockRejectedValue(Object.assign(new Error('bind required'), { code: 'TOTP_BIND_REQUIRED' }))

    const wrapper = mountLogin()
    await flushPromises()
    await wrapper.find('#login-qq').setValue('12345678')
    await wrapper.find('.passkey-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('#login-notice').text()).toContain('errors.TOTP_BIND_REQUIRED')
    expect(h.loginVerify).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
  })

  it('TOTP 登录入口收到绑定失效码：清残留旗标，错误行展示拦截器已翻译文案', async () => {
    h.login.mockRejectedValue(Object.assign(new Error('errors.TOTP_BIND_REQUIRED'), { code: 'TOTP_BIND_REQUIRED' }))
    const wrapper = mountLogin()
    await flushPromises()

    // 挂载后旗标已被消费；此处模拟跳转链路上残留的旗标
    sessionStorage.setItem(TOTP_BIND_REQUIRED_NOTICE_KEY, '1')
    await wrapper.find('#login-qq').setValue('12345678')
    await wrapper.find('#login-code').setValue('654321')
    const loginForm = wrapper.findAll('form').find(f => f.find('#login-code').exists())!
    await loginForm.trigger('submit')
    await flushPromises()

    expect(wrapper.find('#login-notice').text()).toContain('errors.TOTP_BIND_REQUIRED')
    expect(sessionStorage.getItem(TOTP_BIND_REQUIRED_NOTICE_KEY)).toBeNull()
  })
})
