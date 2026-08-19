// useArtistData 纯函数测试（v0.35 联调：对接三号波 1 真实 API 契约）
// 覆盖：F3 尺寸图解析优先级（artwork_image_path > image）、F6 筛选标签构建（filterSizes）、
//       F6 档位筛选语义（size_tags[].style_size_id）
// 纯函数从 useArtistData.js 模块级导出，不依赖组件挂载
import { describe, it, expect, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

import {
  resolveSizeImagePath,
  buildGalleryFilters,
  filterArtworksBySize,
  useArtistData
} from '../useArtistData.js'
import type { PlatformDTO, PublicGallerySize } from '../../api/types.js'

// ─── F3: 尺寸图路径解析（三号契约：后端已解析好 artwork_image_path，互斥语义） ───

describe('resolveSizeImagePath（F3 尺寸图解析）', () => {
  it('size 为空 → 返回空串', () => {
    expect(resolveSizeImagePath(null)).toBe('')
    expect(resolveSizeImagePath(undefined)).toBe('')
  })

  it('artwork_image_path 优先（引用作品集图，后端实时解析路径）', () => {
    const size = { id: 10, artwork_image_path: 'images/1/ref.png', image: 'images/1/solo.png' }
    expect(resolveSizeImagePath(size)).toBe('images/1/ref.png')
  })

  it('无 artwork_image_path → 回退 image 独立上传路径', () => {
    const size = { id: 10, image: 'images/1/solo.png' }
    expect(resolveSizeImagePath(size)).toBe('images/1/solo.png')
  })

  it('两者都无 → 空串（外层兜底画风封面）', () => {
    const bare = { id: 10 } as unknown as Parameters<typeof resolveSizeImagePath>[0]
    const bothNull = { id: 10, artwork_image_path: null, image: null }
    expect(resolveSizeImagePath(bare)).toBe('')
    expect(resolveSizeImagePath(bothNull)).toBe('')
  })
})

// ─── F6: 筛选标签构建（吃后端 GET /public/gallery 的 filterSizes） ───

const FILTER_SINGLE = [
  { id: 1, name: '头像', style_id: 2, style_name: '默认', sort_order: 1 },
  { id: 2, name: '半身像', style_id: 2, style_name: '默认', sort_order: 2 }
]
const FILTER_MULTI = [
  ...FILTER_SINGLE,
  { id: 3, name: '头像', style_id: 5, style_name: '厚涂插画', sort_order: 1 }
]

describe('buildGalleryFilters（F6 筛选标签构建）', () => {
  it('单画风（style_name 唯一）→ 标签只显示尺寸名', () => {
    const filters = buildGalleryFilters(FILTER_SINGLE)
    expect(filters).toHaveLength(2)
    expect(filters[0]).toMatchObject({ sizeId: 1, styleId: 2, label: '头像', sortKey: 1 })
    expect(filters[1].label).toBe('半身像')
  })

  it('多画风（style_name 种类 > 1）→ 标签拼「画风 · 尺寸」区分同名尺寸', () => {
    const filters = buildGalleryFilters(FILTER_MULTI)
    expect(filters).toHaveLength(3)
    expect(filters[0].label).toBe('默认 · 头像')
    expect(filters[2]).toMatchObject({ sizeId: 3, styleId: 5, label: '厚涂插画 · 头像' })
  })

  it('空/缺失 filterSizes → 空数组（不显示筛选行）', () => {
    expect(buildGalleryFilters([])).toEqual([])
    expect(buildGalleryFilters(null)).toEqual([])
    expect(buildGalleryFilters(undefined)).toEqual([])
  })

  it('sort_order 缺失 → sortKey 回退 0 不抛错', () => {
    // 故意构造缺 sort_order 的数据测兜底（越界值按原样传入）
    const sizes = [{ id: 9, name: 'x', style_id: 1, style_name: '默认' }] as unknown as PublicGallerySize[]
    const filters = buildGalleryFilters(sizes)
    expect(filters[0].sortKey).toBe(0)
  })
})

// ─── F6: 档位筛选语义（size_tags 对象数组，按 style_size_id 匹配） ───

describe('filterArtworksBySize（F6 档位筛选）', () => {
  const TAG = (styleSizeId: number) => ({ style_size_id: styleSizeId, size_name: 'x', style_id: 2, style_name: '默认' })
  const ARTS = [
    { id: 1, size_tags: [TAG(1), TAG(2)] },
    { id: 2, size_tags: [TAG(2)] },
    { id: 3, size_tags: [] },          // 没标档位
    { id: 4 }                          // 无 size_tags 字段（旧数据兼容）
  ]

  it('sizeId 为空 → 全部混编（含无标签作品）', () => {
    expect(filterArtworksBySize(ARTS, null)).toHaveLength(4)
  })

  it('选中档位 → 只显示标注该档位的作品', () => {
    expect(filterArtworksBySize(ARTS, 2).map(a => (a as unknown as { id: number }).id)).toEqual([1, 2])
    expect(filterArtworksBySize(ARTS, 1).map(a => (a as unknown as { id: number }).id)).toEqual([1])
  })

  it('没标档位的作品只在「全部」下出现，任何档位筛选下都不出现', () => {
    expect(filterArtworksBySize(ARTS, 1)).not.toContainEqual(expect.objectContaining({ id: 3 }))
    expect(filterArtworksBySize(ARTS, 2)).not.toContainEqual(expect.objectContaining({ id: 4 }))
  })

  it('档位无作品标注 → 空数组（UI 显示空态提示）', () => {
    expect(filterArtworksBySize(ARTS, 999)).toEqual([])
  })

  it('artworks 为 null → 不抛错', () => {
    expect(filterArtworksBySize(null, 1)).toEqual([])
  })
})

// ─── REQ-022 F2: 页脚链接（footerLinks） ───

describe('footerLinks（F2 页脚链接适配）', () => {
  const PLATFORMS = [
    { id: 1, name: '微博', iconKey: 'sinaweibo', fallbackChar: null },
    { id: 2, name: 'Bilibili', iconKey: 'bilibili', fallbackChar: null }
  ] as unknown as PlatformDTO[]

  it('customLinks 新结构 → 按 platformId 解析平台名/图标', () => {
    const { footerLinks } = useArtistData({
      artist: { customLinks: [
        { platformId: 1, url: 'https://weibo.com/test' },
        { platformId: 2, url: 'https://space.bilibili.com/1' }
      ] },
      platforms: PLATFORMS
    })
    expect(footerLinks.value).toEqual([
      { key: 'link-0', url: 'https://weibo.com/test', label: '微博', iconKey: 'sinaweibo', fallbackChar: '' },
      { key: 'link-1', url: 'https://space.bilibili.com/1', label: 'Bilibili', iconKey: 'bilibili', fallbackChar: '' }
    ])
  })

  it('platformId=null（其他）→ 通用链接徽标', () => {
    const { footerLinks } = useArtistData({
      artist: { customLinks: [{ platformId: null, url: 'https://myblog.example.net' }] },
      platforms: PLATFORMS
    })
    expect(footerLinks.value[0]).toMatchObject({ label: 'artistHome.otherLink', iconKey: null, fallbackChar: '' })
  })

  it('customLinks 缺失/空 → 空数组（页脚不显示）', () => {
    expect(useArtistData({ artist: {}, platforms: PLATFORMS }).footerLinks.value).toEqual([])
    expect(useArtistData({ artist: { customLinks: null }, platforms: PLATFORMS }).footerLinks.value).toEqual([])
  })

  it('platformId 未知（平台已删除/停用）→ 归其他兜底不崩', () => {
    const { footerLinks } = useArtistData({
      artist: { customLinks: [{ platformId: 999, url: 'https://example.com' }] },
      platforms: PLATFORMS
    })
    expect(footerLinks.value[0]).toMatchObject({ label: 'artistHome.otherLink', iconKey: null })
  })

  it('platforms 缺失 → 全部走其他，不抛错', () => {
    const { footerLinks } = useArtistData({
      artist: { customLinks: [{ platformId: 1, url: 'https://weibo.com/x' }] }
    })
    expect(footerLinks.value[0]).toMatchObject({ label: 'artistHome.otherLink' })
  })
})
