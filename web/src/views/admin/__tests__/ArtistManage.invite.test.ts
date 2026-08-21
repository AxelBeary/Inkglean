// ArtistManage.invite.test.ts
// REQ-039 升级：邀请码弹窗「多次使用码 + 服务端筛选/分页 + 使用记录」。
// 覆盖：默认拉第 1 页（pageSize=20）；状态筛选/搜索任一变更回第 1 页重拉；
//       expired 展示态（status=unused 且 expired=true → 已过期）；多次码打开使用记录；生成携带 maxUses。
// mock 基建对齐 ArtistManage.filter.test.ts。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArtistManage from '../ArtistManage.vue'

const h = vi.hoisted(() => ({
  getArtists: vi.fn(),
  getInviteCodes: vi.fn(),
  generateInviteCodes: vi.fn(),
  getInviteCodeUses: vi.fn(),
  revokeInviteCode: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: h.getArtists,
    getInviteCodes: h.getInviteCodes,
    generateInviteCodes: h.generateInviteCodes,
    getInviteCodeUses: h.getInviteCodeUses,
    revokeInviteCode: h.revokeInviteCode
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

// script-setup 暴露面（最小必要断言）
interface InviteVM {
  inviteCodes: Array<Record<string, unknown>>
  inviteTotal: number
  invitePage: number
  inviteStatusFilter: string
  inviteQuery: string
  inviteMaxUses: number
  inviteUses: Array<Record<string, unknown>>
  inviteUsesVisible: boolean
  openInviteCodes: () => Promise<void>
  onInviteFilterChange: () => void
  openInviteUses: (row: Record<string, unknown>) => Promise<void>
  generateInviteCodes: () => Promise<void>
  inviteDisplayStatus: (row: Record<string, unknown>) => string
  inviteStatusLabelKey: (row: Record<string, unknown>) => string
}

/** 构造一条邀请码行（默认未使用单次码） */
function code(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    code: 'ABCD1234',
    status: 'unused',
    expiresAt: '2026-09-01T00:00:00Z',
    usedAt: null,
    createdAt: '2026-08-20T00:00:00Z',
    createdBy: 1,
    usedBy: null,
    maxUses: 1,
    useCount: 0,
    expired: false,
    ...over
  }
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
  return { wrapper, vm: wrapper.vm as unknown as InviteVM }
}

beforeEach(() => {
  h.getArtists.mockReset().mockResolvedValue([])
  h.getInviteCodes.mockReset().mockResolvedValue({ codes: [], total: 0, page: 1, pageSize: 20 })
  h.generateInviteCodes.mockReset().mockResolvedValue({ codes: [] })
  h.getInviteCodeUses.mockReset().mockResolvedValue({ uses: [] })
  h.revokeInviteCode.mockReset().mockResolvedValue({ success: true, code: '', status: 'revoked' })
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.msgWarning.mockReset()
  h.confirm.mockReset().mockResolvedValue('confirm')
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 邀请码弹窗（REQ-039 升级）', () => {
  it('打开弹窗默认拉第 1 页（pageSize=20，无 status/q）并回填 total', async () => {
    h.getInviteCodes.mockResolvedValue({ codes: [code()], total: 42, page: 1, pageSize: 20 })
    const { vm } = await mountPage()
    await vm.openInviteCodes()
    await flushPromises()
    expect(h.getInviteCodes).toHaveBeenCalledWith({ status: undefined, q: undefined, page: 1, pageSize: 20 })
    expect(vm.inviteCodes.length).toBe(1)
    expect(vm.inviteTotal).toBe(42)
  })

  it('状态筛选变更 → 回第 1 页并带 status 重拉', async () => {
    const { vm } = await mountPage()
    await vm.openInviteCodes()
    vm.invitePage = 3
    vm.inviteStatusFilter = 'expired'
    vm.onInviteFilterChange()
    await flushPromises()
    expect(vm.invitePage).toBe(1)
    const last = h.getInviteCodes.mock.calls[h.getInviteCodes.mock.calls.length - 1][0]
    expect(last.status).toBe('expired')
    expect(last.page).toBe(1)
  })

  it('搜索词两端空白不传 q，非空 trim 后传', async () => {
    const { vm } = await mountPage()
    await vm.openInviteCodes()
    vm.inviteQuery = '   '
    vm.onInviteFilterChange()
    await flushPromises()
    expect(h.getInviteCodes.mock.calls[h.getInviteCodes.mock.calls.length - 1][0].q).toBeUndefined()
    vm.inviteQuery = '  ABC '
    vm.onInviteFilterChange()
    await flushPromises()
    expect(h.getInviteCodes.mock.calls[h.getInviteCodes.mock.calls.length - 1][0].q).toBe('ABC')
  })

  it('expired 展示态：status=unused 且 expired=true → 已过期标签 key', async () => {
    const { vm } = await mountPage()
    expect(vm.inviteDisplayStatus(code({ status: 'unused', expired: true }))).toBe('expired')
    expect(vm.inviteStatusLabelKey(code({ status: 'unused', expired: true }))).toBe('invite.statusExpired')
    expect(vm.inviteDisplayStatus(code({ status: 'used', expired: false }))).toBe('used')
    expect(vm.inviteStatusLabelKey(code({ status: 'revoked' }))).toBe('invite.statusRevoked')
  })

  it('多次码打开使用记录子弹窗（调 uses API 并回填）', async () => {
    h.getInviteCodeUses.mockResolvedValue({
      uses: [{ artistId: 9, name: '小王', qqNumber: '123', subdomain: 'w', usedAt: '2026-08-21T00:00:00Z' }]
    })
    const { vm } = await mountPage()
    await vm.openInviteUses(code({ id: 7, maxUses: 5, useCount: 1 }))
    await flushPromises()
    expect(h.getInviteCodeUses).toHaveBeenCalledWith(7)
    expect(vm.inviteUsesVisible).toBe(true)
    expect(vm.inviteUses.length).toBe(1)
    expect(vm.inviteUses[0].name).toBe('小王')
  })

  it('生成时携带 maxUses，并在超出 1-100 时告警拦截', async () => {
    h.generateInviteCodes.mockResolvedValue({ codes: [{ id: 1, code: 'X', expiresAt: '' }] })
    const { vm } = await mountPage()
    await vm.openInviteCodes()
    vm.inviteMaxUses = 10
    await vm.generateInviteCodes()
    await flushPromises()
    expect(h.generateInviteCodes).toHaveBeenCalledWith({ count: 5, validDays: 3, maxUses: 10 })
    // 超范围 → 告警且不发请求
    h.generateInviteCodes.mockClear()
    vm.inviteMaxUses = 101
    await vm.generateInviteCodes()
    expect(h.generateInviteCodes).not.toHaveBeenCalled()
    expect(h.msgWarning).toHaveBeenCalled()
  })
})
