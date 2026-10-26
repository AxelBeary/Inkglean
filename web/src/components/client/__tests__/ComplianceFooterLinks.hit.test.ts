// issue #54-1: 页脚合规入口命中高 ≥24px（WCAG 2.5.8）
// happy-dom 不应用 scoped CSS，量不到像素：命中高口径用源码级证据锁住（同 ArtistLayout.split 口径），
// 渲染面只锁「三入口齐全 + 两个链是带 href 的 <a>（可聚焦）」。实高仍需人工核。
import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import complianceSrc from '../ComplianceFooterLinks.vue?raw'
import ComplianceFooterLinks from '../ComplianceFooterLinks.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function mountFooter() {
  return shallowMount(ComplianceFooterLinks, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { RouterLink: RouterLinkStub }
    }
  })
}

/** 取 CSS 规则块正文（首个 `选择器 {` 到其后第一个 `}`） */
function cssRule(src: string, selector: string) {
  const start = src.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return src.slice(start, src.indexOf('}', start))
}

describe('ComplianceFooterLinks 命中高（issue #54-1）', () => {
  it('.compliance-link 用 inline-flex + min-height: 24px 撑命中高，不靠行距', () => {
    const rule = cssRule(complianceSrc, '.compliance-link')
    expect(rule).toContain('display: inline-flex')
    expect(rule).toContain('align-items: center')
    expect(rule).toContain('min-height: 24px')
    // 撑行距会改版式：命中高只靠盒子，不加 line-height
    expect(rule).not.toContain('line-height')
  })

  it('三个入口齐全：隐私/条款是可聚焦的 <a>（带 href），举报是 button', () => {
    const wrapper = mountFooter()
    const links = wrapper.findAll('.compliance-link')
    expect(links).toHaveLength(3)

    const anchors = wrapper.findAll('a.compliance-link')
    expect(anchors.map(a => a.attributes('href'))).toEqual(['/privacy', '/terms'])

    const reportBtn = wrapper.find('button.compliance-link')
    expect(reportBtn.exists()).toBe(true)
    expect(reportBtn.attributes('type')).toBe('button')
    expect(reportBtn.attributes('disabled')).toBeUndefined()
  })
})
