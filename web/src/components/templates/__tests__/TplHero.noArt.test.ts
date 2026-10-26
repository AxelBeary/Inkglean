// issue #57-7: fullscreen 模板无焦点图时不再渲染 100dvh 空块
// 视觉口径照 banner 的既有 no-art 降级：退回内容高、展签从叠放改文档流。
// happy-dom 不应用 scoped CSS：高度退化用源码级证据锁住，DOM 面锁「降级类与图片互斥」。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import heroSrc from '../TplHero.vue?raw'
import TplHero from '../TplHero.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

const ARTWORK = { id: 1, title: '封面图', image_path: 'cover/1.png', is_cover: 1, cover_order: 0 }

/** 与 TplHero 的 HeroArtwork prop 形状对齐（测试只需这几个字段） */
interface HeroArt {
  id: number
  title?: string | null
  image_path?: string | null
  is_cover?: number | null
  cover_order?: number | null
}

function mountHero(artworks: HeroArt[]) {
  return mount(TplHero, {
    props: {
      variant: 'fullscreen',
      artist: { name: 'Alice', status: 'open' },
      artworks,
      subdomain: 'alice'
    },
    global: {
      mocks: { $t: (key: string) => key, $router: { push: () => {} } },
      stubs: { TplStatusBadge: true }
    }
  })
}

/** 取 CSS 规则块正文（首个 `选择器 {` 到其后第一个 `}`） */
function cssRule(src: string, selector: string) {
  const start = src.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return src.slice(start, src.indexOf('}', start))
}

describe('TplHero fullscreen 无作品降级（issue #57-7）', () => {
  it('无图：根节点带 no-art 降级类，且不渲染空图/遮罩，展签仍在', () => {
    const wrapper = mountHero([])
    const root = wrapper.find('.tpl-hero')
    expect(root.classes()).toContain('tpl-hero--fullscreen')
    expect(root.classes()).toContain('tpl-hero--no-art')
    expect(wrapper.find('.tpl-hero-full-img').exists()).toBe(false)
    expect(wrapper.find('.tpl-hero-full-shade').exists()).toBe(false)
    expect(wrapper.find('.tpl-hero-plaque').exists()).toBe(true)
  })

  it('无图：高度退回内容高（不再 100dvh + min-height 560px 空撑）', () => {
    const rule = cssRule(heroSrc, '.tpl-hero--fullscreen.tpl-hero--no-art')
    expect(rule).toContain('height: auto')
    expect(rule).toContain('min-height: 0')
    expect(rule).not.toContain('100dvh')
    // 展签改文档流，否则 auto 高度里它是绝对定位、撑不出内容高
    const plaque = cssRule(heroSrc, '.tpl-hero--fullscreen.tpl-hero--no-art .tpl-hero-plaque')
    expect(plaque).toContain('position: static')
  })

  it('有图：路径零变化——不挂降级类，图片与遮罩照旧渲染', () => {
    const wrapper = mountHero([ARTWORK])
    const root = wrapper.find('.tpl-hero')
    expect(root.classes()).toContain('tpl-hero--fullscreen')
    expect(root.classes()).not.toContain('tpl-hero--no-art')
    expect(wrapper.find('.tpl-hero-full-img').attributes('src')).toBe('/uploads/cover/1.png')
    expect(wrapper.find('.tpl-hero-full-shade').exists()).toBe(true)
  })
})
