// 日历订阅卡挂载测试（oimimo 吸纳批一：AccountSecurity 页订阅开关/链接/旋转）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AccountSecurity from '../AccountSecurity.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const feedGet = vi.fn()
const feedSetEnabled = vi.fn()
const feedRotate = vi.fn()

vi.mock('../../../api/index.js', () => ({
  webauthnApi: {
    getCredentials: vi.fn(() => Promise.resolve({ credentials: [] })),
    registerOptions: vi.fn(),
    registerVerify: vi.fn(),
    loginOptions: vi.fn(),
    loginVerify: vi.fn(),
    updateCredential: vi.fn(),
    deleteCredential: vi.fn()
  },
  totpRebindApi: {
    verifyCurrent: vi.fn(),
    rebindInit: vi.fn(),
    rebindConfirm: vi.fn()
  },
  calendarFeedApi: {
    get: (...args: unknown[]) => feedGet(...args),
    setEnabled: (...args: unknown[]) => feedSetEnabled(...args),
    rotate: (...args: unknown[]) => feedRotate(...args)
  }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    profile: { qq_number: '10001', totp_verified: 0 },
    fetchProfile: vi.fn(() => Promise.resolve())
  })
}))

vi.mock('../../../utils/webauthn.js', () => ({
  toCredentialCreationOptions: vi.fn(),
  toCredentialRequestOptions: vi.fn(),
  publicKeyCredentialToJSON: vi.fn(),
  isBackendError: vi.fn(() => false)
}))

vi.mock('../../../composables/usePasskeyCreate.js', () => ({
  usePasskeyCreate: () => ({ passkeyCreateFlow: vi.fn() }),
  PASSKEY_FLOW_HANDLED: Symbol('handled')
}))

vi.mock('../../../constants/account.js', () => ({
  REBIND_COOLDOWN_DEFAULT_MS: 86400000
}))

const copyText = vi.fn((_text: string) => Promise.resolve(true))
vi.mock('../../../utils/clipboard.js', () => ({
  copyText: (text: string) => copyText(text)
}))

const msgSuccess = vi.fn()
const msgError = vi.fn()
vi.mock('element-plus', () => ({
  ElMessage: {
    success: (...args: unknown[]) => msgSuccess(...args),
    error: (...args: unknown[]) => msgError(...args),
    warning: vi.fn()
  }
}))

interface AccountSecurityVM {
  feedEnabled: boolean
  feedFullUrl: string
  onFeedToggle: (value: boolean) => Promise<void>
  rotateFeed: () => Promise<void>
  copyFeedUrl: () => Promise<void>
}

function mountPage() {
  const wrapper = mount(AccountSecurity, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { RouterLink: true }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as AccountSecurityVM }
}

describe('AccountSecurity 日历订阅卡', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    feedGet.mockResolvedValue({ enabled: false, url: null })
    feedSetEnabled.mockResolvedValue({ enabled: true, url: '/api/public/artist/alice/calendar.ics?token=t1' })
    feedRotate.mockResolvedValue({ enabled: true, url: '/api/public/artist/alice/calendar.ics?token=t2' })
  })

  it('TC-FEED-UI-01: 默认关闭——无链接行', async () => {
    const { wrapper, vm } = mountPage()
    await flushPromises()
    expect(feedGet).toHaveBeenCalledTimes(1)
    expect(vm.feedEnabled).toBe(false)
    expect(wrapper.find('.feed-url-row').exists()).toBe(false)
  })

  it('TC-FEED-UI-02: 已启用时显示完整订阅链接（origin + 路径）', async () => {
    feedGet.mockResolvedValue({ enabled: true, url: '/api/public/artist/alice/calendar.ics?token=t1' })
    const { wrapper, vm } = mountPage()
    await flushPromises()
    expect(vm.feedEnabled).toBe(true)
    expect(vm.feedFullUrl).toBe(window.location.origin + '/api/public/artist/alice/calendar.ics?token=t1')
    expect(wrapper.find('.feed-url-row').exists()).toBe(true)
  })

  it('TC-FEED-UI-03: 开启开关调用 setEnabled 并展示链接行', async () => {
    const { wrapper, vm } = mountPage()
    await flushPromises()
    await vm.onFeedToggle(true)
    await flushPromises()
    expect(feedSetEnabled).toHaveBeenCalledWith(true)
    expect(vm.feedEnabled).toBe(true)
    expect(wrapper.find('.feed-url-row').exists()).toBe(true)
  })

  it('TC-FEED-UI-04: 开关失败回滚并报错', async () => {
    feedSetEnabled.mockRejectedValueOnce(new Error('boom'))
    const { vm } = mountPage()
    await flushPromises()
    await vm.onFeedToggle(true)
    await flushPromises()
    expect(vm.feedEnabled).toBe(false)
    expect(msgError).toHaveBeenCalledWith('account.feedToggleFailed')
  })

  it('TC-FEED-UI-05: 旋转链接换发新 token 并提示', async () => {
    feedGet.mockResolvedValue({ enabled: true, url: '/api/public/artist/alice/calendar.ics?token=t1' })
    const { vm } = mountPage()
    await flushPromises()
    await vm.rotateFeed()
    await flushPromises()
    expect(feedRotate).toHaveBeenCalledTimes(1)
    expect(vm.feedFullUrl).toContain('token=t2')
    expect(msgSuccess).toHaveBeenCalledWith('account.feedRotated')
  })

  it('TC-FEED-UI-06: 复制链接走剪贴板工具并提示成功', async () => {
    feedGet.mockResolvedValue({ enabled: true, url: '/api/public/artist/alice/calendar.ics?token=t1' })
    const { vm } = mountPage()
    await flushPromises()
    await vm.copyFeedUrl()
    expect(copyText).toHaveBeenCalledWith(window.location.origin + '/api/public/artist/alice/calendar.ics?token=t1')
    expect(msgSuccess).toHaveBeenCalledWith('account.feedCopied')
  })
})
