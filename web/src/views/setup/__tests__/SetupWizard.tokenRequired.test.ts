// WEB-09 回归：开箱向导 onMounted 调用 checkStatus 回写 tokenRequired
// 覆盖：① tokenRequired=true 时安装口令输入框可见；
//       ② tokenRequired=false 时输入框隐藏；
//       ③ checkStatus 网络异常时不阻塞向导渲染
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const h = vi.hoisted(() => ({
  setOnboardingMode: vi.fn(),
  applySession: vi.fn(),
  enterArtistScope: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  setupApi: { setOnboardingMode: (...a: unknown[]) => h.setOnboardingMode(...a) }
}))
vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({ applySession: (...a: unknown[]) => h.applySession(...a) })
}))
vi.mock('../../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: (...a: unknown[]) => h.enterArtistScope(...a) })
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } }),
  createI18n: () => ({ global: { t: (key: string) => key } })
}))
vi.mock('../../../i18n/index.js', () => ({
  default: { global: { t: (key: string) => key } },
  i18n: { global: { t: (key: string) => key } }
}))
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mockqr')) }
}))
vi.mock('../../../composables/useLocaleSwitch.js', () => ({
  useLocaleSwitch: () => ({ switchLang: vi.fn() })
}))

import { useSetupStore } from '../../../stores/setup'
import SetupWizard from '../SetupWizard.vue'

function mountWizard() {
  return mount(SetupWizard, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        'router-link': { template: '<a><slot /></a>' }
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WEB-09: 安装口令输入框渲染', () => {
  it('checkStatus 返回 tokenRequired=true → 口令输入框渲染', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ initialized: false, tokenRequired: true })
    })))

    const wrapper = mountWizard()
    await flushPromises()

    const store = useSetupStore()
    expect(store.tokenRequired).toBe(true)
    // 口令输入框应渲染（v-if="setupStore.tokenRequired"）
    const tokenInput = wrapper.find('input[placeholder="setup.step1TokenPlaceholder"]')
    expect(tokenInput.exists()).toBe(true)
    wrapper.unmount()
  })

  it('checkStatus 返回 tokenRequired=false → 口令输入框不渲染', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ initialized: false, tokenRequired: false })
    })))

    const wrapper = mountWizard()
    await flushPromises()

    const store = useSetupStore()
    expect(store.tokenRequired).toBe(false)
    const tokenInput = wrapper.find('input[placeholder="setup.step1TokenPlaceholder"]')
    expect(tokenInput.exists()).toBe(false)
    wrapper.unmount()
  })

  it('checkStatus 网络异常 → 不阻塞向导渲染（fail-open）', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network error'))))

    const wrapper = mountWizard()
    await flushPromises()

    // 向导应仍渲染第一步面板
    expect(wrapper.find('.panel-title').exists()).toBe(true)
    expect(wrapper.find('.panel-title').text()).toBe('setup.step1Title')
    wrapper.unmount()
  })

  it('checkStatus 被调用（onMounted 里主动查询）', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ initialized: false, tokenRequired: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mountWizard()
    await flushPromises()

    // checkStatus 内部调用 fetch('/api/setup/status')
    expect(fetchMock).toHaveBeenCalledWith('/api/setup/status')
    wrapper.unmount()
  })
})
