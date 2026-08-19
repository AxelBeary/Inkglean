// 围剿 a1-10: Settings showcase 保存不得把未保存的 rulesContent 计入基线（规则脏标记失守）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { tab: 'showcase' } })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  profile: {
    name: '画师A',
    bio: '',
    status: 'open',
    custom_links: '[]',
    inspiration_tags: '[]',
    contact_qq: '',
    artist_code: '',
    template_id: 'classic',
    palette_id: 'paper',
    accent_color: null as string | null,
    avatar: '',
    subdomain: 'alice',
    announcement: '',
    announcement_expires_at: null as string | null
  },
  getProfile: vi.fn(),
  getRules: vi.fn(),
  getPlatforms: vi.fn(),
  updateProfile: vi.fn(),
  updateRules: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: h.msgWarning, info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getProfile: h.getProfile,
    getRules: h.getRules,
    updateProfile: h.updateProfile,
    updateRules: h.updateRules
  },
  artistPublicApi: {
    getPlatforms: h.getPlatforms
  },
  uploadApi: {
    image: vi.fn()
  }
}))

vi.mock('../../../utils/track.js', () => ({
  trackEvent: vi.fn()
}))

// 规避 happy-dom 下 DOMPurify 环境差异：本用例只关心脏标记，不校验消毒结果
vi.mock('../../../utils/sanitize.js', () => ({
  sanitizeHtml: (html: string) => html || ''
}))

import Settings from '../Settings.vue'

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface SettingsVM {
  rulesLoaded: boolean
  rulesContent: string
  isTabDirty: (tab: string) => boolean
  save: () => Promise<void>
  saveRules: () => Promise<void>
}

function mountSettings() {
  const wrapper = shallowMount(Settings, {
    global: {
      mocks: { $t: (key: string) => key, $tm: () => [] },
      directives: { loading: () => {} }
    }
  })
  return wrapper.vm as unknown as SettingsVM
}

describe('Settings 规则脏标记隔离（a1-10）', () => {
  beforeEach(() => {
    h.getProfile.mockReset()
    h.getRules.mockReset()
    h.getPlatforms.mockReset()
    h.updateProfile.mockReset()
    h.updateRules.mockReset()
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
    h.msgWarning.mockClear()
  })

  it('showcase 保存只标记本次真保存字段：未保存的规则变更仍保持脏标记', async () => {
    h.getProfile.mockResolvedValue(h.profile)
    h.getRules.mockResolvedValue({ content: '初始规则' })
    h.getPlatforms.mockResolvedValue([])
    h.updateProfile.mockResolvedValue({})
    h.updateRules.mockResolvedValue({})

    const vm = mountSettings()
    await flushPromises()
    expect(vm.rulesLoaded).toBe(true)
    expect(vm.isTabDirty('showcase')).toBe(false)

    // 用户改了规则但没保存 → 脏
    vm.rulesContent = '未保存的规则'
    expect(vm.isTabDirty('showcase')).toBe(true)

    // 保存 showcase（profile 字段）→ 不得把未保存规则计入基线
    await vm.save()
    expect(h.updateProfile).toHaveBeenCalledTimes(1)
    expect(vm.isTabDirty('showcase')).toBe(true)

    // 规则真正保存后基线包含规则 → 不再脏
    await vm.saveRules()
    expect(h.updateRules).toHaveBeenCalledWith('未保存的规则')
    expect(vm.isTabDirty('showcase')).toBe(false)
  })
})
