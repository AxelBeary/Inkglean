// GHSA-6pf3-g4xq-854w 纵深：管理员行不显示管理端 TOTP 按钮测试
// 覆盖：非管理员行显示「绑定」/「重绑」（admin.totpBind / admin.totpRebind）；
//       管理员行不显示该按钮；管理员行打开页面后 adminApi.totpBindInit 未被调用。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import type { SetupContext } from 'vue'
import ArtistManage from '../ArtistManage.vue'

const hoisted = vi.hoisted(() => ({
  getArtists: vi.fn(),
  totpBindInit: vi.fn(),
  totpBindConfirm: vi.fn(),
  totpReset: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: hoisted.getArtists,
    totpBindInit: hoisted.totpBindInit,
    totpBindConfirm: hoisted.totpBindConfirm,
    totpReset: hoisted.totpReset,
    transferAdmin: vi.fn(),
    createArtist: vi.fn(),
    deleteArtist: vi.fn(),
    updateArtistStatus: vi.fn(),
    getArtistOrders: vi.fn()
  },
  complianceApi: {
    banArtist: vi.fn(),
    unbanArtist: vi.fn(),
    homeTakedown: vi.fn(),
    homeRestore: vi.fn()
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
    success: hoisted.msgSuccess,
    error: hoisted.msgError,
    warning: hoisted.msgWarning
  },
  ElMessageBox: { confirm: hoisted.confirm, prompt: hoisted.prompt }
}))

vi.mock('../ArtistDetailDrawer.vue', () => ({
  default: { name: 'ArtistDetailDrawer', template: '<div />' }
}))

vi.mock('../../../components/artist/visual/CardHead.vue', () => ({
  default: { name: 'CardHead', template: '<div />' }
}))

vi.mock('../../../components/admin/StepUpDialog.vue', () => ({
  default: {
    name: 'StepUpDialog',
    props: ['modelValue'],
    emits: ['verified', 'cancel'],
    template: '<div />'
  }
}))

// TotpBindDialog stub：阻止真实组件挂载时触发 bind-init（该行为由 ArtistManage v-if 守卫负责）
vi.mock('../../../components/admin/artist-manage/TotpBindDialog.vue', () => ({
  default: {
    name: 'TotpBindDialog',
    props: ['modelValue', 'artist'],
    emits: ['refresh'],
    template: '<div v-if="modelValue" class="totp-dialog-stub" />'
  }
}))

vi.mock('../../../components/admin/artist-manage/InviteCodesDialog.vue', () => ({
  default: { name: 'InviteCodesDialog', template: '<div />', expose: ['openInviteCodes'] }
}))
vi.mock('../../../components/admin/artist-manage/RecycleBinDialog.vue', () => ({
  default: { name: 'RecycleBinDialog', template: '<div />' }
}))
vi.mock('../../../components/admin/artist-manage/DeletedArtistsDialog.vue', () => ({
  default: { name: 'DeletedArtistsDialog', template: '<div />', emits: ['restored'] }
}))

interface ArtistRow {
  id: number
  name: string
  subdomain: string
  qq_number: string
  bio: string | null
  isAdmin: boolean
  is_banned: number
  status: string
  totp_verified: boolean
  home_takedown_at: string | null
}

let currentRow: ArtistRow = {
  id: 0, name: '', subdomain: '', qq_number: '', bio: null,
  isAdmin: false, is_banned: 0, status: '', totp_verified: false, home_takedown_at: null
}

const RowColStub = {
  name: 'RowColStub',
  setup(_props: Record<string, unknown>, { slots }: SetupContext) {
    return () => h('div', { class: 'col-stub' }, [
      slots.default ? slots.default({ row: currentRow }) : []
    ])
  }
}

const EP_STUBS = {
  'el-button': {
    inheritAttrs: false,
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': RowColStub,
  'el-select': { template: '<div />' },
  'el-option': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-input-number': { template: '<div />' },
  'el-dialog': {
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
  'el-empty': { template: '<div />' },
  'el-icon': { template: '<i><slot /></i>' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

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
  return wrapper
}

function buttonTexts(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').map((b) => b.text())
}

beforeEach(() => {
  hoisted.totpBindInit.mockReset().mockResolvedValue({ qrDataUrl: 'data:image/png;base64,fake' })
  hoisted.totpBindConfirm.mockReset().mockResolvedValue({ success: true })
  hoisted.totpReset.mockReset().mockResolvedValue({ success: true })
  hoisted.msgSuccess.mockReset()
  hoisted.msgError.mockReset()
  hoisted.msgWarning.mockReset()
  hoisted.confirm.mockReset().mockResolvedValue('confirm')
  hoisted.prompt.mockReset().mockResolvedValue({ value: '' })
})

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage TOTP 按钮管理员守卫（GHSA-6pf3-g4xq-854w 纵深）', () => {
  it('非管理员未绑定行：显示「绑定」按钮（admin.totpBind）', async () => {
    currentRow = { id: 5, name: 'Artist', subdomain: 'art', qq_number: '10005', bio: null, isAdmin: false, is_banned: 0, status: 'open', totp_verified: false, home_takedown_at: null }
    hoisted.getArtists.mockResolvedValue([currentRow])
    const wrapper = await mountPage()
    expect(buttonTexts(wrapper)).toContain('admin.totpBind')
  })

  it('非管理员已绑定行：显示「重绑」按钮（admin.totpRebind）', async () => {
    currentRow = { id: 5, name: 'Artist', subdomain: 'art', qq_number: '10005', bio: null, isAdmin: false, is_banned: 0, status: 'open', totp_verified: true, home_takedown_at: null }
    hoisted.getArtists.mockResolvedValue([currentRow])
    const wrapper = await mountPage()
    expect(buttonTexts(wrapper)).toContain('admin.totpRebind')
  })

  it('管理员行：不显示管理端「绑定」或「重绑」TOTP 按钮', async () => {
    currentRow = { id: 1, name: 'Admin', subdomain: 'root', qq_number: '10001', bio: null, isAdmin: true, is_banned: 0, status: 'open', totp_verified: true, home_takedown_at: null }
    hoisted.getArtists.mockResolvedValue([currentRow])
    const wrapper = await mountPage()
    const texts = buttonTexts(wrapper)
    expect(texts).not.toContain('admin.totpBind')
    expect(texts).not.toContain('admin.totpRebind')
  })

  it('管理员行：页面加载后 adminApi.totpBindInit 未被调用', async () => {
    currentRow = { id: 1, name: 'Admin', subdomain: 'root', qq_number: '10001', bio: null, isAdmin: true, is_banned: 0, status: 'open', totp_verified: true, home_takedown_at: null }
    hoisted.getArtists.mockResolvedValue([currentRow])
    await mountPage()
    await flushPromises()
    expect(hoisted.totpBindInit).not.toHaveBeenCalled()
  })
})
