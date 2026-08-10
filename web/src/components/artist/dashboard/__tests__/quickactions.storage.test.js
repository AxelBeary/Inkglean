// QuickActions localStorage 降级测试（G-5：裸读清扫后存储抛错不崩）
// 覆盖：localStorage.getItem 抛错 → readQuickActionsConfig 返回默认副本；组件挂载不白屏
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

const h = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  push: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}))

vi.mock('../../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    profile: null,
    subdomain: 'alice',
    fetchProfile: () => Promise.resolve()
  })
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: { updateProfile: h.updateProfile },
  uploadApi: { image: () => Promise.resolve({ filePath: 'x' }) }
}))

vi.mock('../../../../utils/track.js', () => ({
  trackEvent: vi.fn()
}))

vi.mock('../../../../composables/usePasteUpload.js', () => ({
  usePasteUpload: () => ({ pasteError: ref(null) })
}))

import { readQuickActionsConfig, QUICK_ACTIONS_DEFAULT } from '../QuickActions.vue'
import QuickActions from '../QuickActions.vue'

beforeEach(() => {
  h.push.mockClear()
})

afterEach(() => {
  Object.defineProperty(window, 'localStorage', originalStorageDescriptor)
  vi.restoreAllMocks()
})

describe('QuickActions 存储降级（G-5）', () => {
  it('localStorage.getItem 抛错 → readQuickActionsConfig 返回默认副本（不抛错）', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      }
    })

    expect(readQuickActionsConfig()).toEqual([...QUICK_ACTIONS_DEFAULT])
  })

  it('存储抛错时组件挂载不白屏，快捷卡片按默认渲染', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled')
      }
    })

    const wrapper = mount(QuickActions, {
      global: {
        mocks: { $t: (key) => key },
        stubs: {
          'el-icon': { template: '<i><slot /></i>' },
          SliderSwitch: { template: '<div class="slider-stub" />' }
        }
      }
    })
    await flushPromises()

    expect(wrapper.findAll('.quick-card').length).toBe(QUICK_ACTIONS_DEFAULT.length)
    expect(wrapper.text()).not.toContain('SecurityError')
  })
})
