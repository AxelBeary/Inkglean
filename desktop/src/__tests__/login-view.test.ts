// DTK-07（debug-swarm 11-24）：桌面登录页键盘提交与错误可达性。
// 两输入框包在 <form @submit.prevent> 内（Enter 统一走表单提交）；错误段 role=alert + aria-live。
// 桌面测试栈无 @vue/test-utils，沿用 confirm-dialog 测试范式：createApp 真实挂载 + DOM 事件。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

const h = vi.hoisted(() => ({
  login: vi.fn(),
  enterLocalMode: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ login: h.login, enterLocalMode: h.enterLocalMode })
}))
vi.mock('../bridge', () => ({
  isDesktop: () => true,
  BridgeUnavailableError: class BridgeUnavailableError extends Error {}
}))
vi.mock('../components/shell/TitleBar.vue', () => ({ default: { template: '<div data-titlebar />' } }))

import Login from '../views/Login.vue'

function mountLogin() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Login)
  app.mount(host)
  return { host, app }
}

function type(host: HTMLElement, selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('Login.vue 键盘提交与错误可达性（DTK-07）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    h.login.mockReset().mockResolvedValue(undefined)
    h.enterLocalMode.mockReset()
    h.push.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('两输入框都在 <form> 内；表单提交（Enter/按钮统一路径）触发 login', async () => {
    const { host, app } = mountLogin()
    await nextTick()
    const form = host.querySelector('form')!
    expect(form).toBeTruthy()
    expect(host.querySelector('#qq')!.closest('form')).toBe(form)
    expect(host.querySelector('#code')!.closest('form')).toBe(form)

    type(host, '#qq', '20002')
    type(host, '#code', '123456')
    await nextTick()
    // 浏览器在输入框按 Enter 即触发表单 submit；这里直接派发 submit 事件验证统一提交路径
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(h.login).toHaveBeenCalledWith('20002', '123456')
    expect(h.push).toHaveBeenCalledWith({ name: 'home' })
    app.unmount()
  })

  it('校验失败：错误段带 role=alert 与 aria-live=assertive，且不发起登录', async () => {
    const { host, app } = mountLogin()
    await nextTick()
    const form = host.querySelector('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await nextTick()

    const err = host.querySelector<HTMLElement>('p.error[role="alert"]')!
    expect(err).toBeTruthy()
    expect(err.getAttribute('aria-live')).toBe('assertive')
    expect(err.textContent).toContain('QQ 号')
    expect(h.login).not.toHaveBeenCalled()
    app.unmount()
  })
})
