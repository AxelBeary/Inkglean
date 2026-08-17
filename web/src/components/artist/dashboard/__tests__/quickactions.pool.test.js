// QuickActions 快捷按钮池扩充 + 空配置（819-G）测试
// 覆盖：新候选条目/唯一 key/路由非空；空数组 [] 是合法配置（隐藏快捷区）；空态渲染不崩
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

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

import {
  QUICK_ACTION_POOL,
  QUICK_ACTIONS_DEFAULT,
  parseQuickActions,
  readQuickActionsConfig
} from '../QuickActions.vue'
import QuickActions from '../QuickActions.vue'
import { QUICK_ACTIONS_KEY } from '../QuickActions.vue'

beforeEach(() => {
  h.push.mockClear()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QUICK_ACTION_POOL 扩充（819-G）', () => {
  it('候选 key 唯一，route 型条目都有真实路径', () => {
    const keys = QUICK_ACTION_POOL.map(a => a.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const a of QUICK_ACTION_POOL.filter(x => x.type === 'route')) {
      expect(a.route).toBeTruthy()
    }
  })

  it('补入后台已有但未入池的真实页面（收支记录/报价单/改稿次数/回复模板/速记/水印/算价器）', () => {
    const byKey = Object.fromEntries(QUICK_ACTION_POOL.map(a => [a.key, a]))
    expect(byKey.income.route).toBe('/tools/income')
    expect(byKey.quote.route).toBe('/tools/quote')
    expect(byKey['revision-count'].route).toBe('/tools/revision-count')
    expect(byKey.reply.route).toBe('/tools/reply')
    expect(byKey.note.route).toBe('/tools/note')
    expect(byKey.watermark.route).toBe('/tools/watermark')
    expect(byKey['price-calc'].route).toBe('/tools/price-calc')
  })
})

describe('空配置支持（819-G：0 个也允许=隐藏快捷区）', () => {
  it('parseQuickActions 对空数组返回 []（合法配置），对坏值返回 null', () => {
    expect(parseQuickActions('[]')).toEqual([])
    expect(parseQuickActions([])).toEqual([])
    expect(parseQuickActions(null)).toBeNull()
    expect(parseQuickActions('not-json')).toBeNull()
    expect(parseQuickActions('["bogus"]')).toBeNull()
  })

  it('localStorage 存 [] → readQuickActionsConfig 返回 []（不回退默认）', () => {
    localStorage.setItem(QUICK_ACTIONS_KEY, '[]')
    expect(readQuickActionsConfig()).toEqual([])
  })

  it('空配置挂载：快捷区整体隐藏（标题与卡片都不渲染）', async () => {
    localStorage.setItem(QUICK_ACTIONS_KEY, '[]')
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
    expect(wrapper.find('.quick-actions-wrap').exists()).toBe(false)
    expect(wrapper.findAll('.quick-card').length).toBe(0)
  })

  it('默认配置仍按默认渲染（回退路径不受影响）', async () => {
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
  })
})
