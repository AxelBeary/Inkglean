// REQ-041 AdminLayout 入口级守卫单测（812-chores C3）
// 覆盖：step-up 窗口内免弹；401 STEP_UP_REQUIRED → 弹 StepUpDialog；
//       验证通过关闭；取消验证跳回画师后台
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AdminLayout from '../AdminLayout.vue'

const h = vi.hoisted(() => ({
  status: vi.fn(),
  push: vi.fn(),
  validateSession: vi.fn(),
  enterArtistScope: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/admin' }),
  useRouter: () => ({ push: h.push })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

// 注意：__tests__ 在 admin/ 下，到 src 需三级 ../（上一轮两级 ../ 全部解析到不存在的
// components/{stores,composables,api}，mock 未拦截 → 真实 theme store 报 getActivePinia 错误、
// 真实 api 发出 HTTP 请求）
vi.mock('../../../stores/theme.js', () => ({
  useThemeStore: () => ({ enterArtistScope: h.enterArtistScope })
}))

vi.mock('../../../composables/useSessionGuard', () => ({
  useSessionGuard: () => ({ validateSession: h.validateSession })
}))

vi.mock('../../../api/index.js', () => ({
  stepUpApi: { status: h.status }
}))

// api 响应拦截器动态 import i18n/index.js（真实模块会调 createI18n）；
// 按 layouts.session.test.js 先例 mock 实例模块，避免 vue-i18n mock 缺 createI18n 报错
vi.mock('../../../i18n/index.js', () => ({
  i18n: { global: { t: (key: string) => key } },
  setLocale: vi.fn()
}))

vi.mock('../StepUpDialog.vue', () => ({
  default: {
    name: 'StepUpDialog',
    props: ['modelValue'],
    emits: ['verified', 'cancel'],
    template: '<div v-if="modelValue" class="stepup-stub">stepup</div>'
  }
}))

const EP_STUBS = {
  'el-container': { template: '<div><slot /></div>' },
  'el-aside': { template: '<aside><slot /></aside>' },
  'el-main': { template: '<main><slot /></main>' },
  'el-tooltip': { template: '<span><slot /></span>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-drawer': { template: '<div><slot /><slot name="header" /></div>' },
  'router-view': { template: '<div class="router-view-stub" />' }
}

const mountedWrappers: ReturnType<typeof mount>[] = []

function mountLayout() {
  const wrapper = mount(AdminLayout, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: EP_STUBS
    }
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function stepUpRequiredError() {
  return Object.assign(new Error('need step-up'), { status: 401, code: 'STEP_UP_REQUIRED' })
}

beforeEach(() => {
  h.status.mockReset()
  h.push.mockReset()
  h.validateSession.mockReset()
  h.enterArtistScope.mockReset()
})

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
})

describe('AdminLayout 入口级 step-up 守卫（REQ-041）', () => {
  it('step-up 窗口内（status 成功）→ 不弹验证框', async () => {
    h.status.mockResolvedValue({ upgraded: true })
    const wrapper = mountLayout()
    await flushPromises()

    expect(h.status).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
    expect(wrapper.find('.router-view-stub').exists()).toBe(true)
  })

  it('401 STEP_UP_REQUIRED → 弹出 StepUpDialog', async () => {
    h.status.mockRejectedValue(stepUpRequiredError())
    const wrapper = mountLayout()
    await flushPromises()

    expect(h.status).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)
  })

  it('验证通过（verified）→ 关闭验证框', async () => {
    h.status.mockRejectedValue(stepUpRequiredError())
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('verified')
    await flushPromises()

    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
    // 验证后不再重复探测，直接放行后续 admin API
    expect(h.status).toHaveBeenCalledTimes(1)
  })

  it('取消验证 → 关闭并跳回画师后台', async () => {
    h.status.mockRejectedValue(stepUpRequiredError())
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.find('.stepup-stub').exists()).toBe(true)

    wrapper.getComponent({ name: 'StepUpDialog' }).vm.$emit('cancel')
    await flushPromises()

    expect(wrapper.find('.stepup-stub').exists()).toBe(false)
    expect(h.push).toHaveBeenCalledWith('/dashboard')
  })
})
