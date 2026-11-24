// 815-b3-ban：举报管理页封禁/解封两步确认（StepUpDialog 动作级再验接线）单测
// 覆盖：被封禁目标显示解封/未封禁显示封禁；封禁遇 STEP_UP_REQUIRED → 弹 StepUpDialog；
//       验证通过自动重提交；取消不重提交；解封链路对称
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReportManage from '../ReportManage.vue'

const h = vi.hoisted(() => ({
  getReports: vi.fn(),
  getArtists: vi.fn(),
  banArtist: vi.fn(),
  unbanArtist: vi.fn(),
  homeTakedown: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  prompt: vi.fn()
}))

vi.mock('../../../api/index.js', () => ({
  complianceApi: {
    getReports: h.getReports,
    banArtist: h.banArtist,
    unbanArtist: h.unbanArtist,
    homeTakedown: h.homeTakedown
  },
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
    error: h.msgError
  },
  ElMessageBox: { prompt: h.prompt }
}))

vi.mock('../../../components/admin/StepUpDialog.vue', () => ({
  default: {
    name: 'StepUpDialog',
    props: ['modelValue'],
    emits: ['verified', 'cancel'],
    template: '<div v-if="modelValue" class="stepup-stub">stepup</div>'
  }
}))

const EP_STUBS = {
  'el-button': {
    inheritAttrs: false,
    props: ['loading', 'disabled'],
    template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-tabs': {
    // B7-F0288：补 name/props/emits——测试需驱动 v-model 与 tab-change 切 Tab
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue', 'tab-change'],
    template: '<div class="tabs-stub"><slot /></div>'
  },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': {
    template: '<div class="col-stub"><slot :row="{ id: 1, target_type: \'artist_home\', target_id: 10, description: \'d\', contact: null, report_ip: \'203.0.113.9\', status: \'pending\', created_at: \'2026-08-15\' }" /></div>'
  },
  'el-empty': { template: '<div />' },
  'el-icon': { template: '<i><slot /></i>' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

function mountPage() {
  const wrapper = mount(ReportManage, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS,
      directives: { loading: {} }
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function stepUpRequiredError() {
  return Object.assign(new Error('need step-up'), { status: 401, code: 'STEP_UP_REQUIRED' })
}

function hasButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').some(b => b.text() === text)
}

async function clickButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find(b => b.text() === text)
  expect(button).toBeDefined()
  await button!.trigger('click')
}

beforeEach(() => {
  h.getReports.mockReset().mockResolvedValue([
    {
      id: 1,
      target_type: 'artist_home' as const,
      target_id: 10,
      description: 'd',
      contact: null,
      status: 'pending' as const,
      resolved_by: null,
      resolved_at: null,
      created_at: '2026-08-15'
    }
  ])
  h.getArtists.mockReset().mockResolvedValue([{ id: 10, is_banned: 1 }])
  h.banArtist.mockReset().mockResolvedValue({ success: true, isBanned: 1 })
  h.unbanArtist.mockReset().mockResolvedValue({ success: true, isBanned: 0 })
  h.homeTakedown.mockReset().mockResolvedValue({ success: true })
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.prompt.mockReset().mockResolvedValue({ value: '原因' })
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ReportManage 封禁/解封两步确认（815-b3-ban）', () => {
  it('被封禁目标显示解封按钮，未封禁目标显示封禁按钮', async () => {
    const wrapperBanned = mountPage()
    await flushPromises()

    expect(hasButton(wrapperBanned, 'compliance.admin.unban')).toBe(true)
    expect(hasButton(wrapperBanned, 'compliance.admin.ban')).toBe(false)

    h.getArtists.mockResolvedValue([{ id: 10, is_banned: 0 }])
    const wrapperOpen = mountPage()
    await flushPromises()

    expect(hasButton(wrapperOpen, 'compliance.admin.unban')).toBe(false)
    expect(hasButton(wrapperOpen, 'compliance.admin.ban')).toBe(true)
  })

  it('封禁遇 STEP_UP_REQUIRED → 弹 StepUpDialog；验证通过自动重提交并提示成功', async () => {
    h.banArtist.mockRejectedValueOnce(stepUpRequiredError())
    h.getArtists.mockResolvedValue([{ id: 10, is_banned: 0 }])
    const wrapper = mountPage()
    await flushPromises()

    await clickButtonByText(wrapper, 'compliance.admin.ban')
    await flushPromises()

    expect(h.banArtist).toHaveBeenCalledWith(10, '原因')
    expect(h.banArtist).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('verified')
    await flushPromises()

    expect(h.banArtist).toHaveBeenCalledTimes(2)
    expect(h.msgSuccess).toHaveBeenCalledWith('compliance.admin.bannedToast')
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
  })

  it('封禁取消验证 → 关闭 StepUpDialog 且不重提交', async () => {
    h.banArtist.mockRejectedValueOnce(stepUpRequiredError())
    h.getArtists.mockResolvedValue([{ id: 10, is_banned: 0 }])
    const wrapper = mountPage()
    await flushPromises()

    await clickButtonByText(wrapper, 'compliance.admin.ban')
    await flushPromises()
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('cancel')
    await flushPromises()

    expect(h.banArtist).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
  })

  it('解封遇 STEP_UP_REQUIRED → 弹 StepUpDialog；验证通过自动重提交并提示成功', async () => {
    h.unbanArtist.mockRejectedValueOnce(stepUpRequiredError())
    const wrapper = mountPage()
    await flushPromises()

    await clickButtonByText(wrapper, 'compliance.admin.unban')
    await flushPromises()

    expect(h.unbanArtist).toHaveBeenCalledWith(10, '原因')
    expect(h.unbanArtist).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('verified')
    await flushPromises()

    expect(h.unbanArtist).toHaveBeenCalledTimes(2)
    expect(h.msgSuccess).toHaveBeenCalledWith('compliance.admin.unbannedToast')
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
  })

  it('v75 W2：举报来源 IP 列渲染行内 report_ip', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('203.0.113.9')
  })

  it('v76 W3：artist_home 举报行并列提供「下架主页」键，两步确认调接口', async () => {
    const wrapper = mountPage()
    await flushPromises()

    await clickButtonByText(wrapper, 'compliance.admin.homeTakedown')
    await flushPromises()

    expect(h.prompt).toHaveBeenCalledWith('compliance.admin.homeTakedownConfirm', 'compliance.admin.homeTakedown', expect.anything())
    expect(h.homeTakedown).toHaveBeenCalledWith(10, '原因')
    expect(h.msgSuccess).toHaveBeenCalledWith('compliance.admin.homeTakedownToast')
  })
})

// ═══ B7-F0288：举报列表请求序号门闩——快速切 Tab 时旧 Tab 的响应不得覆盖 ═══
describe('B7-F0288 Tab 切换竞速门闩', () => {
  /** vm 上的 setup 状态形状（VTU 经实例代理暴露 script-setup refs） */
  interface ReportsVm {
    reports: Array<{ id: number; status: string }>
  }

  async function switchTab(wrapper: ReturnType<typeof mount>, name: 'pending' | 'resolved') {
    const tabs = wrapper.getComponent({ name: 'ElTabs' })
    await tabs.vm.$emit('update:modelValue', name)
    await tabs.vm.$emit('tab-change', name)
    await flushPromises()
  }

  it('pending 慢响应迟到 → 不得覆盖 resolved Tab 的列表，也不触发错误提示', async () => {
    let resolvePending!: (v: unknown[]) => void
    h.getReports.mockImplementation((tab: 'pending' | 'resolved') =>
      tab === 'pending'
        ? new Promise(r => { resolvePending = r })
        : Promise.resolve([{ id: 99, target_type: 'artist_home', target_id: 10, description: '已处理', contact: null, status: 'resolved', resolved_by: 1, resolved_at: '2026-08-16', created_at: '2026-08-15' }])
    )
    const wrapper = mountPage()
    await flushPromises() // pending 的请求在途（慢）

    await switchTab(wrapper, 'resolved')
    const vm = wrapper.vm as unknown as ReportsVm
    expect(vm.reports.map(r => r.id)).toEqual([99])

    // pending 的慢响应迟到 → 门闩拦下：列表仍是 resolved 的数据
    resolvePending([{ id: 1, target_type: 'artist_home', target_id: 10, description: 'd', contact: null, status: 'pending', resolved_by: null, resolved_at: null, created_at: '2026-08-15' }])
    await flushPromises()
    expect(vm.reports.map(r => r.id)).toEqual([99])
    expect(h.msgError).not.toHaveBeenCalled()
  })

  it('pending 慢失败迟到 → 不清空 resolved 列表、不弹错误提示', async () => {
    let rejectPending!: (e: Error) => void
    h.getReports.mockImplementation((tab: 'pending' | 'resolved') =>
      tab === 'pending'
        ? new Promise((_, rej) => { rejectPending = rej })
        : Promise.resolve([{ id: 99, target_type: 'artist_home', target_id: 10, description: '已处理', contact: null, status: 'resolved', resolved_by: 1, resolved_at: '2026-08-16', created_at: '2026-08-15' }])
    )
    const wrapper = mountPage()
    await flushPromises()

    await switchTab(wrapper, 'resolved')
    const vm = wrapper.vm as unknown as ReportsVm
    expect(vm.reports.map(r => r.id)).toEqual([99])

    // 修复前：旧 Tab 的迟到失败会走 catch 清空当前列表并弹错误
    rejectPending(new Error('pending 加载失败'))
    await flushPromises()
    expect(vm.reports.map(r => r.id)).toEqual([99])
    expect(h.msgError).not.toHaveBeenCalled()
  })
})
