// 主页（根域名 Landing）· 加载态与失败态（本批提交①）
// 锁三条：
//   ① 加载态是骨架屏（不是整页 v-loading 转圈，旧实现遮罩被 0 高容器压扁实际不可见）；
//   ② P0-1 失败态与空态必须可分：失败给「再试一次」+ 危险色 + 警示图标，空态不给重试；
//   ③ landing.loadFailed 不再是死键——它由页内失败区块渲染，不再只靠会消失的 Toast。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import zhCN from '../../../locales/zh-CN'
import en from '../../../locales/en'

const getAll = vi.fn()
vi.mock('../../../api/index', () => ({
  artistPublicApi: { getAll: (...a: unknown[]) => getAll(...a) },
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  }
})

import LandingPage from '../LandingPage.vue'
import { ElMessage } from 'element-plus'

function realI18n(locale: 'zh-CN' | 'en' = 'zh-CN') {
  return createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { en, 'zh-CN': zhCN } })
}

const ARTISTS = [
  { id: 1, name: '阿九', subdomain: 'ajiu', avatar: null, bio: '古风人物', status: 'open', customLinks: [] },
  { id: 2, name: 'Mori', subdomain: 'mori', avatar: null, bio: null, status: 'full', customLinks: [] },
  { id: 3, name: 'Kite', subdomain: 'kite', avatar: null, bio: 'chibi', status: 'break', customLinks: [] },
]

function mountPage(locale: 'zh-CN' | 'en' = 'zh-CN') {
  return mount(LandingPage, {
    global: {
      plugins: [createPinia(), realI18n(locale)],
      stubs: {
        // 主题/语言控件（含 store 依赖）与合规页脚与本文件断言无关，直接打桩；
        // 两种页头形态（内联 ThemePicker / 右下浮窗）同时打桩，回滚任一提交都跑得动
        ClientFloatingActions: true,
        ThemePicker: true,
        ComplianceFooterLinks: true,
        Disclaimer: true,
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        'el-tag': { props: ['type'], template: '<span class="el-tag"><slot /></span>' },
        'el-card': { template: '<article class="el-card"><slot /></article>' },
        'el-icon': { template: '<span class="el-icon"><slot /></span>' },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('加载态 = 骨架屏（替换整页转圈）', () => {
  it('请求未落地时渲染 6 张骨架卡，并播报「正在加载」', () => {
    getAll.mockReturnValue(new Promise(() => { /* 永不 resolve：停在加载态 */ }))
    const wrapper = mountPage()
    expect(wrapper.findAll('.artist-skeleton')).toHaveLength(6)
    expect(wrapper.find('[role="status"]').text()).toBe(zhCN.landing.loadingArtists)
    // 加载态不得同时出现空态/失败态
    expect(wrapper.find('.state-panel').exists()).toBe(false)
  })

  it('加载完成后骨架卡全部消失', async () => {
    getAll.mockResolvedValue(ARTISTS)
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('.artist-skeleton')).toHaveLength(0)
    expect(wrapper.find('[role="status"]').text()).toBe('')
  })
})

describe('P0-1 失败态与空态必须可分', () => {
  it('请求失败：渲染独立失败区块（失败文案 + 重试按钮），且不出现「还没有画师入驻」', async () => {
    getAll.mockRejectedValue(new Error('boom'))
    const wrapper = mountPage()
    await flushPromises()

    const panel = wrapper.find('.state-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('state-panel--error')
    // landing.loadFailed 曾因 http.ts 兜底文案恒非空而不可达（死键），现在必须真的渲染出来
    expect(panel.find('.state-title').text()).toBe(zhCN.landing.loadFailed)
    expect(panel.find('.state-retry').exists()).toBe(true)
    // 与空态同屏出现 = 回归
    expect(wrapper.text()).not.toContain(zhCN.landing.noArtists)
  })

  it('请求成功但列表为空：渲染空态区块，且**不给**重试按钮（空不是错）', async () => {
    getAll.mockResolvedValue([])
    const wrapper = mountPage()
    await flushPromises()

    const panel = wrapper.find('.state-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.classes()).toContain('state-panel--empty')
    expect(panel.find('.state-title').text()).toBe(zhCN.landing.noArtists)
    expect(panel.find('.state-retry').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(zhCN.landing.loadFailed)
  })

  it('失败态与空态在文案/图标/重试三处都不同（同屏同形反模式）', async () => {
    getAll.mockRejectedValue(new Error('boom'))
    const failWrapper = mountPage()
    await flushPromises()
    const failIcon = failWrapper.find('.state-icon').html()

    getAll.mockResolvedValue([])
    const emptyWrapper = mountPage()
    await flushPromises()
    const emptyIcon = emptyWrapper.find('.state-icon').html()

    expect(failWrapper.find('.state-title').text()).not.toBe(emptyWrapper.find('.state-title').text())
    expect(failIcon).not.toBe(emptyIcon)
    expect(failWrapper.find('.state-retry').exists()).toBe(true)
    expect(emptyWrapper.find('.state-retry').exists()).toBe(false)
  })

  it('点「再试一次」会重新请求，成功后失败区块消失并渲染卡片', async () => {
    getAll.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('.state-retry').exists()).toBe(true)

    getAll.mockResolvedValue(ARTISTS)
    await wrapper.find('.state-retry').trigger('click')
    await flushPromises()

    expect(getAll).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.state-panel').exists()).toBe(false)
  })

  it('失败时仍保留 toast（toast 是补充，不承担状态表达）', async () => {
    getAll.mockRejectedValue(new Error('boom'))
    mountPage()
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalled()
  })

  it('en 下失败态取英文词条', async () => {
    getAll.mockRejectedValue(new Error('boom'))
    const wrapper = mountPage('en')
    await flushPromises()
    expect(wrapper.find('.state-title').text()).toBe(en.landing.loadFailed)
  })
})
