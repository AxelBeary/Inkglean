// 主页（根域名 Landing）· 首屏层级与画师向横幅（本批提交②，方向 A + Q1 兜底 (c)）
// 锁四条：
//   ① 首屏有定位句与主行动，标题层级 h1→h2→h3 不跳级（旧实现 h1 直接跳 h3）；
//   ② 目录计数是事实数字（总数 + 可约数由列表 reduce 得出，不额外请求）；
//   ③ 卡片可访问名含可约性（P1-3：旧 aria-label 只有名字，读屏听不到能不能约）；
//   ④ 画师向横幅逐字引用 REQ-044 A 项定稿话术（REQ-044:37 拍板「不得自行改动此句」）。
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

describe('首屏与目录层级（方向 A）', () => {
  it('首屏有 h1 与主行动按钮，层级 h1→h2→h3 不跳级', async () => {
    getAll.mockResolvedValue(ARTISTS)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.find('h1').exists()).toBe(true)
    // 目录区段标题必须是 h2（旧实现 h1 直接跳到 h3）
    expect(wrapper.find('h2.directory-title').text()).toBe(zhCN.landing.directoryTitle)
    expect(wrapper.findAll('h3')).toHaveLength(3)
    expect(wrapper.find('.hero-cta').text()).toBe(zhCN.landing.browseArtists)
  })

  it('目录计数是事实数字：总数 + 可约数由列表 reduce 得出', async () => {
    getAll.mockResolvedValue(ARTISTS)
    const wrapper = mountPage()
    await flushPromises()
    // 3 位画师里只有 1 位 status=open
    expect(wrapper.find('.directory-count').text()).toBe('共 3 位画师 · 1 位可约稿')
  })

  it('画师卡的可访问名含状态（读屏能听到可约性，P1-3）', async () => {
    getAll.mockResolvedValue(ARTISTS)
    const wrapper = mountPage()
    await flushPromises()
    const label = wrapper.find('.artist-card').attributes('aria-label')
    expect(label).toContain('阿九')
    expect(label).toContain(zhCN.common.status.open)
  })

  it('画师向横幅引用 REQ-044 定稿话术（逐字），且带画师登录入口', async () => {
    getAll.mockResolvedValue([])
    const wrapper = mountPage()
    await flushPromises()
    const banner = wrapper.find('.artist-banner')
    expect(banner.exists()).toBe(true)
    // REQ-044:37 已拍板「不得自行改动此句」——锁住逐字一致，防后续被顺手改写
    expect(banner.find('.banner-desc').text()).toBe(
      '把 QQ 接单、Excel 记账、备忘录排期，换成一个网站——客户自助下单查单，你只管画。'
    )
    expect(banner.find('a.banner-cta').attributes('href')).toBe('/login')
  })

  it('en 下主行动与目录标题取英文词条', async () => {
    getAll.mockResolvedValue(ARTISTS)
    const wrapper = mountPage('en')
    await flushPromises()
    expect(wrapper.find('.hero-cta').text()).toBe(en.landing.browseArtists)
    expect(wrapper.find('h2.directory-title').text()).toBe(en.landing.directoryTitle)
  })
})
