// TplAlbumStage 侧露页（peek）返工回归（PR#55 审查第 2 条）
// 原缺陷：首/末页用空串 src + visibility:hidden「隐形」按钮——空串被浏览器解析成文档 URL，
// 每次渲染各发一次整页请求；遮的是现象不是请求。
// 现口径：按钮始终渲染（flex-shrink:0 + width 11% 自带占位，摘掉会让当前页宽度硬跳），
// 但无相邻页时 disabled 且不创建 el-image → DOM 里不存在 <img>，也不可能存在 src。
import { describe, it, expect } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import TplAlbumStage from '../TplAlbumStage.vue'

const ARTWORKS = [
  { id: 1, title: 'Art 1', image_path: 'img/1.png', like_count: 5 },
  { id: 2, title: 'Art 2', image_path: 'img/2.png', like_count: 10 },
  { id: 3, title: 'Art 3', image_path: 'img/3.png', like_count: 0 }
]

// el-image 用真实 img 承载 src，才能断言「不存在 src」而不是断言 stub 存在
const ElImageStub = {
  name: 'ElImage',
  props: ['src', 'fit', 'alt'],
  template: '<span class="el-image-stub"><img :src="src" :alt="alt" /></span>'
}

function mountStage(index: number) {
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

describe('TplAlbumStage peek：越界侧不渲染图片，只做 disabled 占位', () => {
  it('首页：prev 按钮仍在（占位不塌），但整颗不含 img', () => {
    const w = mountStage(0)
    const prev = w.find('.tpl-album-peek--prev')
    expect(prev.exists()).toBe(true)
    expect(prev.attributes('disabled')).toBeDefined()
    expect(prev.find('img').exists()).toBe(false)
  })

  it('末页：next 按钮仍在，但整颗不含 img', () => {
    const w = mountStage(2)
    const next = w.find('.tpl-album-peek--next')
    expect(next.exists()).toBe(true)
    expect(next.attributes('disabled')).toBeDefined()
    expect(next.find('img').exists()).toBe(false)
  })

  it('中间页：两侧都出图，src 走 imgUrl 拼真实路径（非空串）', () => {
    const w = mountStage(1)
    expect(w.find('.tpl-album-peek--prev img').attributes('src')).toBe('https://cdn/img/1.png')
    expect(w.find('.tpl-album-peek--next img').attributes('src')).toBe('https://cdn/img/3.png')
    expect(w.find('.tpl-album-peek--prev').attributes('disabled')).toBeUndefined()
    expect(w.find('.tpl-album-peek--next').attributes('disabled')).toBeUndefined()
  })

  it('非 peek 模式：两颗侧露按钮整体不渲染（原口径不变）', () => {
    const w = shallowMount(TplAlbumStage, {
      props: {
        index: 1,
        peek: false,
        filteredArtworks: ARTWORKS,
        subdomain: 'alice',
        imgUrl: (p?: string | null) => `https://cdn/${p ?? ''}`,
        isLiked: () => false,
        displayLikeCount: () => 0,
        onLikeToggle: () => {},
        onLikeCount: () => {},
        openLightbox: () => {}
      },
      global: { mocks: { $t: (k: string) => k }, stubs: { 'el-image': ElImageStub, ArtworkLikeButton: true } }
    })
    expect(w.find('.tpl-album-peek--prev').exists()).toBe(false)
    expect(w.find('.tpl-album-peek--next').exists()).toBe(false)
  })
})
