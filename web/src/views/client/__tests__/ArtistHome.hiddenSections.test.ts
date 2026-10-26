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
// #57: 预览横幅用例需要切换路由 query（预览参数决定 isPreview）
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { subdomain: 'alice' }, query: routeState.query })
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
  routeState.query = {}
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

// #57 预览横幅与 Folio 固定导航重叠：横幅 sticky(top:0, z-index 200) 盖住导航 fixed(top:0, z-index 100)——
// 层级本来就没冲突，是位置冲突。修复把「横幅可见」这一事实挂成根节点类 has-preview，
// 由 ArtistHome 的 scoped 样式统一把导航下移到 --preview-banner-h 之下。
describe('ArtistHome 预览横幅层级挂钩（issue #57）', () => {
  it('预览参数在 → 根节点带 has-preview（Folio 导航下移的挂钩）', async () => {
    routeState.query = { _tpl: 'folio' }
    fetchArtistPublicProfile.mockResolvedValue({
      id: 4, name: 'Dana', subdomain: 'dana', status: 'open',
      tiers: [], artworks: [], rules: '', templateId: 'folio'
    })
    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.find('.preview-banner').exists()).toBe(true)
    expect(wrapper.find('.artist-home').classes()).toContain('has-preview')
    wrapper.unmount()
  })

  it('无预览参数 → 不带 has-preview，导航保持 top 0 口径', async () => {
    fetchArtistPublicProfile.mockResolvedValue({
      id: 5, name: 'Eve', subdomain: 'eve', status: 'open',
      tiers: [], artworks: [], rules: '', templateId: 'folio'
    })
    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.find('.preview-banner').exists()).toBe(false)
    expect(wrapper.find('.artist-home').classes()).not.toContain('has-preview')
    wrapper.unmount()
  })
})
