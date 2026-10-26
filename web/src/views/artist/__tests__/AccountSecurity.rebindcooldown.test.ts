// TOTP 重绑冷却倒计时测试（issue #53-5）
// 口径：localStorage 只存「上次重绑时刻」，剩余量每次按 Date.now 反算——刷新不归零、后台节流不漂
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  rebindInit: vi.fn(),
  rebindConfirm: vi.fn(),
  verifyCurrent: vi.fn(),
  isBackendError: vi.fn((_err: unknown) => false),
  fetchProfile: vi.fn(() => Promise.resolve()),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  profile: { id: 7, qq_number: '10001', totp_verified: 1 } as Record<string, unknown>,
  isAdmin: false
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
  })
}))

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
    verifyCurrent: h.verifyCurrent,
    rebindInit: h.rebindInit,
    rebindConfirm: h.rebindConfirm
  },
  calendarFeedApi: {
    get: vi.fn(() => Promise.resolve({ enabled: false, url: null })),
    setEnabled: vi.fn(),
    rotate: vi.fn()
  },
  artistApi: {
    getMyDevices: vi.fn(() => Promise.resolve({ devices: [] })),
    revokeMyDevice: vi.fn()
  }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    get profile() { return h.profile },
    get isAdmin() { return h.isAdmin },
    fetchProfile: h.fetchProfile
  })
}))

vi.mock('../../../utils/webauthn.js', () => ({
  toCredentialCreationOptions: vi.fn(),
  toCredentialRequestOptions: vi.fn(),
  publicKeyCredentialToJSON: vi.fn(),
  isBackendError: h.isBackendError
}))

vi.mock('../../../composables/usePasskeyCreate.js', () => ({
  usePasskeyCreate: () => ({ passkeyCreateFlow: vi.fn() }),
  PASSKEY_FLOW_HANDLED: Symbol('handled')
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: h.msgSuccess,
    error: h.msgError,
    warning: h.msgWarning,
    info: vi.fn()
  }
}))

import AccountSecurity from '../AccountSecurity.vue'

const HOUR = 3600000
const KEY = 'huiyue_totp_rebound_at_7'

interface AccountSecurityVM {
  rebindCooldownMs: number
  startRebind: () => Promise<void>
  confirmRebind: () => Promise<void>
}

const ElButtonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
}

function mountPage() {
  const wrapper = mount(AccountSecurity, {
    global: {
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key)
      },
      stubs: { RouterLink: true, 'el-button': ElButtonStub }
    }
  })
  return { wrapper, vm: wrapper.vm as unknown as AccountSecurityVM }
}

function rebindButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find(b => b.text() === 'account.totpRebind')
}

describe('AccountSecurity TOTP 重绑冷却（issue #53-5）', () => {
  beforeEach(() => {
    // 只假 Date + 定时器：flushPromises 依赖真 setTimeout，否则挂死
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.clearAllMocks()
    h.isAdmin = false
    h.profile = { id: 7, qq_number: '10001', totp_verified: 1 }
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('TC-COOL-01: 进页按本地时间戳反算剩余（刷新不再归零）', async () => {
    window.localStorage.setItem(KEY, String(Date.now() - 2 * HOUR))
    const { wrapper, vm } = mountPage()
    await flushPromises()

    expect(vm.rebindCooldownMs).toBeGreaterThan(21.9 * HOUR)
    expect(vm.rebindCooldownMs).toBeLessThanOrEqual(22 * HOUR)
    expect(wrapper.find('.cooldown-hint').text()).toContain('"hours":22')
    expect(rebindButton(wrapper)?.attributes('disabled')).toBeDefined()
  })

  it('TC-COOL-02: ticker 用 Date.now 反算——系统时间跳 1h 后一次 tick 即对齐（自减计数会漂）', async () => {
    window.localStorage.setItem(KEY, String(Date.now() - HOUR))
    const { vm } = mountPage()
    await flushPromises()
    const before = vm.rebindCooldownMs
    expect(before).toBeGreaterThan(22.9 * HOUR)

    // 模拟后台标签页被节流：真实时间走了 1 小时，但只等到一次 tick
    vi.setSystemTime(Date.now() + HOUR)
    vi.advanceTimersByTime(1000)

    expect(vm.rebindCooldownMs).toBeLessThanOrEqual(before - HOUR)
    expect(vm.rebindCooldownMs).toBeGreaterThan(before - HOUR - 5000)
  })

  it('TC-COOL-03: 冷却到期删键并恢复可用', async () => {
    window.localStorage.setItem(KEY, String(Date.now() - 25 * HOUR))
    const { wrapper, vm } = mountPage()
    await flushPromises()

    expect(vm.rebindCooldownMs).toBe(0)
    expect(window.localStorage.getItem(KEY)).toBeNull()
    expect(wrapper.find('.cooldown-hint').exists()).toBe(false)
    expect(rebindButton(wrapper)?.attributes('disabled')).toBeUndefined()
  })

  it('TC-COOL-04: 429 按服务端 remainingMs 校正并落盘', async () => {
    h.isBackendError.mockReturnValue(true)
    h.rebindInit.mockRejectedValue({ code: 'REBIND_COOLDOWN', detail: { remainingMs: 3 * HOUR } })
    const { vm } = mountPage()
    await flushPromises()

    await vm.startRebind()

    expect(vm.rebindCooldownMs).toBe(3 * HOUR)
    // 落盘值 = 距今 3h 到期（而非写死 24h）
    const persisted = Number(window.localStorage.getItem(KEY))
    const expected = Date.now() + 3 * HOUR - 24 * HOUR
    expect(persisted).toBeGreaterThanOrEqual(expected - 2000)
    expect(persisted).toBeLessThanOrEqual(expected + 2000)
  })

  it('TC-COOL-05: 管理员服务端豁免——冷却值存在也不禁用', async () => {
    h.isAdmin = true
    window.localStorage.setItem(KEY, String(Date.now() - HOUR))
    const { wrapper, vm } = mountPage()
    await flushPromises()

    expect(vm.rebindCooldownMs).toBeGreaterThan(0)
    expect(wrapper.find('.cooldown-hint').exists()).toBe(false)
    expect(rebindButton(wrapper)?.attributes('disabled')).toBeUndefined()
  })

  it('TC-COOL-06: 重绑成功后写入当前时刻，刷新仍按 24h 冷却', async () => {
    h.rebindConfirm.mockResolvedValue({ success: true })
    const { vm } = mountPage()
    await flushPromises()

    const startedAt = Date.now()
    await vm.confirmRebind()

    expect(vm.rebindCooldownMs).toBe(24 * HOUR)
    const persisted = Number(window.localStorage.getItem(KEY))
    expect(persisted).toBeGreaterThanOrEqual(startedAt - 2000)
    expect(persisted).toBeLessThanOrEqual(startedAt + 2000)

    // 重新进页（换一个实例）：剩余仍约 24h，不会因刷新归零
    const { vm: vm2 } = mountPage()
    await flushPromises()
    expect(vm2.rebindCooldownMs).toBeGreaterThan(23.9 * HOUR)
  })
})
