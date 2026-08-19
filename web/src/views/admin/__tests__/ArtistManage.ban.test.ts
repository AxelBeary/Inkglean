// ArtistManage.ban.test.js
// 817-B2 REQ-新-01：画师管理页封禁统一入口
// 覆盖：非封禁行显示「封禁」、封禁行显示「解封」、管理员行两入口均不显示；
//       封禁两步确认（填原因 → 调接口 → 成功提示并刷新）；取消不调接口；
//       封禁遇 STEP_UP_REQUIRED → StepUpDialog → 验证通过自动重提交。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { h } from 'vue'
import type { SetupContext } from 'vue'
import ArtistManage from '../ArtistManage.vue'

const hoisted = vi.hoisted(() => ({
  getArtists: vi.fn(),
  banArtist: vi.fn(),
  unbanArtist: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: hoisted.getArtists
  },
  complianceApi: {
    banArtist: hoisted.banArtist,
    unbanArtist: hoisted.unbanArtist
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
    template: '<div v-if="modelValue" class="stepup-stub">stepup</div>'
  }
}))

/** 表格行 fixture：操作列 stub 渲染当前行，供各用例切换封禁态/管理员态 */
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
}

let currentRow: ArtistRow = { id: 0, name: '', subdomain: '', qq_number: '', bio: null, isAdmin: false, is_banned: 0, status: '', totp_verified: false }
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

function clickButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  expect(button).toBeDefined()
  return button!.trigger('click')
}

function stepUpRequiredError() {
  return Object.assign(new Error('need step-up'), { status: 401, code: 'STEP_UP_REQUIRED' })
}

beforeEach(() => {
  currentRow = { id: 7, name: 'Diana', subdomain: 'diana', qq_number: '10007', bio: null, isAdmin: false, is_banned: 0, status: 'open', totp_verified: false }
  hoisted.getArtists.mockReset().mockResolvedValue([currentRow])
  hoisted.banArtist.mockReset().mockResolvedValue({ success: true, isBanned: 1 })
  hoisted.unbanArtist.mockReset().mockResolvedValue({ success: true, isBanned: 0 })
  hoisted.msgSuccess.mockReset()
  hoisted.msgError.mockReset()
  hoisted.msgWarning.mockReset()
  hoisted.confirm.mockReset().mockResolvedValue('confirm')
  hoisted.prompt.mockReset().mockResolvedValue({ value: '恶意引流' })
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 封禁统一入口（817-B2 REQ-新-01）', () => {
  it('非封禁行：显示「封禁」与「移除」，不显示「解封」', async () => {
    const wrapper = await mountPage()
    const texts = buttonTexts(wrapper)
    expect(texts).toContain('compliance.admin.ban')
    expect(texts).toContain('common.remove')
    expect(texts).not.toContain('compliance.admin.unban')
  })

  it('已封禁行：显示「解封」与「移除」，不显示「封禁」', async () => {
    currentRow = { ...currentRow, is_banned: 1 }
    hoisted.getArtists.mockResolvedValue([currentRow])
    const wrapper = await mountPage()
    const texts = buttonTexts(wrapper)
    expect(texts).toContain('compliance.admin.unban')
    expect(texts).toContain('common.remove')
    expect(texts).not.toContain('compliance.admin.ban')
  })

  it('管理员行：封禁/解封入口均不显示（与移除禁用同口径）', async () => {
    currentRow = { ...currentRow, isAdmin: true }
    hoisted.getArtists.mockResolvedValue([currentRow])
    const wrapper = await mountPage()
    const texts = buttonTexts(wrapper)
    expect(texts).not.toContain('compliance.admin.ban')
    expect(texts).not.toContain('compliance.admin.unban')
    expect(texts).toContain('common.remove')
  })

  it('封禁两步确认：填原因 → 调接口 → 成功提示并刷新列表', async () => {
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'compliance.admin.ban')
    await flushPromises()

    expect(hoisted.prompt).toHaveBeenCalledWith('compliance.admin.banConfirm', 'compliance.admin.ban', expect.anything())
    expect(hoisted.banArtist).toHaveBeenCalledTimes(1)
    expect(hoisted.banArtist).toHaveBeenCalledWith(7, '恶意引流')
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('compliance.admin.bannedToast')
    expect(hoisted.getArtists).toHaveBeenCalledTimes(2) // 初始加载 + 封禁后刷新
  })

  it('封禁两步确认：取消不调接口、不刷新', async () => {
    hoisted.prompt.mockRejectedValue(new Error('cancel'))
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'compliance.admin.ban')
    await flushPromises()

    expect(hoisted.prompt).toHaveBeenCalledTimes(1)
    expect(hoisted.banArtist).not.toHaveBeenCalled()
    expect(hoisted.getArtists).toHaveBeenCalledTimes(1)
  })

  it('封禁遇 STEP_UP_REQUIRED：弹 StepUpDialog，验证通过自动重提交', async () => {
    hoisted.banArtist.mockRejectedValueOnce(stepUpRequiredError())
    const wrapper = await mountPage()
    await clickButtonByText(wrapper, 'compliance.admin.ban')
    await flushPromises()

    expect(hoisted.prompt).toHaveBeenCalled()
    expect(hoisted.banArtist).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('verified')
    await flushPromises()

    expect(hoisted.banArtist).toHaveBeenCalledTimes(2)
    expect(hoisted.banArtist).toHaveBeenLastCalledWith(7, '恶意引流')
    expect(hoisted.msgSuccess).toHaveBeenCalledWith('compliance.admin.bannedToast')
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
  })
})
