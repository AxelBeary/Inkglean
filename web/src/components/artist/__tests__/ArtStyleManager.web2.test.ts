// 波2审计 WEB-05 + WEB-06（父级）：ArtStyleManager isLocked 豁免 + onDropToSize 判定/清载荷/画风级启用
// WEB-05：多画风关闭时关掉默认画风的启用开关 → defaultStyleId 漂移 → 原逻辑本卡 isLocked 恒真无法重开
// WEB-06：onDropToSize 三项修复——判定与 sizeSummary 同口径 / 早退清 dragPayload / add 类画风级停用时走启用路径
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

interface StyleSize {
  id: string
  name: string
  sort_order: number
  base_price: number
  _overrides?: Record<string, { price_override: number | null; is_hidden: boolean }>
}

interface StyleAddon {
  id: string
  addon_template_id: string
  template_name: string
  template_category: string
  template_control_type: string
  template_price_mode: string
  template_default_price: number
  is_enabled: number | boolean
}

interface ArtStyle {
  id: string
  name: string
  is_active: number
  sort_order: number
  sizes: StyleSize[]
  addons: StyleAddon[]
}

interface DragPayload {
  styleId: string
  saId: string
  fromSizeId: string | null
}

interface ArtStyleManagerVm {
  styles: ArtStyle[]
  multiStyleEnabled: boolean
  defaultStyleId: string | null
  dragPayload: DragPayload | null
  poolDragOver: boolean
  isLocked(style: ArtStyle): boolean
  toggleActive(style: ArtStyle, val: boolean | string | number): Promise<unknown>
  onDropToSize(style: ArtStyle, size: StyleSize, extra: Record<string, unknown>): Promise<unknown> | unknown
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  styles: [] as ArtStyle[],
  profile: { multi_style_enabled: false } as Record<string, unknown>,
  sizeOverrides: [] as Array<{ style_addon_id: string; price_override: number | null; is_hidden: boolean }>,
  getArtStyles: vi.fn(),
  getProfile: vi.fn(),
  getArtworks: vi.fn(),
  getAddonTemplates: vi.fn(),
  getSizeOverrides: vi.fn(),
  setStyleAddons: vi.fn(),
  setSizeOverrides: vi.fn(),
  updateArtStyle: vi.fn(),
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
    updateArtStyle: h.updateArtStyle,
    updateProfile: vi.fn(),
    updateStyleSize: vi.fn(),
    deleteArtStyle: vi.fn(),
    deleteStyleSize: vi.fn(),
    createAddonTemplate: vi.fn()
  }
}))

import ArtStyleManager from '../ArtStyleManager.vue'

function buildAddon(partial: Partial<StyleAddon> & { id: string }): StyleAddon {
  return {
    addon_template_id: 'tpl-' + partial.id,
    template_name: '增项-' + partial.id,
    template_category: 'add',
    template_control_type: 'switch',
    template_price_mode: 'fixed',
    template_default_price: 100,
    is_enabled: 1,
    ...partial
  }
}

async function mountManager() {
  // 每次返回深拷贝——模拟后端独立数据，本地乐观变更不会污染重载结果
  h.getArtStyles.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(h.styles))))
  h.getProfile.mockImplementation(() => Promise.resolve({ ...h.profile }))
  h.getArtworks.mockResolvedValue([])
  h.getAddonTemplates.mockResolvedValue([])
  h.getSizeOverrides.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(h.sizeOverrides))))
  const wrapper = shallowMount(ArtStyleManager, {
    global: {
      mocks: { $t: (key: string) => key, $tm: () => [] },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('ArtStyleManager WEB-05：多画风关闭 + 停用默认画风后本卡不锁死', () => {
  beforeEach(() => {
    h.profile = { multi_style_enabled: false }
    h.sizeOverrides = []
    h.styles = []
    h.updateArtStyle.mockReset()
    h.updateArtStyle.mockResolvedValue({})
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
    h.msgInfo.mockClear()
    h.msgWarning.mockClear()
  })

  it('关掉默认画风 A 后：defaultStyleId 漂移到 B，A 不再被 isLocked 锁死（switch 可重开）', async () => {
    h.styles = [
      { id: 'A', name: 'A', is_active: 1, sort_order: 0, sizes: [], addons: [] },
      { id: 'B', name: 'B', is_active: 1, sort_order: 1, sizes: [], addons: [] }
    ]
    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    // 多画风关闭 + A 是默认（is_active=1 且排最前）
    expect(vm.multiStyleEnabled).toBe(false)
    expect(vm.defaultStyleId).toBe('A')
    expect(vm.isLocked(vm.styles[0])).toBe(false) // A 是默认，不锁
    expect(vm.isLocked(vm.styles[1])).toBe(true)  // B 非默认且启用中，锁

    // 用户关掉 A 的 switch → is_active=0，defaultStyleId 漂移到 B
    await vm.toggleActive(vm.styles[0], false)
    await flushPromises()
    expect(h.updateArtStyle).toHaveBeenCalledWith('A', { is_active: false })
    expect(vm.styles[0].is_active).toBe(0)
    expect(vm.defaultStyleId).toBe('B')

    // WEB-05 关键断言：A 现在 is_active=0 且非默认，按新豁免规则不锁（可重开）
    expect(vm.isLocked(vm.styles[0])).toBe(false)
    // B 现在是默认，也不锁
    expect(vm.isLocked(vm.styles[1])).toBe(false)

    // 用户可以重开 A（switch 未被禁用）
    await vm.toggleActive(vm.styles[0], true)
    await flushPromises()
    expect(vm.styles[0].is_active).toBe(1)
    // 重开后 A 又变回首个启用画风（默认），B 恢复锁定
    expect(vm.defaultStyleId).toBe('A')
    expect(vm.isLocked(vm.styles[1])).toBe(true)
  })

  it('多画风开启时 isLocked 恒 false（原语义未回归）', async () => {
    h.profile = { multi_style_enabled: true }
    h.styles = [
      { id: 'A', name: 'A', is_active: 1, sort_order: 0, sizes: [], addons: [] },
      { id: 'B', name: 'B', is_active: 0, sort_order: 1, sizes: [], addons: [] }
    ]
    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    expect(vm.isLocked(vm.styles[0])).toBe(false)
    expect(vm.isLocked(vm.styles[1])).toBe(false)
  })

  it('多画风关闭：非默认且启用中的画风仍被锁（原语义未回归）', async () => {
    h.styles = [
      { id: 'A', name: 'A', is_active: 1, sort_order: 0, sizes: [], addons: [] },
      { id: 'B', name: 'B', is_active: 1, sort_order: 1, sizes: [], addons: [] },
      { id: 'C', name: 'C', is_active: 0, sort_order: 2, sizes: [], addons: [] }
    ]
    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    expect(vm.isLocked(vm.styles[0])).toBe(false) // A 默认
    expect(vm.isLocked(vm.styles[1])).toBe(true)  // B 非默认且启用 → 锁
    expect(vm.isLocked(vm.styles[2])).toBe(false) // C 已停用（WEB-05 豁免）→ 不锁
  })
})

describe('ArtStyleManager WEB-06：onDropToSize 判定/清载荷/画风级启用', () => {
  beforeEach(() => {
    h.profile = { multi_style_enabled: true }
    h.sizeOverrides = []
    h.styles = []
    h.setStyleAddons.mockReset()
    h.setSizeOverrides.mockReset()
    h.setStyleAddons.mockResolvedValue({})
    h.setSizeOverrides.mockResolvedValue({})
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
    h.msgInfo.mockClear()
  })

  it('WEB-06 ①③：画风级停用 + 尺寸级未隐藏（add 类）→ 走启用路径，不误提示"已启用"', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1', template_category: 'add', is_enabled: 0 })]
    }]
    h.sizeOverrides = [] // 尺寸级无 override → 未隐藏

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // 关键：不应命中"已启用"误提示（原 bug 场景，只判 !is_hidden）
    expect(h.msgInfo).not.toHaveBeenCalled()
    // 走启用路径：画风级 setStyleAddons 启用自身（add 类无互斥）
    expect(h.setStyleAddons).toHaveBeenCalledWith('s1', [{ addon_template_id: 'tpl-a1', is_enabled: true }])
    // 尺寸级 setSizeOverrides 也调
    expect(h.setSizeOverrides).toHaveBeenCalledWith('s1', 'z1', [
      { style_addon_id: 'a1', price_override: null, is_hidden: false }
    ])
    expect(h.msgSuccess).toHaveBeenCalled()
    // 本地状态：sa.is_enabled = true，尺寸级 override 未隐藏
    expect(style.addons[0].is_enabled).toBe(true)
    expect(size._overrides?.a1.is_hidden).toBe(false)
    // WEB-06 ②：清 dragPayload
    expect(vm.dragPayload).toBe(null)
    expect(vm.poolDragOver).toBe(false)
  })

  it('WEB-06 ①：画风级启用 + 尺寸级未隐藏 → 命中"已启用"提示（与 sizeSummary 同口径）', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1', is_enabled: 1 })]
    }]
    h.sizeOverrides = []

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    expect(h.msgInfo).toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    // WEB-06 ②：早退也清 dragPayload
    expect(vm.dragPayload).toBe(null)
    expect(vm.poolDragOver).toBe(false)
  })

  it('WEB-06 ②：三个早退分支（sa 不存在 / fromSizeId 匹配 / styleId 不匹配）都清 dragPayload 与 poolDragOver', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1' })]
    }]
    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]

    // 分支 A：saId 不存在
    vm.dragPayload = { styleId: 's1', saId: 'not-exist', fromSizeId: null }
    vm.poolDragOver = true
    await vm.onDropToSize(style, size, {})
    expect(vm.dragPayload).toBe(null)
    expect(vm.poolDragOver).toBe(false)

    // 分支 B：从本尺寸拖回
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: 'z1' }
    vm.poolDragOver = true
    await vm.onDropToSize(style, size, {})
    expect(vm.dragPayload).toBe(null)
    expect(vm.poolDragOver).toBe(false)

    // 分支 C：styleId 不匹配
    vm.dragPayload = { styleId: 'other', saId: 'a1', fromSizeId: null }
    vm.poolDragOver = true
    await vm.onDropToSize(style, size, {})
    expect(vm.dragPayload).toBe(null)
    expect(vm.poolDragOver).toBe(false)

    // 全程无任何后端写入
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
  })

  it('WEB-06 ③：add 类启用自身后 setSizeOverrides 失败 → 反向恢复停用（不留孤儿启用）', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1', template_category: 'add', is_enabled: 0 })]
    }]
    h.sizeOverrides = []
    h.setSizeOverrides.mockRejectedValue(new Error('override boom'))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // 第 1 次调用：启用自身
    expect(h.setStyleAddons).toHaveBeenNthCalledWith(1, 's1', [{ addon_template_id: 'tpl-a1', is_enabled: true }])
    // 第 2 次调用：反向恢复（停用自身），避免留下孤儿启用
    expect(h.setStyleAddons).toHaveBeenNthCalledWith(2, 's1', [{ addon_template_id: 'tpl-a1', is_enabled: false }])
    expect(h.msgError).toHaveBeenCalledWith('override boom')
    expect(h.msgSuccess).not.toHaveBeenCalled()
  })

  it('WEB-06 ①：usage 类画风级启用 + 尺寸级已隐藏 → 走启用路径（mutex 分支不受影响）', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [
        buildAddon({ id: 'a1', addon_template_id: 't1', template_category: 'usage', is_enabled: 1 }),
        buildAddon({ id: 'a2', addon_template_id: 't2', template_category: 'usage', is_enabled: 1 })
      ]
    }]
    h.sizeOverrides = [{ style_addon_id: 'a1', price_override: null, is_hidden: true }]

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // mutex 分支：a1 启用 + a2 停用
    expect(h.setStyleAddons).toHaveBeenNthCalledWith(1, 's1', [
      { addon_template_id: 't1', is_enabled: true },
      { addon_template_id: 't2', is_enabled: false }
    ])
    expect(h.setSizeOverrides).toHaveBeenCalled()
    expect(h.msgSuccess).toHaveBeenCalled()
    expect(h.msgInfo).not.toHaveBeenCalled()
  })
})
