// F0290: Passkey 重绑回调测试覆盖——原 passkeyCreateFlow 在单测中被 mock 成空函数，回调从未执行。
// 本测试捕获回调并执行，验证 passkey 路复用 init 结果、不二次 rebindInit（兼测 F0289）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  rebindInit: vi.fn(),
  verifyCurrent: vi.fn(),
  rebindConfirm: vi.fn(),
  loginOptions: vi.fn(() => Promise.resolve({})),
  passkeyCb: null as null | (() => Promise<unknown>),
  msgError: vi.fn(),
  profile: { id: 7, qq_number: '10001' } as Record<string, unknown>
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../api/index.js', () => ({
  webauthnApi: {
    getCredentials: vi.fn(() => Promise.resolve({ credentials: [{ id: 'cred-1' }] })),
    loginOptions: h.loginOptions,
    registerOptions: vi.fn(), registerVerify: vi.fn(), loginVerify: vi.fn(),
    updateCredential: vi.fn(), deleteCredential: vi.fn()
  },
  totpRebindApi: { verifyCurrent: h.verifyCurrent, rebindInit: h.rebindInit, rebindConfirm: h.rebindConfirm },
  calendarFeedApi: { get: vi.fn(() => Promise.resolve({ enabled: false, url: null })), setEnabled: vi.fn(), rotate: vi.fn() },
  artistApi: { getMyDevices: vi.fn(() => Promise.resolve({ devices: [] })), revokeMyDevice: vi.fn() }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ profile: h.profile, isAdmin: false, fetchProfile: vi.fn(() => Promise.resolve()) })
}))

vi.mock('../../../utils/webauthn.js', () => ({
  toCredentialCreationOptions: vi.fn(),
  toCredentialRequestOptions: vi.fn(),
  publicKeyCredentialToJSON: vi.fn(() => ({ id: 'cred-1' })),
  isBackendError: vi.fn(() => false)
}))

vi.mock('../../../composables/usePasskeyCreate.js', () => ({
  // 捕获回调供测试执行（F0290）
  usePasskeyCreate: () => ({
    passkeyCreateFlow: vi.fn((cb: () => Promise<unknown>) => { h.passkeyCb = cb; return Promise.resolve() })
  }),
  PASSKEY_FLOW_HANDLED: Symbol('handled')
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: h.msgError, warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn() }
}))

import AccountSecurity from '../AccountSecurity.vue'

interface VM {
  rebindMethod: string
  rebindStep: string
  startRebind: () => Promise<void>
  verifyWithPasskey: () => Promise<void>
}

const ElButtonStub = { props: ['disabled'], emits: ['click'], template: '<button type="button"><slot /></button>' }

function mountPage() {
  const wrapper = mount(AccountSecurity, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { RouterLink: true, 'el-button': ElButtonStub }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as VM }
}

describe('AccountSecurity Passkey 重绑回调（F0290）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.passkeyCb = null
    h.rebindInit.mockResolvedValue({ verifyMethod: 'passkey', qrDataUrl: 'data:image/png;base64,xx', tempKey: 'rebind:1' })
    // happy-dom 无 navigator.credentials，桩一个返回凭证的实现
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { get: vi.fn(() => Promise.resolve({ id: 'cred-1' })) }
    })
  })

  it('passkey 路：捕获回调并执行后进入 scan 步，且 rebindInit 只调用一次（F0289 不产生孤儿 secret）', async () => {
    const { vm } = mountPage()
    await vm.startRebind()
    expect(vm.rebindMethod).toBe('passkey')
    expect(h.rebindInit).toHaveBeenCalledTimes(1)

    await vm.verifyWithPasskey()
    expect(h.passkeyCb).toBeTypeOf('function') // 覆盖：回调被真正捕获（原来 mock 成空函数拿不到）
    await h.passkeyCb!()
    await flushPromises()

    expect(h.rebindInit).toHaveBeenCalledTimes(1) // 不二次 init
    expect(vm.rebindStep).toBe('scan')
  })
})
