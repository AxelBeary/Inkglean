// 收款比例未保存离开拦截测试（issue #53-6）
// 宿主 TierManage 注册 onBeforeRouteLeave：脏则弹确认，取消不放行；保存/重置后 dirty 空即放行；
// 登出路径（ArtistLayout.logout 先清态再 push）与 admin 抽屉（非路由跳转）不拦。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  onBeforeRouteLeave: vi.fn(),
  confirm: vi.fn(() => Promise.resolve('confirm')),
  dirty: false,
  loggedIn: true
}))

vi.mock('vue-router', () => ({ onBeforeRouteLeave: h.onBeforeRouteLeave }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: h.confirm }
}))

vi.mock('../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    get loggedIn() { return h.loggedIn }
  })
}))

// 四个子面板按模块替身：真实实现会拉起 api/上传等重依赖，且本用例只关心宿主守卫
vi.mock('../../../components/artist/WorkflowPaymentEditor.vue', async () => {
  const { h: render } = await import('vue')
  return {
    default: {
      name: 'WorkflowPaymentEditor',
      setup(_props: unknown, ctx: { expose: (exposed: Record<string, unknown>) => void }) {
        ctx.expose({ hasUnsavedPayment: () => h.dirty })
        return () => render('div', { class: 'wf-stub' })
      }
    }
  }
})

vi.mock('../../../components/artist/DiscountCodeManager.vue', async () => {
  const { h: render } = await import('vue')
  return { default: { name: 'DiscountCodeManager', render: () => render('div') } }
})

vi.mock('../../../components/artist/ArtStyleManager.vue', async () => {
  const { h: render } = await import('vue')
  return { default: { name: 'ArtStyleManager', render: () => render('div') } }
})

vi.mock('../../../components/artist/AddonTemplateManager.vue', async () => {
  const { h: render } = await import('vue')
  return { default: { name: 'AddonTemplateManager', render: () => render('div') } }
})

import TierManage from '../TierManage.vue'

const TabStub = { template: '<div><slot /></div>' }

async function mountPage() {
  const wrapper = mount(TierManage, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { 'el-tabs': TabStub, 'el-tab-pane': TabStub }
    }
  })
  await flushPromises()
  return wrapper
}

/** 取宿主注册的路由离开守卫（未注册说明修复缺失，直接红） */
function leaveGuard() {
  expect(h.onBeforeRouteLeave).toHaveBeenCalledTimes(1)
  return h.onBeforeRouteLeave.mock.calls[0][0] as (to: { name?: string }) => unknown
}

describe('TierManage 收款比例离开拦截（issue #53-6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.dirty = false
    h.loggedIn = true
  })

  it('TC-LEAVE-01: 有未保存比例 → 弹确认；确认后放行', async () => {
    h.dirty = true
    await mountPage()
    const result = await leaveGuard()({ name: 'ArtistDashboard' })
    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })

  it('TC-LEAVE-02: 有未保存比例 → 取消则不放行', async () => {
    h.dirty = true
    h.confirm.mockImplementationOnce(() => Promise.reject(new Error('cancel')))
    await mountPage()
    const result = await leaveGuard()({ name: 'ArtistDashboard' })
    expect(h.confirm).toHaveBeenCalledTimes(1)
    expect(result).toBe(false)
  })

  it('TC-LEAVE-03: dirty 已清（保存成功/恢复默认）→ 直接放行，不弹窗', async () => {
    h.dirty = false
    await mountPage()
    const result = await leaveGuard()({ name: 'ArtistDashboard' })
    expect(result).toBe(true)
    expect(h.confirm).not.toHaveBeenCalled()
  })

  it('TC-LEAVE-04: 登出路径（先清态再 push）→ 不弹窗直接放行', async () => {
    h.dirty = true
    h.loggedIn = false
    await mountPage()
    const result = await leaveGuard()({ name: 'ArtistLogin' })
    expect(result).toBe(true)
    expect(h.confirm).not.toHaveBeenCalled()
  })

  it('TC-LEAVE-05: 跳登录页（登出后跳转目标）→ 不拦', async () => {
    h.dirty = true
    await mountPage()
    const result = await leaveGuard()({ name: 'ArtistLogin' })
    expect(result).toBe(true)
    expect(h.confirm).not.toHaveBeenCalled()
  })
})
