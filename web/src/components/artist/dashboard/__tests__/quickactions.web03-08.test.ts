// WEB-03 回归：粘贴上传不再偷偷发布（enabled 改条件 + 确认弹窗）
// WEB-08 回归：手动录单快捷入口路由改为 /orders/new
// 覆盖：① publish 不在 activeActions 时 enabled=false 不响应粘贴；
//       ② doPublish 弹确认框，取消不发布；确认才发布；
//       ③ manual 路由指向 /orders/new（非 /orders?action=manual）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  msgSuccess: vi.fn(),
  msgError: vi.fn(),
  msgWarning: vi.fn(),
  confirmResolve: vi.fn(() => Promise.resolve('confirm')),
  createArtwork: vi.fn(() => Promise.resolve({})),
  uploadImage: vi.fn(() => Promise.resolve({ filePath: '/img/test.png', originalName: 'test.png' })),
  fetchProfile: vi.fn(() => Promise.resolve())
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: h.msgSuccess, error: h.msgError, warning: h.msgWarning, info: vi.fn() },
  ElMessageBox: { confirm: h.confirmResolve }
}))

vi.mock('../../../../stores/artist.js', () => ({
  useArtistStore: () => ({
    profile: null,
    subdomain: 'alice',
    fetchProfile: h.fetchProfile
  })
}))

vi.mock('../../../../api/index.js', () => ({
  artistApi: { createArtwork: h.createArtwork },
  uploadApi: { image: h.uploadImage }
}))

vi.mock('../../../../utils/track.js', () => ({
  trackEvent: vi.fn()
}))

// 不 mock usePasteUpload——测试真实行为
import QuickActions from '../QuickActions.vue'
import { QUICK_ACTION_POOL, QUICK_ACTIONS_KEY } from '../QuickActions.vue'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  h.confirmResolve.mockImplementation(() => Promise.resolve('confirm'))
})

describe('WEB-08: 手动录单快捷入口路由', () => {
  it('manual 条目 route 指向 /orders/new（非 /orders?action=manual）', () => {
    const manual = QUICK_ACTION_POOL.find(a => a.key === 'manual')
    expect(manual).toBeDefined()
    expect(manual!.type).toBe('route')
    expect((manual as { route: string }).route).toBe('/orders/new')
  })

  it('点击 manual 快捷卡片：router.push 参数为 /orders/new', async () => {
    // 配置只显示 manual
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(['manual']))
    const wrapper = mount(QuickActions, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { 'el-icon': { template: '<i><slot /></i>' } }
      }
    })
    await flushPromises()
    const card = wrapper.find('.quick-card')
    expect(card.exists()).toBe(true)
    await card.trigger('click')
    expect(h.push).toHaveBeenCalledWith('/orders/new')
  })
})

describe('WEB-03: 粘贴上传不再偷偷发布', () => {
  it('publish 不在 activeActions 时，粘贴图片不触发上传', async () => {
    // 配置不含 publish
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(['manual', 'orders']))
    mount(QuickActions, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { 'el-icon': { template: '<i><slot /></i>' } }
      }
    })
    await flushPromises()

    // 模拟粘贴图片
    const file = new File(['x'.repeat(1024)], 'img.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { items: unknown[] } }
    event.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }
    document.dispatchEvent(event)
    await flushPromises()

    // enabled=false → onFiles 不被调用 → 不上传不发布
    expect(h.uploadImage).not.toHaveBeenCalled()
    expect(h.createArtwork).not.toHaveBeenCalled()
  })

  it('publish 在 activeActions 时，粘贴图片触发确认弹窗', async () => {
    // 配置含 publish
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(['publish']))
    mount(QuickActions, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { 'el-icon': { template: '<i><slot /></i>' } }
      }
    })
    await flushPromises()

    const file = new File(['x'.repeat(1024)], 'img.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { items: unknown[] } }
    event.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }
    document.dispatchEvent(event)
    await flushPromises()

    // 应弹出确认框
    expect(h.confirmResolve).toHaveBeenCalled()
  })

  it('用户取消确认弹窗 → 不上传不发布', async () => {
    h.confirmResolve.mockImplementation(() => Promise.reject(new Error('cancel')))
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(['publish']))
    mount(QuickActions, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { 'el-icon': { template: '<i><slot /></i>' } }
      }
    })
    await flushPromises()

    const file = new File(['x'.repeat(1024)], 'img.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { items: unknown[] } }
    event.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }
    document.dispatchEvent(event)
    await flushPromises()

    expect(h.uploadImage).not.toHaveBeenCalled()
    expect(h.createArtwork).not.toHaveBeenCalled()
  })

  it('用户确认弹窗 → 正常上传并发布', async () => {
    localStorage.setItem(QUICK_ACTIONS_KEY, JSON.stringify(['publish']))
    mount(QuickActions, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { 'el-icon': { template: '<i><slot /></i>' } }
      }
    })
    await flushPromises()

    const file = new File(['x'.repeat(1024)], 'img.png', { type: 'image/png' })
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData?: { items: unknown[] } }
    event.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] }
    document.dispatchEvent(event)
    await flushPromises()

    expect(h.uploadImage).toHaveBeenCalledWith(file)
    expect(h.createArtwork).toHaveBeenCalled()
    expect(h.msgSuccess).toHaveBeenCalled()
  })
})
