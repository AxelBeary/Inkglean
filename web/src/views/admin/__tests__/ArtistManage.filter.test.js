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
  useI18n: () => ({ t: (key) => key })
}))

vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key) => key } },
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

const mountedWrappers = []

async function mountPage() {
  const wrapper = mount(ArtistManage, {
    global: {
      mocks: { $t: (key) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  await flushPromises()
  return wrapper
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
    const wrapper = await mountPage()
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([1, 2, 3])
    expect(wrapper.vm.isArtistFiltering).toBe(false)
  })

  it('昵称模糊匹配且大小写不敏感', async () => {
    const wrapper = await mountPage()
    wrapper.vm.artistQuery = 'BOB'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([2])
    wrapper.vm.artistQuery = 'ali'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([1])
  })

  it('子域名 / QQ / 简介均可命中（bio 为 null 不崩）', async () => {
    const wrapper = await mountPage()
    wrapper.vm.artistQuery = 'chinatsu'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([3])
    wrapper.vm.artistQuery = '10002'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([2])
    wrapper.vm.artistQuery = '水彩'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([3])
  })

  it('状态精确过滤 + 与搜索词组合', async () => {
    const wrapper = await mountPage()
    wrapper.vm.artistStatusFilter = 'open'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([1])
    expect(wrapper.vm.isArtistFiltering).toBe(true)
    // 组合：状态 break + 搜索词命中 Bob
    wrapper.vm.artistStatusFilter = 'break'
    wrapper.vm.artistQuery = 'bob'
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([2])
    // 组合不相交 → 空
    wrapper.vm.artistStatusFilter = 'full'
    expect(wrapper.vm.filteredArtists).toEqual([])
  })

  it('搜索词两端空白被忽略', async () => {
    const wrapper = await mountPage()
    wrapper.vm.artistQuery = '   '
    expect(wrapper.vm.filteredArtists.map(a => a.id)).toEqual([1, 2, 3])
    expect(wrapper.vm.isArtistFiltering).toBe(false)
  })
})
