// 登录留痕批（v72）: ArtistManage 列表「上次登录」相对时间 + 悬浮完整时间+IP
// mock 基建对齐 ArtistManage.filter.test.ts；el-table-column 被 stub，故直测展示函数（vm setup state）
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

// script-setup 绑定经 vm 可直测（与 filter 测试同口径）
interface LastLoginVM {
  relativeLastLogin: (row: { last_login_at: string | null; last_login_ip: string | null }) => string
  lastLoginTooltip: (row: { last_login_at: string | null; last_login_ip: string | null }) => string
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
  return { wrapper, vm: wrapper.vm as unknown as LastLoginVM }
}

beforeEach(() => {
  h.getArtists.mockReset().mockResolvedValue([])
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.msgWarning.mockReset()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 上次登录相对时间（登录留痕批 v72）', () => {
  it('无记录 → 尚未登录', async () => {
    const { vm } = await mountPage()
    expect(vm.relativeLastLogin({ last_login_at: null, last_login_ip: null })).toBe('admin.lastLogin.never')
  })

  it('<1 分钟 → 刚刚；30 分钟 → minutesAgo；5 小时 → hoursAgo；3 天 → daysAgo', async () => {
    const { vm } = await mountPage()
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
    expect(vm.relativeLastLogin({ last_login_at: ago(30_000), last_login_ip: null })).toBe('admin.lastLogin.justNow')
    expect(vm.relativeLastLogin({ last_login_at: ago(30 * 60_000), last_login_ip: null })).toBe('admin.lastLogin.minutesAgo')
    expect(vm.relativeLastLogin({ last_login_at: ago(5 * 3_600_000), last_login_ip: null })).toBe('admin.lastLogin.hoursAgo')
    expect(vm.relativeLastLogin({ last_login_at: ago(3 * 86_400_000), last_login_ip: null })).toBe('admin.lastLogin.daysAgo')
  })

  it('非法时间 → 兜底「尚未登录」', async () => {
    const { vm } = await mountPage()
    expect(vm.relativeLastLogin({ last_login_at: 'not-a-date', last_login_ip: null })).toBe('admin.lastLogin.never')
  })

  it('悬浮提示：完整时间 + IP；无记录时为空串', async () => {
    const { vm } = await mountPage()
    const tip = vm.lastLoginTooltip({ last_login_at: '2026-08-23T01:00:00.000Z', last_login_ip: '192.0.2.1' })
    expect(tip).toContain('IP 192.0.2.1')
    expect(tip).toMatch(/2026/) // 本地化完整时间（含年份）
    expect(vm.lastLoginTooltip({ last_login_at: null, last_login_ip: null })).toBe('')
  })
})
