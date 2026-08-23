// P1-B（813-hunt）：ArtistDetailDrawer 三态 + 高危删除防护 + 窄屏抽屉
// 覆盖：资料/须知加载失败 → 横幅 + 禁用保存 + 重试恢复；
//       删除作品 → ElMessageBox.confirm（含作品名）、取消不删、行级 loading 防连点；
//       抽屉根类 detail-drawer（≤600px 宽度覆盖钩子）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArtistDetailDrawer from '../ArtistDetailDrawer.vue'

const h = vi.hoisted(() => ({
  getArtistProfile: vi.fn(),
  getArtistPricingOverview: vi.fn(),
  getArtistArtworks: vi.fn(),
  deleteArtistArtwork: vi.fn(),
  getArtistRules: vi.fn(),
  updateArtistProfile: vi.fn(),
  updateArtistRules: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  confirm: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtistProfile: h.getArtistProfile,
    getArtistPricingOverview: h.getArtistPricingOverview,
    getArtistArtworks: h.getArtistArtworks,
    deleteArtistArtwork: h.deleteArtistArtwork,
    getArtistRules: h.getArtistRules,
    updateArtistProfile: h.updateArtistProfile,
    updateArtistRules: h.updateArtistRules
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${params.name || ''}` : key) })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: h.confirm }
}))

vi.mock('../../../components/artist/WorkflowPaymentEditor.vue', () => ({
  default: { name: 'WorkflowPaymentEditor', template: '<div class="wpe-stub" />' }
}))

vi.mock('../../../components/admin/GreetingTable.vue', () => ({
  default: { name: 'GreetingTable', template: '<div class="gt-stub" />' }
}))

const EP_STUBS = {
  'el-drawer': {
    name: 'ElDrawer',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div v-if="modelValue" class="drawer-stub"><slot /></div>'
  },
  'el-tabs': {
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="tabs-stub"><slot /></div>'
  },
  'el-tab-pane': { name: 'ElTabPane', template: '<div class="tab-pane-stub"><slot /></div>' },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-radio-button': { template: '<label><slot /></label>' },
  'el-button': {
    inheritAttrs: false,
    props: ['loading', 'disabled'],
    template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-image': { template: '<img class="el-image-stub" />' },
  'el-empty': { template: '<div class="empty-stub" />' },
  'el-tag': { template: '<span><slot /></span>' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

interface DrawerArtist {
  id: number
  name: string
}

function mountDrawer(artist: DrawerArtist = { id: 1, name: 'Alice' }) {
  const wrapper = mount(ArtistDetailDrawer, {
    // 被测组件仍为 JS script-setup：props 传参最小必要断言
    props: { modelValue: true, artist } as unknown as InstanceType<typeof ArtistDetailDrawer>['$props'],
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function profile() {
  return { name: 'Alice', bio: 'bio', status: 'open', artist_code: 'ALICE', contact_qq: '10001' }
}

async function switchTab(wrapper: ReturnType<typeof mount>, name: string) {
  await wrapper.getComponent({ name: 'ElTabs' }).vm.$emit('update:modelValue', name)
  await flushPromises()
}

function saveButtons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').filter((b) => b.text() === 'settings.save')
}

beforeEach(() => {
  h.getArtistProfile.mockReset().mockResolvedValue(profile())
  h.getArtistPricingOverview.mockReset().mockResolvedValue([])
  h.getArtistArtworks.mockReset().mockResolvedValue([])
  h.deleteArtistArtwork.mockReset().mockResolvedValue({ success: true })
  h.getArtistRules.mockReset().mockResolvedValue({ content: '' })
  h.updateArtistProfile.mockReset().mockResolvedValue(profile())
  h.updateArtistRules.mockReset().mockResolvedValue({})
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.confirm.mockReset().mockResolvedValue('confirm')
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistDetailDrawer 资料/须知加载失败（P1-B）', () => {
  it('资料失败 → 横幅 + 保存禁用；重试成功 → 恢复', async () => {
    h.getArtistProfile
      .mockRejectedValueOnce(new Error('profile boom'))
      .mockResolvedValueOnce(profile())
    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.find('.load-error-banner').exists()).toBe(true)
    expect((saveButtons(wrapper)[0].element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('.load-error-banner button').trigger('click')
    await flushPromises()

    expect(h.getArtistProfile).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.load-error-banner').exists()).toBe(false)
    expect((saveButtons(wrapper)[0].element as HTMLButtonElement).disabled).toBe(false)
  })

  it('须知失败 → 横幅 + 保存禁用；重试成功 → 恢复', async () => {
    h.getArtistRules
      .mockRejectedValueOnce(new Error('rules boom'))
      .mockResolvedValueOnce({ content: '须知' })
    const wrapper = mountDrawer()
    await flushPromises()

    await switchTab(wrapper, 'rules')
    expect(wrapper.find('.load-error-banner').exists()).toBe(true)
    const rulesSave = saveButtons(wrapper).at(-1)
    expect((rulesSave!.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('.load-error-banner button').trigger('click')
    await flushPromises()

    expect(h.getArtistRules).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.load-error-banner').exists()).toBe(false)
    expect((saveButtons(wrapper).at(-1)!.element as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('ArtistDetailDrawer 删除作品防护（P1-B）', () => {
  it('确认弹窗含作品名；取消不调删除 API', async () => {
    h.getArtistArtworks.mockResolvedValueOnce([
      { id: 11, title: '星空', image_path: '1.png' }
    ])
    h.confirm.mockRejectedValueOnce('cancel')
    const wrapper = mountDrawer()
    await flushPromises()
    await switchTab(wrapper, 'artworks')

    await wrapper.find('.artwork-item button').trigger('click')
    await flushPromises()

    expect(h.confirm).toHaveBeenCalledWith('admin.artworkDeleteConfirm:星空', 'common.confirmDeleteTitle', expect.any(Object))
    expect(h.deleteArtistArtwork).not.toHaveBeenCalled()
  })

  it('确认后删除；行级 loading 防连点（挂起期间再点不重复调用）', async () => {
    h.getArtistArtworks.mockResolvedValueOnce([
      { id: 11, title: '星空', image_path: '1.png' },
      { id: 12, title: null, description: '素描', image_path: '2.png' }
    ])
    let resolveDelete: ((value: { success: boolean }) => void) | undefined
    h.deleteArtistArtwork.mockReturnValueOnce(new Promise((resolve) => { resolveDelete = resolve }))
    const wrapper = mountDrawer()
    await flushPromises()
    await switchTab(wrapper, 'artworks')

    const buttons = wrapper.findAll('.artwork-item button')
    await buttons[0].trigger('click')
    await flushPromises()

    expect(h.confirm).toHaveBeenCalledWith('admin.artworkDeleteConfirm:星空', 'common.confirmDeleteTitle', expect.any(Object))
    expect(h.deleteArtistArtwork).toHaveBeenCalledWith(1, 11)
    expect((buttons[0].element as HTMLButtonElement).disabled).toBe(true)

    await buttons[0].trigger('click') // 防连点：确认弹窗再次触发也会被行级门闩拦下
    await flushPromises()
    expect(h.deleteArtistArtwork).toHaveBeenCalledTimes(1)

    resolveDelete!({ success: true })
    await flushPromises()
    expect(h.deleteArtistArtwork).toHaveBeenCalledTimes(1)
  })

  it('无标题无描述 → 未命名作品兜底', async () => {
    h.getArtistArtworks.mockResolvedValueOnce([
      { id: 13, title: null, description: null, image_path: '3.png' }
    ])
    const wrapper = mountDrawer()
    await flushPromises()
    await switchTab(wrapper, 'artworks')

    await wrapper.find('.artwork-item button').trigger('click')
    await flushPromises()
    expect(h.confirm).toHaveBeenCalledWith('admin.artworkDeleteConfirm:admin.artworkUntitled', 'common.confirmDeleteTitle', expect.any(Object))
  })
})

describe('ArtistDetailDrawer 窄屏抽屉钩子（P1-B）', () => {
  it('抽屉根带 detail-drawer 类（≤600px 宽度覆盖的样式钩子）', () => {
    const wrapper = mountDrawer()
    expect(wrapper.find('.drawer-stub.detail-drawer').exists()).toBe(true)
  })
})

describe('ArtistDetailDrawer 上次登录展示（登录留痕批 v72）', () => {
  it('有记录 → 资料页显示完整时间 + IP', async () => {
    const wrapper = mountDrawer({
      id: 1, name: 'Alice',
      last_login_at: '2026-08-23T01:00:00.000Z', last_login_ip: '192.0.2.1'
    } as unknown as DrawerArtist)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('admin.lastLogin.detail')
    expect(text).toContain('IP 192.0.2.1')
    expect(text).toMatch(/2026/) // formatDateTime 本地化完整时间（含年份）
  })

  it('无记录 → 显示「尚未登录」兜底', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.text()).toContain('admin.lastLogin.detailNone')
  })
})
