// ArtistManage.filter.test.js
// E14（2026-08-14）: 画师管理搜索 + 状态筛选（客户端过滤逻辑）
// 覆盖：昵称/子域名/QQ/简介模糊匹配（大小写不敏感）；状态精确过滤；组合条件；无条件全量。
// mock 基建对齐 ArtistManage.orders.test.js。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArtistManage from '../ArtistManage.vue'

const h = vi.hoisted(() => ({
  getArtists: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: h.getArtists
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: h.msgSuccess,
    error: h.msgError,
    warning: h.msgWarning
  },
  ElMessageBox: { confirm: h.confirm }
}))

vi.mock('../ArtistDetailDrawer.vue', () => ({
  default: { name: 'ArtistDetailDrawer', template: '<div />' }
}))

vi.mock('../../../components/artist/visual/CardHead.vue', () => ({
  default: { name: 'CardHead', template: '<div />' }
}))

vi.mock('../../../components/admin/StepUpDialog.vue', () => ({
  default: { name: 'StepUpDialog', template: '<div />' }
}))

const EP_STUBS = {
  'el-button': {
    inheritAttrs: false,
    props: ['loading', 'disabled'],
    template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': { template: '<div class="col-stub" />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-input-number': { template: '<div />' },
  'el-dialog': {
    name: 'ElDialog',
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="dialog-stub"><slot /><slot name="footer" /></div>'
  },
  'el-input': {
    props: ['modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'el-form': { template: '<div><slot /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  'el-empty': { name: 'ElEmpty', template: '<div class="empty-stub" />' },
  'el-icon': { template: '<i><slot /></i>' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

// 被测组件仍为 JS script-setup：vm 暴露面以局部 interface 描述（最小必要断言）
interface ArtistManageVM {
  filteredArtists: { id: number }[]
  isArtistFiltering: boolean
  artistQuery: string
  artistStatusFilter: string
}

async function mountPage() {
  const wrapper = mount(ArtistManage, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return { wrapper, vm: wrapper.vm as unknown as ArtistManageVM }
}

beforeEach(() => {
  h.getArtists.mockReset().mockResolvedValue([
    { id: 1, name: 'Alice', subdomain: 'alice', qq_number: '10001', bio: '日系头像', isAdmin: true, status: 'open', totp_verified: true },
    { id: 2, name: 'Bob', subdomain: 'bob', qq_number: '10002', bio: null, isAdmin: false, status: 'break', totp_verified: false },
    { id: 3, name: '千夏', subdomain: 'chinatsu', qq_number: '10003', bio: '水彩插画', isAdmin: false, status: 'full', totp_verified: false }
  ])
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.msgWarning.mockReset()
  h.confirm.mockReset().mockResolvedValue('confirm')
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 搜索 + 状态筛选（E14）', () => {
  it('无条件显示全部', async () => {
    const { vm } = await mountPage()
    expect(vm.filteredArtists.map(a => a.id)).toEqual([1, 2, 3])
    expect(vm.isArtistFiltering).toBe(false)
  })

  it('昵称模糊匹配且大小写不敏感', async () => {
    const { vm } = await mountPage()
    vm.artistQuery = 'BOB'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([2])
    vm.artistQuery = 'ali'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([1])
  })

  it('子域名 / QQ / 简介均可命中（bio 为 null 不崩）', async () => {
    const { vm } = await mountPage()
    vm.artistQuery = 'chinatsu'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([3])
    vm.artistQuery = '10002'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([2])
    vm.artistQuery = '水彩'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([3])
  })

  it('状态精确过滤 + 与搜索词组合', async () => {
    const { vm } = await mountPage()
    vm.artistStatusFilter = 'open'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([1])
    expect(vm.isArtistFiltering).toBe(true)
    // 组合：状态 break + 搜索词命中 Bob
    vm.artistStatusFilter = 'break'
    vm.artistQuery = 'bob'
    expect(vm.filteredArtists.map(a => a.id)).toEqual([2])
    // 组合不相交 → 空
    vm.artistStatusFilter = 'full'
    expect(vm.filteredArtists).toEqual([])
  })

  it('搜索词两端空白被忽略', async () => {
    const { vm } = await mountPage()
    vm.artistQuery = '   '
    expect(vm.filteredArtists.map(a => a.id)).toEqual([1, 2, 3])
    expect(vm.isArtistFiltering).toBe(false)
  })
})
