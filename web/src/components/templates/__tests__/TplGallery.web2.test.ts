// 波2审计 WEB-07（父级）：TplGallery likedIds 响应式 + likeCountOverrides 覆盖 + enrichedArtworks 传灯箱
// 原缺陷：likedIds 为 setup 时一次性普通 Set，按钮 toggle 后父级快照不变；
// album 翻页/灯箱关闭再开时按钮重建按陈旧快照回显 → 红心变空心、再点多加一次
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import TplGallery from '../TplGallery.vue'
import ArtworkLikeButton from '../../shared/ArtworkLikeButton.vue'
import TplLightbox from '../gallery/TplLightbox.vue'

const h = vi.hoisted(() => ({
  push: vi.fn(),
  storage: new Map<string, string>()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.push })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('../../../utils/storage', () => ({
  safeGetItem: (key: string) => h.storage.get(key) ?? null,
  safeSetItem: (key: string, value: string) => { h.storage.set(key, value) },
  safeRemoveItem: (key: string) => { h.storage.delete(key) }
}))

const ARTWORKS = [
  { id: 1, title: 'Art 1', image_path: 'img/1.png', like_count: 5 },
  { id: 2, title: 'Art 2', image_path: 'img/2.png', like_count: 10 },
  { id: 3, title: 'Art 3', image_path: 'img/3.png', like_count: 0 }
]

function mountGallery(props: Record<string, unknown> = {}) {
  return shallowMount(TplGallery, {
    props: {
      artworks: ARTWORKS,
      subdomain: 'alice',
      layout: 'masonry',
      ...props
    },
    global: {
      mocks: { $t: (key: string) => key },
      // G 批拆分：album 翻页 DOM（箭头/当前页点赞按钮）搬至 TplAlbumStage，
      // 该子组件不 stub（渲染真实 DOM 供 .tpl-album-arrow 选择器与按钮重建断言），
      // 其余子组件（ArtworkLikeButton 等）维持 shallow stub 口径不变
      stubs: { TplAlbumStage: false }
    }
  })
}

describe('TplGallery WEB-07：likedIds 响应式 + likeCountOverrides', () => {
  beforeEach(() => {
    h.push.mockReset()
    h.storage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('masonry：emit update:liked=true 后 :liked 立即响应（核心缺陷回归）', async () => {
    const wrapper = mountGallery()
    const btns = wrapper.findAllComponents(ArtworkLikeButton)
    expect(btns).toHaveLength(3)
    expect(btns[0].props('liked')).toBe(false)
    expect(btns[0].props('initialCount')).toBe(5)

    // 模拟第一张按钮点赞成功 → emit 双事件
    btns[0].vm.$emit('update:liked', true)
    btns[0].vm.$emit('update:count', 6)
    await wrapper.vm.$nextTick()

    // 关键断言：:liked 立即更新（原缺陷：父级快照不变，翻页/重建后回显 false）
    const updated = wrapper.findAllComponents(ArtworkLikeButton)
    expect(updated[0].props('liked')).toBe(true)
    expect(updated[0].props('initialCount')).toBe(6)
    // 其他作品不受影响
    expect(updated[1].props('liked')).toBe(false)
    expect(updated[1].props('initialCount')).toBe(10)
  })

  it('masonry：取消赞后 :liked 恢复 false（双向同步）', async () => {
    // 预设 localStorage 已赞 id=1
    h.storage.set('huiyue_liked_alice', JSON.stringify([1]))
    const wrapper = mountGallery()
    let btns = wrapper.findAllComponents(ArtworkLikeButton)
    // 初始 :liked=true（从 localStorage 读取）
    expect(btns[0].props('liked')).toBe(true)

    // 模拟取消赞
    btns[0].vm.$emit('update:liked', false)
    btns[0].vm.$emit('update:count', 4)
    await wrapper.vm.$nextTick()

    btns = wrapper.findAllComponents(ArtworkLikeButton)
    expect(btns[0].props('liked')).toBe(false)
    expect(btns[0].props('initialCount')).toBe(4)
  })

  it('enrichedArtworks 传灯箱：like_count 覆盖后灯箱收到最新值', async () => {
    const wrapper = mountGallery()
    const btns = wrapper.findAllComponents(ArtworkLikeButton)
    // 模拟第一张点赞
    btns[0].vm.$emit('update:liked', true)
    btns[0].vm.$emit('update:count', 42)
    await wrapper.vm.$nextTick()

    // TplLightbox stub 的 filteredArtworks prop 应为 enrichedArtworks（含 like_count 覆盖）
    const lightbox = wrapper.findComponent(TplLightbox)
    expect(lightbox.exists()).toBe(true)
    const enriched = lightbox.props('filteredArtworks') as Array<{ id: number; like_count: number }>
    expect(enriched.find(a => a.id === 1)?.like_count).toBe(42) // 覆盖生效
    expect(enriched.find(a => a.id === 2)?.like_count).toBe(10) // 原值不变
    expect(enriched.find(a => a.id === 3)?.like_count).toBe(0)  // 原值不变
  })

  it('album 翻页后回来，:liked 不丢失（红心不变空心）', async () => {
    const wrapper = mountGallery({ layout: 'album' })
    // 初始：第一张 :liked=false
    let btn = wrapper.findComponent(ArtworkLikeButton)
    expect(btn.exists()).toBe(true)
    expect(btn.props('liked')).toBe(false)

    // 模拟点赞
    btn.vm.$emit('update:liked', true)
    btn.vm.$emit('update:count', 6)
    await wrapper.vm.$nextTick()

    // 翻到第二张（Transition mode="out-in" 需推进 rAF 定时器）
    await wrapper.find('.tpl-album-arrow--next').trigger('click')
    vi.advanceTimersByTime(100)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    // 翻回第一张
    await wrapper.find('.tpl-album-arrow--prev').trigger('click')
    vi.advanceTimersByTime(100)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    // 关键断言：重建后的按钮 :liked 仍为 true（原缺陷：按陈旧快照回显 false）
    btn = wrapper.findComponent(ArtworkLikeButton)
    expect(btn.exists()).toBe(true)
    expect(btn.props('liked')).toBe(true)
    expect(btn.props('initialCount')).toBe(6)
  })
})

// #56 筛选切换不再重播整块入场：key 随筛选变化 → 子树重建 → useScrollReveal 的 MutationObserver
// 无差别补挂 .tpl-visible → 0.42s 阶梯动画整块重放（12 项实测约 1.08s）。
// 修复口径：首次挂载保留入场；setFilter 首次调用后置 revealDone，两处根类不再挂 tpl-reveal。
describe('TplGallery #56：筛选切换不重播入场动画', () => {
  const GALLERY_WITH_FILTERS = {
    filterSizes: [
      { id: 11, name: 'A4', style_id: 1, style_name: '线稿', sort_order: 1 },
      { id: 12, name: 'A3', style_id: 1, style_name: '线稿', sort_order: 2 }
    ],
    artworks: [
      { id: 1, title: 'Art 1', image_path: 'img/1.png', like_count: 5, size_tags: [{ style_size_id: 11 }] },
      { id: 2, title: 'Art 2', image_path: 'img/2.png', like_count: 10, size_tags: [{ style_size_id: 12 }] },
      { id: 3, title: 'Art 3', image_path: 'img/3.png', like_count: 0, size_tags: [{ style_size_id: 11 }] }
    ]
  }

  /** Transition mode="out-in" 在无 CSS 的测试环境里靠定时器收尾（与上方翻页用例同口径） */
  async function settleSwap(wrapper: ReturnType<typeof mountGallery>) {
    vi.advanceTimersByTime(100)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
  }

  beforeEach(() => {
    h.push.mockReset()
    h.storage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('首次挂载仍带入场景观类（tpl-reveal，入场动画不受影响）', () => {
    const wrapper = mountGallery({ gallery: GALLERY_WITH_FILTERS, layout: 'masonry' })
    const items = wrapper.findAll('.tpl-gallery-item')
    expect(items).toHaveLength(3)
    expect(items.every(i => i.classes().includes('tpl-reveal'))).toBe(true)
  })

  it('切一次筛选后新节点不再挂 tpl-reveal（重建不重播）', async () => {
    const wrapper = mountGallery({ gallery: GALLERY_WITH_FILTERS, layout: 'masonry' })
    await wrapper.findAll('.tpl-gallery-filter')[1].trigger('click')
    await settleSwap(wrapper)

    const items = wrapper.findAll('.tpl-gallery-item')
    expect(items).toHaveLength(2) // 筛选结果仍按 key 重建渲染
    expect(items.some(i => i.classes().includes('tpl-reveal'))).toBe(false)
  })

  it('album：切筛选后舞台根节点同样不再挂 tpl-reveal（子组件口径同步）', async () => {
    const wrapper = mountGallery({ gallery: GALLERY_WITH_FILTERS, layout: 'album' })
    expect(wrapper.find('.tpl-gallery--album').classes()).toContain('tpl-reveal')

    await wrapper.findAll('.tpl-gallery-filter')[1].trigger('click')
    await settleSwap(wrapper)

    expect(wrapper.find('.tpl-gallery--album').classes()).not.toContain('tpl-reveal')
    // 翻页 DOM 仍在（Transition/key 行为不变）
    expect(wrapper.find('.tpl-album-arrow--next').exists()).toBe(true)
  })

  it('切筛选后点赞响应式照旧透传（revealDone 不改数据链路）', async () => {
    const wrapper = mountGallery({ gallery: GALLERY_WITH_FILTERS, layout: 'masonry' })
    await wrapper.findAll('.tpl-gallery-filter')[1].trigger('click')
    await settleSwap(wrapper)

    const btn = wrapper.findComponent(ArtworkLikeButton)
    expect(btn.props('liked')).toBe(false)
    btn.vm.$emit('update:liked', true)
    btn.vm.$emit('update:count', 6)
    await wrapper.vm.$nextTick()

    const updated = wrapper.findComponent(ArtworkLikeButton)
    expect(updated.props('liked')).toBe(true)
    expect(updated.props('initialCount')).toBe(6)
  })
})
