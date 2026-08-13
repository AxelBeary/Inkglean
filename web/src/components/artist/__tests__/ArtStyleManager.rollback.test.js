// 围剿 a1-14: ArtStyleManager onDropToSize 两步写——mutex 成功但 setSizeOverrides 失败时反向恢复并重载
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const h = vi.hoisted(() => ({
  styles: [],
  getArtStyles: vi.fn(),
  getProfile: vi.fn(),
  getArtworks: vi.fn(),
  getAddonTemplates: vi.fn(),
  getSizeOverrides: vi.fn(),
  setStyleAddons: vi.fn(),
  setSizeOverrides: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgInfo: vi.fn(),
  msgWarning: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, info: h.msgInfo, warning: h.msgWarning },
  ElMessageBox: { confirm: vi.fn(() => Promise.resolve('confirm')) }
}))

vi.mock('../../../api/index.js', () => ({
  artistApi: {
    getArtStyles: h.getArtStyles,
    getProfile: h.getProfile,
    getArtworks: h.getArtworks,
    getAddonTemplates: h.getAddonTemplates,
    getSizeOverrides: h.getSizeOverrides,
    setStyleAddons: h.setStyleAddons,
    setSizeOverrides: h.setSizeOverrides,
    updateProfile: vi.fn(),
    updateArtStyle: vi.fn(),
    updateStyleSize: vi.fn(),
    deleteArtStyle: vi.fn(),
    deleteStyleSize: vi.fn(),
    createAddonTemplate: vi.fn()
  }
}))

import ArtStyleManager from '../ArtStyleManager.vue'

function buildStyles() {
  return [{
    id: 's1',
    name: 'Q版',
    is_active: 1,
    sort_order: 0,
    sizes: [{
      id: 'z1',
      sort_order: 0,
      base_price: 100,
      _overrides: { a1: { price_override: null, is_hidden: true } }
    }],
    addons: [
      { id: 'a1', addon_template_id: 't1', template_name: '用途A', template_category: 'usage', is_enabled: 1 },
      { id: 'a2', addon_template_id: 't2', template_name: '用途B', template_category: 'usage', is_enabled: 1 }
    ]
  }]
}

async function mountManager() {
  // 每次返回深拷贝——模拟后端独立数据，互斥的本地乐观变更不会污染重载结果
  h.getArtStyles.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(h.styles))))
  h.getProfile.mockResolvedValue({ multi_style_enabled: true })
  h.getArtworks.mockResolvedValue([])
  h.getAddonTemplates.mockResolvedValue([])
  // 预载尺寸覆盖：a1 在 z1 上隐藏（拖入即启用路径的前提）
  h.getSizeOverrides.mockResolvedValue([{ style_addon_id: 'a1', price_override: null, is_hidden: true }])
  const wrapper = shallowMount(ArtStyleManager, {
    global: {
      mocks: { $t: (key) => key, $tm: () => [] },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('ArtStyleManager 增项拖入尺寸回滚（a1-14）', () => {
  beforeEach(() => {
    h.styles = buildStyles()
    h.setStyleAddons.mockReset()
    h.setSizeOverrides.mockReset()
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
    h.msgInfo.mockClear()
  })

  it('setSizeOverrides 失败 → 反向恢复 mutex 并重载（本地与后端一致）', async () => {
    h.setStyleAddons.mockResolvedValue({})
    h.setSizeOverrides.mockRejectedValue(new Error('override boom'))
    const wrapper = await mountManager()

    const style = wrapper.vm.styles[0]
    const size = style.sizes[0]
    wrapper.vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await wrapper.vm.onDropToSize(style, size, {})
    await flushPromises()

    // mutex 先成功
    expect(h.setStyleAddons).toHaveBeenNthCalledWith(1, 's1', [
      { addon_template_id: 't1', is_enabled: true },
      { addon_template_id: 't2', is_enabled: false }
    ])
    // 反向恢复：重新启用被停用的同类项
    expect(h.setStyleAddons).toHaveBeenNthCalledWith(2, 's1', [
      { addon_template_id: 't2', is_enabled: true }
    ])
    // 整体重载保证本地一致
    expect(h.getArtStyles).toHaveBeenCalledTimes(2)
    expect(h.msgError).toHaveBeenCalledWith('override boom')
    expect(h.msgSuccess).not.toHaveBeenCalled()

    // 重载后 addons 回到启用态
    const reloadedStyle = wrapper.vm.styles[0]
    expect(reloadedStyle.addons.find(a => a.id === 'a2').is_enabled).toBe(1)
  })

  it('两步都成功 → 不触发反向恢复', async () => {
    h.setStyleAddons.mockResolvedValue({})
    h.setSizeOverrides.mockResolvedValue({})
    const wrapper = await mountManager()

    const style = wrapper.vm.styles[0]
    const size = style.sizes[0]
    wrapper.vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await wrapper.vm.onDropToSize(style, size, {})
    await flushPromises()

    expect(h.setStyleAddons).toHaveBeenCalledTimes(1)
    expect(size._overrides.a1.is_hidden).toBe(false)
    expect(h.msgSuccess).toHaveBeenCalled()
  })
})
