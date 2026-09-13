// P1-B（813-hunt）：ArtistDetailDrawer 三态 + 高危删除防护 + 窄屏抽屉
// 覆盖：资料/须知加载失败 → 横幅 + 禁用保存 + 重试恢复；
//       删除作品 → ElMessageBox.confirm（含作品名）、取消不删、行级 loading 防连点；
//       抽屉根类 detail-drawer（≤600px 宽度覆盖钩子）
// P3（9/13）：「设备」tab 补测——列表渲染（admin 全列含 last_login_ip）、三态（加载/空/有数据）、
//       加载失败横幅与重试、popconfirm 踢出、踢出在途锁（同账号安全页口径）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h as vnode, provide, inject } from 'vue'
import type { PropType, SetupContext } from 'vue'
import type { AdminDesktopDevice } from '../../../api/types'
import ArtistDetailDrawer from '../ArtistDetailDrawer.vue'

const h = vi.hoisted(() => ({
  getArtistProfile: vi.fn(),
  getArtistPricingOverview: vi.fn(),
  getArtistArtworks: vi.fn(),
  deleteArtistArtwork: vi.fn(),
  getArtistRules: vi.fn(),
  updateArtistProfile: vi.fn(),
  updateArtistRules: vi.fn(),
  getArtistDevices: vi.fn(),
  revokeArtistDevice: vi.fn(),
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
    updateArtistRules: h.updateArtistRules,
    // 设备 tab（管理端全列 GET 裸数组 + 单台踢出）
    getArtistDevices: h.getArtistDevices,
    revokeArtistDevice: h.revokeArtistDevice
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

/** 表格 stub：el-table 把 :data 下发给列，列逐行渲染 #default（设备 tab 为多行表，
 *  与 ArtistManage.deleted 的 RowColStub 同源手法，扩成按真实 data 迭代） */
const STUB_ROWS = Symbol('stub-table-rows')

const ElTableStub = {
  name: 'ElTable',
  props: { data: { type: Array as PropType<unknown[]>, default: () => [] } },
  setup(props: { data?: unknown[] }, { slots }: SetupContext) {
    provide(STUB_ROWS, () => props.data ?? [])
    return () => vnode('div', { class: 'table-stub' }, slots.default?.())
  }
}

const ElTableColumnStub = {
  name: 'ElTableColumn',
  props: { label: { type: String, default: '' } },
  setup(props: { label?: string }, { slots }: SetupContext) {
    const getRows = inject<() => unknown[]>(STUB_ROWS, () => [] as unknown[])
    return () => vnode('div', { class: 'col-stub' }, [
      vnode('span', { class: 'col-label' }, props.label ?? ''),
      ...getRows().map((row, i) => vnode('div', { class: 'cell-stub', key: i }, slots.default?.({ row })))
    ])
  }
}

/** popconfirm stub：渲染 reference 插槽 + 一个「确定」按钮触发 confirm 事件 */
const ElPopconfirmStub = {
  name: 'ElPopconfirm',
  props: { title: { type: String, default: '' } },
  emits: ['confirm'],
  setup(props: { title?: string }, { slots, emit }: SetupContext) {
    return () => vnode('div', { class: 'popconfirm-stub' }, [
      vnode('span', { class: 'pc-title' }, props.title ?? ''),
      // 触发器（reference 插槽内的踢出按钮）包一层 pc-ref 便于定位，span 不影响按钮结构
      vnode('span', { class: 'pc-ref' }, slots.reference?.()),
      vnode('button', { class: 'pc-ok', type: 'button', onClick: () => emit('confirm') })
    ])
  }
}

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
  'el-tab-pane': { name: 'ElTabPane', props: ['name'], template: '<div class="tab-pane-stub" :data-pane="name"><slot /></div>' },
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
  'el-empty': { name: 'ElEmpty', props: ['description'], template: '<div class="empty-stub">{{ description }}</div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-popconfirm': ElPopconfirmStub
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
  h.getArtistDevices.mockReset().mockResolvedValue([])
  h.revokeArtistDevice.mockReset().mockResolvedValue({ success: true })
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

// ─── 桌面登录设备 tab（管理端查看 + 单台踢出）────────────────────────
// 9/3 回流批上线后前端零测试（后端已有 10 例）， P3（9/13）补齐渲染与交互防线。
// 面板选择器统一走 [data-pane="devices"]：其余 pane 在 stub 下也全部渲染，
// 价格/作品面板的空态 el-empty 会与之同构，不限定就会假绿。

/** 设备行 fixture（管理端全列；IP 用文档保留段 198.51.100.x） */
function deviceRow(overrides: Partial<AdminDesktopDevice> = {}): AdminDesktopDevice {
  return {
    id: 21, artist_id: 1, device_uuid: 'dev-uuid-21', device_name: 'Studio-PC',
    created_at: '2026-08-01T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z',
    last_active_at: '2026-09-10T08:00:00.000Z', last_login_ip: '198.51.100.23',
    ...overrides
  }
}

/** 设备面板子树 */
function devicesPane(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('[data-pane="devices"]')
}

/** 设备表体单元格（列序：名称/最近活跃/到期/IP/操作，每列逐行一 cell） */
function deviceCells(wrapper: ReturnType<typeof mount>) {
  return devicesPane(wrapper).findAll('.cell-stub')
}

/** 各行的踢出确认按钮（popconfirm 内部「确定」） */
function pcOkButtons(wrapper: ReturnType<typeof mount>) {
  return devicesPane(wrapper).findAll('.pc-ok')
}

/** 各行的踢出触发按钮（受在途锁 disabled 控制的那一个） */
function removeButtons(wrapper: ReturnType<typeof mount>) {
  return devicesPane(wrapper).findAll('.pc-ref button')
}

describe('ArtistDetailDrawer 设备 tab 列表渲染与三态（P3 补测）', () => {
  it('未切 tab 不预拉；切过去才调 getArtistDevices 并逐行渲染（含 last_login_ip，null 兜底「-」）', async () => {
    h.getArtistDevices.mockResolvedValue([
      deviceRow(),
      deviceRow({ id: 22, device_name: null, last_login_ip: null })
    ])
    const wrapper = mountDrawer()
    await flushPromises()
    expect(h.getArtistDevices).not.toHaveBeenCalled()

    await switchTab(wrapper, 'devices')
    expect(h.getArtistDevices).toHaveBeenCalledWith(1)
    expect(devicesPane(wrapper).find('.table-stub').exists()).toBe(true)
    // 5 列 × 2 行
    expect(deviceCells(wrapper)).toHaveLength(10)
    const cells = deviceCells(wrapper)
    expect(cells[0].text()).toBe('Studio-PC') // 名称列第一行
    expect(cells[1].text()).toBe('-') // device_name 为 null 兜底
    // IP 列：第一行有值（管理端字段是 last_login_ip，非画师端 login_ip），第二行 null 兜底
    expect(cells[6].text()).toBe('198.51.100.23')
    expect(cells[7].text()).toBe('-')
    // 表头标签与踢出确认文案逐行渲染
    expect(devicesPane(wrapper).text()).toContain('account.devicesIp')
    expect(devicesPane(wrapper).findAll('.pc-title')).toHaveLength(2)
    expect(devicesPane(wrapper).findAll('.pc-title')[0].text()).toBe('account.devicesRemoveConfirm')
  })

  it('加载中：不出表格也不出空态（防在途期间误显示「暂无设备」）', async () => {
    let resolveList: ((rows: AdminDesktopDevice[]) => void) | undefined
    h.getArtistDevices.mockReturnValue(new Promise<AdminDesktopDevice[]>((resolve) => { resolveList = resolve }))
    const wrapper = mountDrawer()
    await flushPromises()

    await switchTab(wrapper, 'devices')
    expect(devicesPane(wrapper).find('.table-stub').exists()).toBe(false)
    expect(devicesPane(wrapper).find('.empty-stub').exists()).toBe(false)

    resolveList!([deviceRow()])
    await flushPromises()
    expect(devicesPane(wrapper).find('.table-stub').exists()).toBe(true)
    expect(devicesPane(wrapper).find('.empty-stub').exists()).toBe(false)
  })

  it('空清单 → 设备面板显示空态文案、无表格', async () => {
    h.getArtistDevices.mockResolvedValue([])
    const wrapper = mountDrawer()
    await flushPromises()

    await switchTab(wrapper, 'devices')
    expect(devicesPane(wrapper).find('.table-stub').exists()).toBe(false)
    expect(devicesPane(wrapper).find('.empty-stub').exists()).toBe(true)
    expect(devicesPane(wrapper).find('.empty-stub').text()).toBe('account.devicesEmpty')
  })

  it('加载失败 → 错误横幅（非静默）+ 重试恢复列表', async () => {
    h.getArtistDevices.mockRejectedValueOnce(new Error('devices boom')).mockResolvedValue([deviceRow()])
    const wrapper = mountDrawer()
    await flushPromises()

    await switchTab(wrapper, 'devices')
    const banner = devicesPane(wrapper).find('.load-error-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('account.devicesLoadFailed')
    expect(devicesPane(wrapper).find('.table-stub').exists()).toBe(false)

    await banner.find('button').trigger('click')
    await flushPromises()
    expect(h.getArtistDevices).toHaveBeenCalledTimes(2)
    expect(devicesPane(wrapper).find('.load-error-banner').exists()).toBe(false)
    expect(devicesPane(wrapper).find('.table-stub').exists()).toBe(true)
  })
})

describe('ArtistDetailDrawer 设备 tab 踢出（P3 补测）', () => {
  it('点确认才生效：revokeArtistDevice(artistId, deviceId) → 成功提示并刷新列表', async () => {
    h.getArtistDevices.mockResolvedValue([deviceRow(), deviceRow({ id: 22, device_name: 'Laptop' })])
    const wrapper = mountDrawer()
    await flushPromises()
    await switchTab(wrapper, 'devices')

    // popconfirm 未确认前不发请求（确认卡是默认收起的）
    expect(h.revokeArtistDevice).not.toHaveBeenCalled()

    await pcOkButtons(wrapper)[0].trigger('click')
    await flushPromises()

    expect(h.revokeArtistDevice).toHaveBeenCalledTimes(1)
    expect(h.revokeArtistDevice).toHaveBeenCalledWith(1, 21)
    expect(h.msgSuccess).toHaveBeenCalledWith('common.deleted')
    expect(h.getArtistDevices).toHaveBeenCalledTimes(2)
  })

  it('在途锁：请求挂起期间重复点确认不重发（含他行），按钮全程 disabled；完成后解锁', async () => {
    h.getArtistDevices.mockResolvedValue([deviceRow(), deviceRow({ id: 22, device_name: 'Laptop' })])
    let resolveRevoke: ((result: { success: boolean }) => void) | undefined
    h.revokeArtistDevice.mockReturnValueOnce(new Promise<{ success: boolean }>((resolve) => { resolveRevoke = resolve }))
    const wrapper = mountDrawer()
    await flushPromises()
    await switchTab(wrapper, 'devices')

    await pcOkButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(h.revokeArtistDevice).toHaveBeenCalledTimes(1)
    // 挂起期间：两行的踢出按钮均禁用（:disabled="removingDeviceId != null"，他行也锁）
    expect(removeButtons(wrapper)).toHaveLength(2)
    for (const btn of removeButtons(wrapper)) {
      expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    }
    // 再点同一行确认 + 他行确认均被在途锁拦下
    await pcOkButtons(wrapper)[0].trigger('click')
    await pcOkButtons(wrapper)[1].trigger('click')
    await flushPromises()
    expect(h.revokeArtistDevice).toHaveBeenCalledTimes(1)

    resolveRevoke!({ success: true })
    await flushPromises()
    expect(removeButtons(wrapper)[0].element.hasAttribute('disabled')).toBe(false)
  })

  it('踢出失败 → 错误提示且锁释放（可重试）', async () => {
    h.getArtistDevices.mockResolvedValue([deviceRow()])
    h.revokeArtistDevice.mockRejectedValueOnce(new Error('revoke boom'))
    const wrapper = mountDrawer()
    await flushPromises()
    await switchTab(wrapper, 'devices')

    await pcOkButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(h.msgError).toHaveBeenCalledWith('account.devicesRemoveFailed')
    expect(h.getArtistDevices).toHaveBeenCalledTimes(1) // 失败不刷新列表

    await pcOkButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(h.revokeArtistDevice).toHaveBeenCalledTimes(2) // 锁已释放，可重试
  })
})
