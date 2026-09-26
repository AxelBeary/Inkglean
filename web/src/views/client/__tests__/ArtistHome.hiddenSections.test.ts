// N1 侦察抓出的既存 wart 哨兵：hidden 态主页不得再并行加载分块端点。
// 分块端点（workflow/styles/gallery/platforms）对 hidden 画师一律 404，
// 旧实现照常加载 → 全红 →「部分内容加载失败」横幅与 hidden 友好提示同屏自相矛盾。
// 修复口径：ArtistHome onMounted 在 status==='hidden' 时提前 return（仍走 finally 收 loading）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../locales/zh-CN'

// ─── 依赖桩：路由 / 公开档案抓取 / 分块 API / 配色 ───
const getWorkflow = vi.fn()
const getPublicStyles = vi.fn()
const getPublicGallery = vi.fn()
const getPlatforms = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: {} })
}))
const fetchArtistPublicProfile = vi.fn()
vi.mock('../../../composables/useArtistPublicProfile', () => ({
  fetchArtistPublicProfile: (...args: unknown[]) => fetchArtistPublicProfile(...args)
}))
vi.mock('../../../api/index', () => ({
  artistPublicApi: {
    getWorkflow: (...a: unknown[]) => getWorkflow(...a),
    getPublicStyles: (...a: unknown[]) => getPublicStyles(...a),
    getPublicGallery: (...a: unknown[]) => getPublicGallery(...a),
    getPlatforms: (...a: unknown[]) => getPlatforms(...a)
  }
}))
vi.mock('../../../composables/usePalette', () => ({ usePalette: () => {} }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }) }
})

import ArtistHome from '../ArtistHome.vue'
import { ElMessage } from 'element-plus'

const i18n = createI18n({ legacy: false, locale: 'zh-CN', fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN } })

function mountHome() {
  return mount(ArtistHome, {
    global: {
      plugins: [ElementPlus, i18n],
      stubs: {
        // 四模板为 defineAsyncComponent 懒加载，本测试只关心 hidden 分支，统一打桩
        ArtistHomeClassic: true, ArtistHomeGallery: true, ArtistHomeFolio: true, ArtistHomeAtelier: true,
        ClientFloatingActions: true
      }
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkflow.mockResolvedValue({ stages: [] })
  getPublicStyles.mockResolvedValue([])
  getPublicGallery.mockResolvedValue({ artworks: [], filterSizes: [] })
  getPlatforms.mockResolvedValue([])
})

describe('ArtistHome hidden 态分块加载哨兵（N1 wart 修复）', () => {
  it('hidden：渲染友好提示页，且不再打任何分块端点、不亮错误横幅、不弹 toast', async () => {
    fetchArtistPublicProfile.mockResolvedValue({ id: 1, name: 'Alice', subdomain: 'alice', status: 'hidden' })
    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.find('.hidden-state').exists()).toBe(true)
    expect(wrapper.find('.hidden-state').text()).toContain(zhCN.artistHome.hidden)
    // 核心断言：分块端点零调用（旧实现会 4 连发全 404）
    expect(getWorkflow).not.toHaveBeenCalled()
    expect(getPublicStyles).not.toHaveBeenCalled()
    expect(getPublicGallery).not.toHaveBeenCalled()
    expect(getPlatforms).not.toHaveBeenCalled()
    // 错误横幅与空态都不得与 hidden 提示同屏
    expect(wrapper.find('.section-error-banner').exists()).toBe(false)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('可见画师：分块端点照常并行加载（修复不误伤正常链路）', async () => {
    fetchArtistPublicProfile.mockResolvedValue({
      id: 2, name: 'Bob', subdomain: 'bob', status: 'open',
      tiers: [], artworks: [], rules: '', templateId: 'classic'
    })
    const wrapper = mountHome()
    await flushPromises()

    expect(getWorkflow).toHaveBeenCalledTimes(1)
    expect(getPublicStyles).toHaveBeenCalledTimes(1)
    expect(getPublicGallery).toHaveBeenCalledTimes(1)
    expect(getPlatforms).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.hidden-state').exists()).toBe(false)
    expect(wrapper.find('.section-error-banner').exists()).toBe(false)
    wrapper.unmount()
  })

  it('可见画师分块失败：错误横幅照常点亮（波 M 占位机制未退化）', async () => {
    fetchArtistPublicProfile.mockResolvedValue({
      id: 3, name: 'Cid', subdomain: 'cid', status: 'open',
      tiers: [], artworks: [], rules: '', templateId: 'classic'
    })
    getWorkflow.mockRejectedValue(new Error('boom'))
    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.find('.section-error-banner').exists()).toBe(true)
    wrapper.unmount()
  })
})
