// issue #54-3: 画册方向键只吃裸 ←/→
// 原缺陷：Alt+← 既触发画册翻页又触发浏览器后退（两处同时动作）；带 alt/ctrl/meta 的组合键
// 属于浏览器/系统快捷键，本组件一律不处理（也不 preventDefault 去抢浏览器行为）。
import { describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import TplAlbumStage from '../TplAlbumStage.vue'

const ARTWORKS = [
  { id: 1, title: 'Art 1', image_path: 'img/1.png', like_count: 5 },
  { id: 2, title: 'Art 2', image_path: 'img/2.png', like_count: 10 },
  { id: 3, title: 'Art 3', image_path: 'img/3.png', like_count: 0 }
]

const ElImageStub = {
  name: 'ElImage',
  props: ['src', 'fit', 'alt'],
  template: '<span class="el-image-stub"><img :src="src" :alt="alt" /></span>'
}

function mountStage(index = 1) {
  return shallowMount(TplAlbumStage, {
    props: {
      index,
      peek: true,
      filteredArtworks: ARTWORKS,
      subdomain: 'alice',
      imgUrl: (path?: string | null) => `https://cdn/${path ?? ''}`,
      isLiked: () => false,
      displayLikeCount: () => 0,
      onLikeToggle: () => {},
      onLikeCount: () => {},
      openLightbox: () => {}
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { 'el-image': ElImageStub, ArtworkLikeButton: true }
    }
  })
}

function press(key: string, mods: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, ...mods })
  window.dispatchEvent(event)
  return event
}

describe('TplAlbumStage 方向键修饰键护栏（issue #54-3）', () => {
  it('Alt+→ 不翻页（让浏览器前进/后退）', () => {
    const wrapper = mountStage()
    press('ArrowRight', { altKey: true })
    expect(wrapper.emitted('update:index')).toBeUndefined()
    wrapper.unmount()
  })

  it('Ctrl/⌘ + → 不翻页（浏览器标签切换等系统快捷键）', () => {
    const wrapper = mountStage()
    press('ArrowRight', { ctrlKey: true })
    press('ArrowRight', { metaKey: true })
    expect(wrapper.emitted('update:index')).toBeUndefined()
    wrapper.unmount()
  })

  it('Alt+← 不翻页，且不 preventDefault 抢浏览器后退', () => {
    const wrapper = mountStage()
    const event = press('ArrowLeft', { altKey: true })
    expect(wrapper.emitted('update:index')).toBeUndefined()
    expect(event.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('裸 → 照常翻页（护栏不漏掉无修饰键场景）', () => {
    const wrapper = mountStage()
    press('ArrowRight')
    expect(wrapper.emitted('update:index')).toEqual([[2]])
    wrapper.unmount()
  })

  it('Shift+→ 维持现状（仍翻页，shift 未进护栏）', () => {
    const wrapper = mountStage()
    press('ArrowRight', { shiftKey: true })
    expect(wrapper.emitted('update:index')).toEqual([[2]])
    wrapper.unmount()
  })
})
