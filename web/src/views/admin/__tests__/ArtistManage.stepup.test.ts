// REQ-041 ArtistManage 更换管理员动作级再验接线单测（812-chores C3）
// 覆盖：提交遇 STEP_UP_REQUIRED → 弹 StepUpDialog；
//       验证通过后自动重提交；取消不重提交且不关闭更换弹窗
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ArtistManage from '../ArtistManage.vue'

const h = vi.hoisted(() => ({
  getArtists: vi.fn(),
  transferAdmin: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirm: vi.fn()
}))

// 注意：__tests__ 在 views/admin/ 下，到 src 需三级 ../（上一轮两级 ../ 全部解析到不存在的
// views/{api,components}，mock 未拦截 → 真实 api 发出 HTTP 请求，全部用例失败）
vi.mock('../../../api/index.js', () => ({
  adminApi: {
    getArtists: h.getArtists,
    transferAdmin: h.transferAdmin
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// api 响应拦截器动态 import i18n/index.js（真实模块会调 createI18n）；
// 按 layouts.session.test.js 先例 mock 实例模块，避免 vue-i18n mock 缺 createI18n 报错
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
  default: {
    name: 'StepUpDialog',
    props: ['modelValue'],
    emits: ['verified', 'cancel'],
    template: '<div v-if="modelValue" class="stepup-stub">stepup</div>'
  }
}))

const EP_STUBS = {
  'el-button': {
    // 防止父级 onClick 经 $attrs 透传到 stub 根按钮造成双触发（上一轮 confirmTransfer 被调 2 次）
    inheritAttrs: false,
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  },
  'el-table': { template: '<div class="table-stub"><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-select': { template: '<div />' },
  'el-option': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div class="pagination-stub" />' },
  'el-input-number': { template: '<div class="input-number-stub" />' },
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

function mountPage() {
  const wrapper = mount(ArtistManage, {
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

function clickButtonByText(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  expect(button).toBeDefined()
  return button!.trigger('click')
}

async function openTransferAndSubmit(wrapper: ReturnType<typeof mount>) {
  await clickButtonByText(wrapper, 'admin.transferAdmin')
  const step1Inputs = wrapper.findAll('.dialog-stub input')
  expect(step1Inputs.length).toBe(2)
  await step1Inputs[1].setValue('123456')
  await clickButtonByText(wrapper, 'admin.nextStep')

  const step2Inputs = wrapper.findAll('.dialog-stub input')
  expect(step2Inputs.length).toBe(2)
  await step2Inputs[0].setValue('20002')
  await step2Inputs[1].setValue('654321')
  await clickButtonByText(wrapper, 'admin.confirmTransfer')
  await flushPromises()
}

beforeEach(() => {
  h.getArtists.mockReset().mockResolvedValue([
    { id: 1, name: 'Alice', subdomain: 'alice', qq_number: '10001', isAdmin: true, status: 'open', totp_verified: true }
  ])
  h.transferAdmin.mockReset().mockResolvedValue({ newAdminName: 'Bob' })
  h.msgSuccess.mockReset()
  h.msgError.mockReset()
  h.msgWarning.mockReset()
  h.confirm.mockReset().mockResolvedValue('confirm')
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('ArtistManage 更换管理员动作级再验（REQ-041）', () => {
  it('提交遇 STEP_UP_REQUIRED → 弹出 StepUpDialog', async () => {
    h.transferAdmin.mockRejectedValueOnce(stepUpRequiredError())
    const wrapper = mountPage()
    await flushPromises()

    await openTransferAndSubmit(wrapper)

    expect(h.transferAdmin).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)
  })

  it('验证通过（verified）→ 自动重提交并关闭', async () => {
    h.transferAdmin.mockRejectedValueOnce(stepUpRequiredError())
    const wrapper = mountPage()
    await flushPromises()

    await openTransferAndSubmit(wrapper)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('verified')
    await flushPromises()

    expect(h.transferAdmin).toHaveBeenCalledTimes(2)
    expect(h.msgSuccess).toHaveBeenCalledWith('admin.transferSuccess')
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
    expect(wrapper.find('.dialog-stub').exists()).toBe(false)
  })

  it('取消验证 → 关闭 StepUpDialog 且不重提交', async () => {
    h.transferAdmin.mockRejectedValueOnce(stepUpRequiredError())
    const wrapper = mountPage()
    await flushPromises()

    await openTransferAndSubmit(wrapper)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('cancel')
    await flushPromises()

    expect(h.transferAdmin).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
    // 更换管理员弹窗保持打开，用户可改后再试
    expect(wrapper.find('.dialog-stub').exists()).toBe(true)
  })
})
