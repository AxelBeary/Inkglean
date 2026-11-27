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
  // 与生产类型一致（style-manage/types.ts ManagerSa）：孤儿行是 null，不允许再用字符串假 id
  addon_template_id: number | null
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
  // N×M 批量覆盖批：预载改走一次性全量端点，mock 数据带 style_size_id/style_id（批量项形状）
  sizeOverrides: [] as Array<{ id: string; style_size_id: string; style_addon_id: string; price_override: number | null; is_hidden: number; style_id: string }>,
  getArtStyles: vi.fn(),
  getProfile: vi.fn(),
  getArtworks: vi.fn(),
  getAddonTemplates: vi.fn(),
  getAllSizeOverrides: vi.fn(),
  setStyleAddons: vi.fn(),
  setSizeOverrides: vi.fn(),
  saveAddonSettings: vi.fn(),
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
    getAllSizeOverrides: h.getAllSizeOverrides,
    setStyleAddons: h.setStyleAddons,
    setSizeOverrides: h.setSizeOverrides,
    saveAddonSettings: h.saveAddonSettings,
    updateArtStyle: h.updateArtStyle,
    updateProfile: vi.fn(),
    updateStyleSize: vi.fn(),
    deleteArtStyle: vi.fn(),
    deleteStyleSize: vi.fn(),
    createAddonTemplate: vi.fn()
  }
}))

import ArtStyleManager from '../ArtStyleManager.vue'

/** 模板 id：生产类型 number|null，夹具按行 id 数字后缀造稳定值（'a1'→1001） */
function tplIdOf(saId: string): number {
  return 1000 + Number(saId.replace(/\D+/g, '') || 0)
}

/** F0192 保存响应夹具：显式给出「服务端处理后的本画风增项行」。
 *  这样用例断言的是「前端是否采纳服务端真相」，而不是前端自算的互斥结果。 */
function savedAggregate(styleId: string, rows: Array<Partial<StyleAddon> & { id: string }>) {
  return {
    addons: rows.map(r => ({
      id: r.id,
      art_style_id: styleId,
      addon_template_id: r.addon_template_id ?? null,
      is_enabled: typeof r.is_enabled === 'number' ? r.is_enabled : 1,
      price_override: r.price_override ?? null,
      template_name: r.template_name ?? '增项-' + r.id,
      template_control_type: r.template_control_type ?? 'switch',
      template_price_mode: r.template_price_mode ?? 'fixed',
      template_default_price: r.template_default_price ?? 100,
      template_unit_label: null,
      template_category: r.template_category ?? 'add',
      template_max_quantity: null,
      detached: (r.addon_template_id ?? null) === null
    })),
    sizeOverrides: []
  }
}

function buildAddon(partial: Partial<StyleAddon> & { id: string }): StyleAddon {
  return {
    addon_template_id: tplIdOf(partial.id),
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
  h.getAllSizeOverrides.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(h.sizeOverrides))))
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
    h.getAllSizeOverrides.mockClear()
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

describe('ArtStyleManager WEB-06：onDropToSize 判定/清载荷/启用（F0192 单源）', () => {
  beforeEach(() => {
    h.profile = { multi_style_enabled: true }
    h.sizeOverrides = []
    h.styles = []
    h.setStyleAddons.mockReset()
    h.setSizeOverrides.mockReset()
    h.saveAddonSettings.mockReset()
    h.getArtStyles.mockClear()
    h.setStyleAddons.mockResolvedValue({})
    h.setSizeOverrides.mockResolvedValue({})
    h.getAllSizeOverrides.mockClear()
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
    h.msgInfo.mockClear()
  })

  it('WEB-06 ①③：画风级停用 + 尺寸级未隐藏（add 类）→ 走 F0192 单提交，不再分两步写', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1', template_category: 'add', is_enabled: 0 })]
    }]
    h.sizeOverrides = [] // 尺寸级无 override → 未隐藏
    h.saveAddonSettings.mockResolvedValue(savedAggregate('s1', [
      { id: 'a1', addon_template_id: tplIdOf('a1'), template_category: 'add', is_enabled: 1 }
    ]))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // 关键：不应命中「已启用」误提示（原 bug 场景，只判 !is_hidden）
    expect(h.msgInfo).not.toHaveBeenCalled()
    // 一次事务提交：画风级启用 + 本尺寸取消隐藏；前端不再拼互斥载荷、也不再分两步写
    expect(h.saveAddonSettings).toHaveBeenCalledTimes(1)
    expect(h.saveAddonSettings).toHaveBeenCalledWith('s1', {
      styleAddonId: 'a1',
      styleEnabled: true,
      sizeOverrides: [{ sizeId: 'z1', priceOverride: null, isHidden: false }]
    })
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    expect(h.msgSuccess).toHaveBeenCalled()
    // 本地态采纳服务端聚合（而不是自算 is_enabled=true）+ 尺寸 override 取消隐藏
    expect(style.addons.find(a => a.id === 'a1')!.is_enabled).toBe(1)
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
    expect(h.saveAddonSettings).not.toHaveBeenCalled()
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
    expect(h.saveAddonSettings).not.toHaveBeenCalled()
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
  })

  it('F0192 失败：单事务无部分写入 → 零老端点调用、错误可读、重载拉回服务端真相', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1', template_category: 'add', is_enabled: 0 })]
    }]
    h.sizeOverrides = []
    h.saveAddonSettings.mockRejectedValue(new Error('save boom'))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    expect(h.saveAddonSettings).toHaveBeenCalledTimes(1)
    // 全成全败：不存在「互斥已生效、尺寸覆盖失败」的半成品，故不再需要反向补偿写入（原 a1-14 两步写的补偿已废）
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    expect(h.msgError).toHaveBeenCalledWith('save boom')
    expect(h.msgSuccess).not.toHaveBeenCalled()
    // 失败后重载兜底（挂载 1 次 + 失败 1 次）
    expect(h.getArtStyles).toHaveBeenCalledTimes(2)
  })

  it('usage 类：目标已启用但本尺寸隐藏 → 单提交并保留尺寸覆盖价，同类停用由服务端推导', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [
        buildAddon({ id: 'a1', addon_template_id: 1001, template_category: 'usage', is_enabled: 1 }),
        buildAddon({ id: 'a2', addon_template_id: 1002, template_category: 'usage', is_enabled: 1 })
      ]
    }]
    // a1 在 z1 上隐藏 + 已有尺寸覆盖价 20：拖入只取消隐藏，价格必须原样保留
    h.sizeOverrides = [{ id: 'ov1', style_size_id: 'z1', style_addon_id: 'a1', price_override: 20, is_hidden: 1, style_id: 's1' }]
    h.saveAddonSettings.mockResolvedValue(savedAggregate('s1', [
      { id: 'a1', addon_template_id: 1001, template_category: 'usage', is_enabled: 1, price_override: 20 },
      { id: 'a2', addon_template_id: 1002, template_category: 'usage', is_enabled: 0 }
    ]))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    expect(h.saveAddonSettings).toHaveBeenCalledWith('s1', {
      styleAddonId: 'a1',
      styleEnabled: true,
      sizeOverrides: [{ sizeId: 'z1', priceOverride: 20, isHidden: false }]
    })
    // 普通（非孤儿）行：终态与旧两步写一致（目标启用 + 同类停用），只是互斥改由服务端推导后回传
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(style.addons.find(a => a.id === 'a2')!.is_enabled).toBe(0)
    expect(h.msgSuccess).toHaveBeenCalled()
    expect(h.msgInfo).not.toHaveBeenCalled()
  })

  // CONTRACT-1（交叉审计）：孤儿行（模板已删的快照增项，addon_template_id=null）没有模板 id，
  // 老 setStyleAddons 载荷既无法启用它自己，也没法把「同类的启用态孤儿兄弟」停掉。
  it('CONTRACT-1：孤儿目标行拖入尺寸 → 只调 saveAddonSettings（按行 id），不拼 setStyleAddons 载荷', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [
        buildAddon({ id: 'a2', addon_template_id: 1002, template_category: 'rush', is_enabled: 1 }),
        buildAddon({ id: 'a9', addon_template_id: null, template_name: '旧加急', template_category: 'rush', is_enabled: 0 })
      ]
    }]
    h.sizeOverrides = []
    h.saveAddonSettings.mockResolvedValue(savedAggregate('s1', [
      { id: 'a2', addon_template_id: 1002, template_category: 'rush', is_enabled: 0 },
      { id: 'a9', addon_template_id: null, template_name: '旧加急', template_category: 'rush', is_enabled: 1 }
    ]))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a9', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // 身份键是行 id（孤儿行唯一可用的键）；载荷里不出现任何模板 id
    expect(h.saveAddonSettings).toHaveBeenCalledTimes(1)
    expect(h.saveAddonSettings).toHaveBeenCalledWith('s1', {
      styleAddonId: 'a9',
      styleEnabled: true,
      sizeOverrides: [{ sizeId: 'z1', priceOverride: null, isHidden: false }]
    })
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    // 服务端互斥结果被采纳：孤儿行启用、同类在用行停用（旧实现是「停兄弟 + 孤儿仍停用」）
    expect(style.addons.find(a => a.id === 'a9')!.is_enabled).toBe(1)
    expect(style.addons.find(a => a.id === 'a2')!.is_enabled).toBe(0)
    expect(size._overrides?.a9.is_hidden).toBe(false)
    expect(h.msgSuccess).toHaveBeenCalled()
  })

  // XVB-2（交叉审计）：启用同类真实项时，**启用态的孤儿同类行**也必须被停用——
  // 这是服务端已钉死的不变量（style-addon-settings.test.ts TC-F1-05），旧前端拼装会因孤儿行无模板 id 整条跳过。
  it('XVB-2：启用同类真实项时，启用态孤儿兄弟由服务端停用（前端不再漏算互斥）', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [
        buildAddon({ id: 'a1', addon_template_id: 1001, template_category: 'usage', is_enabled: 0 }),
        buildAddon({ id: 'a8', addon_template_id: null, template_name: '旧用途', template_category: 'usage', is_enabled: 1 })
      ]
    }]
    h.sizeOverrides = []
    h.saveAddonSettings.mockResolvedValue(savedAggregate('s1', [
      { id: 'a1', addon_template_id: 1001, template_category: 'usage', is_enabled: 1 },
      { id: 'a8', addon_template_id: null, template_name: '旧用途', template_category: 'usage', is_enabled: 0 }
    ]))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // 前端只报「目标行 + 启用」，不再自己拼「停用兄弟」的载荷（它拼不出来：孤儿行没有模板 id）
    expect(h.saveAddonSettings).toHaveBeenCalledWith('s1', {
      styleAddonId: 'a1',
      styleEnabled: true,
      sizeOverrides: [{ sizeId: 'z1', priceOverride: null, isHidden: false }]
    })
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    // 采纳服务端结果：孤儿同类行已被停用，同类单选约束不破
    expect(style.addons.find(a => a.id === 'a8')!.is_enabled).toBe(0)
    expect(style.addons.find(a => a.id === 'a1')!.is_enabled).toBe(1)
  })
})

describe('ArtStyleManager 批量覆盖预载（N×M 消除批）', () => {
  beforeEach(() => {
    h.profile = { multi_style_enabled: true }
    h.styles = []
    h.sizeOverrides = []
    h.getAllSizeOverrides.mockClear()
    h.msgError.mockClear()
  })

  it('load 只发一次 getAllSizeOverrides，两个画风三个尺寸各自填好 _overrides', async () => {
    h.styles = [
      {
        id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
        sizes: [
          { id: 'z1', name: '头像', sort_order: 0, base_price: 100 },
          { id: 'z2', name: '半身', sort_order: 1, base_price: 200 }
        ],
        addons: [buildAddon({ id: 'a1' })]
      },
      {
        id: 's2', name: '写实', is_active: 1, sort_order: 1,
        sizes: [{ id: 'z3', name: '全身', sort_order: 0, base_price: 300 }],
        addons: [buildAddon({ id: 'a2' })]
      }
    ]
    h.sizeOverrides = [
      { id: 'ov1', style_size_id: 'z1', style_addon_id: 'a1', price_override: 20, is_hidden: 0, style_id: 's1' },
      { id: 'ov2', style_size_id: 'z2', style_addon_id: 'a1', price_override: null, is_hidden: 1, style_id: 's1' }
    ]

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm

    // 关键：全量端点只打一次（旧实现为 画风×尺寸 = 3 次 GET）
    expect(h.getAllSizeOverrides).toHaveBeenCalledTimes(1)
    expect(vm.styles[0].sizes[0]._overrides).toEqual({ a1: { price_override: 20, is_hidden: false } })
    expect(vm.styles[0].sizes[1]._overrides).toEqual({ a1: { price_override: null, is_hidden: true } })
    expect(vm.styles[1].sizes[0]._overrides).toEqual({}) // 该尺寸无覆盖记录 → 空表，不是 undefined
  })

  it('批量端点失败 → 所有尺寸 _overrides 退化为 {}，不弹错、不阻塞 load', async () => {
    h.styles = [{
      id: 's1', name: 'Q版', is_active: 1, sort_order: 0,
      sizes: [{ id: 'z1', name: '头像', sort_order: 0, base_price: 100 }],
      addons: [buildAddon({ id: 'a1' })]
    }]
    h.getAllSizeOverrides.mockRejectedValueOnce(new Error('batch boom'))

    const wrapper = await mountManager()
    const vm = wrapper.vm as unknown as ArtStyleManagerVm

    expect(vm.styles).toHaveLength(1) // load 未被预载失败拖垮
    expect(vm.styles[0].sizes[0]._overrides).toEqual({})
    expect(h.msgError).not.toHaveBeenCalled()
  })
})
