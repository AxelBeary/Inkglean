// F0192 单事务（原围剿 a1-14 两步写的收口）：onDropToSize 启用改走 saveAddonSettings 后，
// 「互斥已落库、尺寸覆盖失败」的中间态在数据层已不可能出现，反向补偿也随之作废。
// 本文件守住替代后的等价不变量：**失败不产生任何部分写入，且本地被重载拉回服务端真相**。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

interface StyleSize {
  id: string
  sort_order: number
  base_price: number
  _overrides: Record<string, { price_override: number | null; is_hidden: boolean }>
}

interface StyleAddon {
  id: string
  // 与生产类型一致（style-manage/types.ts ManagerSa）：孤儿行是 null
  addon_template_id: number | null
  template_name: string
  template_category: string
  is_enabled: number
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
  dragPayload: DragPayload | null
  onDropToSize(style: ArtStyle, size: StyleSize, extra: Record<string, unknown>): Promise<unknown> | unknown
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const h = vi.hoisted(() => ({
  styles: [] as ArtStyle[],
  getArtStyles: vi.fn(),
  getProfile: vi.fn(),
  getArtworks: vi.fn(),
  getAddonTemplates: vi.fn(),
  getAllSizeOverrides: vi.fn(),
  setStyleAddons: vi.fn(),
  setSizeOverrides: vi.fn(),
  saveAddonSettings: vi.fn(),
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
    updateProfile: vi.fn(),
    updateArtStyle: vi.fn(),
    updateStyleSize: vi.fn(),
    deleteArtStyle: vi.fn(),
    deleteStyleSize: vi.fn(),
    createAddonTemplate: vi.fn()
  }
}))

import ArtStyleManager from '../ArtStyleManager.vue'

/** F0192 保存响应（服务端聚合后的本画风增项行；sizeOverrides 本文件不消费） */
function savedAggregate(rows: Array<Partial<StyleAddon> & { id: string }>) {
  return {
    addons: rows.map(r => ({
      id: r.id,
      art_style_id: 's1',
      addon_template_id: r.addon_template_id ?? null,
      is_enabled: typeof r.is_enabled === 'number' ? r.is_enabled : 1,
      price_override: null,
      template_name: r.template_name ?? '增项-' + r.id,
      template_control_type: 'switch',
      template_price_mode: 'fixed',
      template_default_price: 100,
      template_unit_label: null,
      template_category: r.template_category ?? 'usage',
      template_max_quantity: null,
      detached: (r.addon_template_id ?? null) === null
    })),
    sizeOverrides: []
  }
}

function buildStyles(): ArtStyle[] {
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
      { id: 'a1', addon_template_id: 1001, template_name: '用途A', template_category: 'usage', is_enabled: 1 },
      { id: 'a2', addon_template_id: 1002, template_name: '用途B', template_category: 'usage', is_enabled: 1 }
    ]
  }]
}

async function mountManager() {
  // 每次返回深拷贝——模拟后端独立数据，本地乐观变更不会污染重载结果
  h.getArtStyles.mockImplementation(() => Promise.resolve(JSON.parse(JSON.stringify(h.styles))))
  h.getProfile.mockResolvedValue({ multi_style_enabled: true })
  h.getArtworks.mockResolvedValue([])
  h.getAddonTemplates.mockResolvedValue([])
  // 预载尺寸覆盖（批量端点）：a1 在 z1 上隐藏（拖入即启用路径的前提）
  h.getAllSizeOverrides.mockResolvedValue([
    { id: 1, style_size_id: 'z1', style_addon_id: 'a1', price_override: null, is_hidden: 1, style_id: 's1' }
  ])
  const wrapper = shallowMount(ArtStyleManager, {
    global: {
      mocks: { $t: (key: string) => key, $tm: () => [] },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('ArtStyleManager 增项拖入尺寸：F0192 单事务的失败/成功一致性', () => {
  beforeEach(() => {
    h.styles = buildStyles()
    h.setStyleAddons.mockReset()
    h.setSizeOverrides.mockReset()
    h.saveAddonSettings.mockReset()
    h.getArtStyles.mockClear()
    h.msgSuccess.mockClear()
    h.msgError.mockClear()
    h.msgInfo.mockClear()
  })

  it('单事务失败 → 零老端点调用（无部分写入）+ 重载兜底，本地回到服务端真相', async () => {
    h.saveAddonSettings.mockRejectedValue(new Error('save boom'))
    const wrapper = await mountManager()

    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    // 一次提交、载荷只有「目标行 + 启用 + 本尺寸取消隐藏」
    expect(h.saveAddonSettings).toHaveBeenCalledTimes(1)
    expect(h.saveAddonSettings).toHaveBeenCalledWith('s1', {
      styleAddonId: 'a1',
      styleEnabled: true,
      sizeOverrides: [{ sizeId: 'z1', priceOverride: null, isHidden: false }]
    })
    // 全成全败：不再有「mutex 成功 → 尺寸覆盖失败」的中间态，故不存在反向补偿写入
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    // 整体重载保证本地一致（挂载 1 次 + 失败 1 次）
    expect(h.getArtStyles).toHaveBeenCalledTimes(2)
    expect(h.msgError).toHaveBeenCalledWith('save boom')
    expect(h.msgSuccess).not.toHaveBeenCalled()

    // 重载后 a2 仍是启用态（服务端未被写入任何东西）
    const reloadedStyle = (wrapper.vm as unknown as ArtStyleManagerVm).styles[0]
    expect(reloadedStyle.addons.find(a => a.id === 'a2')!.is_enabled).toBe(1)
  })

  it('单事务成功 → 采纳服务端聚合、尺寸覆盖取消隐藏，不再有第二步写入', async () => {
    h.saveAddonSettings.mockResolvedValue(savedAggregate([
      { id: 'a1', addon_template_id: 1001, template_name: '用途A', is_enabled: 1 },
      { id: 'a2', addon_template_id: 1002, template_name: '用途B', is_enabled: 0 }
    ]))
    const wrapper = await mountManager()

    const vm = wrapper.vm as unknown as ArtStyleManagerVm
    const style = vm.styles[0]
    const size = style.sizes[0]
    vm.dragPayload = { styleId: 's1', saId: 'a1', fromSizeId: null }
    await vm.onDropToSize(style, size, {})
    await flushPromises()

    expect(h.saveAddonSettings).toHaveBeenCalledTimes(1)
    expect(h.setStyleAddons).not.toHaveBeenCalled()
    expect(h.setSizeOverrides).not.toHaveBeenCalled()
    expect(size._overrides.a1.is_hidden).toBe(false)
    expect(h.msgSuccess).toHaveBeenCalled()
    // 同类互斥由服务端推导后回传（a2 停用），本地跟随而不自算
    expect(style.addons.find(a => a.id === 'a2')!.is_enabled).toBe(0)
    expect(style.addons.find(a => a.id === 'a1')!.is_enabled).toBe(1)
  })
})
