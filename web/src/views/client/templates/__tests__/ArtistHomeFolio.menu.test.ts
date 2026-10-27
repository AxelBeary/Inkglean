// #54-1：Folio 移动端菜单关闭态必须 inert（Tab 不得落到平移出视口的链路上），
// 桌面端链路常驻可见，不得挂 inert；汉堡按钮带 aria-expanded/aria-controls。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

const h = vi.hoisted(() => ({ mobile: true }))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('../../../composables/useScrollReveal', () => ({ useScrollReveal: () => {} }))
vi.mock('../../../composables/useStickyCta', async () => {
  const { ref: r } = await import('vue')
  return { useStickyCta: () => ({ visible: r(false) }) }
})
vi.mock('../../../composables/useArtistData', async () => {
  const { ref: r } = await import('vue')
  return { useArtistData: () => ({ footerLinks: r([]), galleryArtworks: r([]) }) }
})

import ArtistHomeFolio from '../ArtistHomeFolio.vue'

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installViewport(): void {
  ;(window as unknown as { matchMedia: unknown }).matchMedia = ((q: string) => ({
    matches: h.mobile && q.includes('768'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia
}

function mountFolio() {
  return mount(ArtistHomeFolio, {
    props: { artist: { id: 1, name: 'Alice', subdomain: 'alice', status: 'open', guestbookEnabled: false }, subdomain: 'alice' },
    global: {
      provide: { ctaRaised: ref(false) },
      stubs: {
        TplHero: true, TplGallery: true, TplAnnouncement: true, TplGuestbook: true,
        TplPricingSection: true, TplRules: true, TplStickyCta: true, TplPlatformIcon: true,
        Disclaimer: true, ComplianceFooterLinks: true
      },
      mocks: { $t: (k: string) => k, $router: { push: vi.fn() } }
    }
  })
}

beforeEach(() => {
  h.mobile = true
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  installViewport()
})

describe('#54-1 Folio 移动菜单焦点', () => {
  it('移动端关闭态：链路 inert，汉堡 aria-expanded=false', async () => {
    const wrapper = mountFolio()
    await nextTick() // isMobile 在 onMounted 里按 matchMedia 落值，首帧后才会挂 inert
    const links = wrapper.find('#folio-nav-links')
    expect(links.exists()).toBe(true)
    expect(links.attributes('inert')).toBeDefined()
    expect(wrapper.find('.folio-nav-burger').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('点击汉堡：aria-expanded=true 且解除 inert', async () => {
    const wrapper = mountFolio()
    const burger = wrapper.find('.folio-nav-burger')
    await burger.trigger('click')
    expect(burger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('#folio-nav-links').attributes('inert')).toBeUndefined()
    wrapper.unmount()
  })

  it('桌面端：链路常驻可见，不挂 inert', () => {
    h.mobile = false
    installViewport()
    const wrapper = mountFolio()
    expect(wrapper.find('#folio-nav-links').attributes('inert')).toBeUndefined()
    wrapper.unmount()
  })
})
