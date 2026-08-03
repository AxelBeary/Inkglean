// useArtistData 纯函数测试（v0.35 F3/F6）
// 覆盖：F3 尺寸图解析优先级、F6 筛选标签派生/档位筛选语义、mock 占位数据形状
// 纯函数从 useArtistData.js 模块级导出，不依赖组件挂载
import { describe, it, expect, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import {
  resolveSizeImagePath,
  deriveGalleryFilters,
  filterArtworksBySize,
  applyV035MockFields
} from '../useArtistData.js'

const ARTWORKS = [
  { id: 1, image_path: 'art/a.png', title: '作品A' },
  { id: 2, image_path: 'art/b.png', title: '作品B' }
]

// ─── F3: 尺寸图解析优先级 ───

describe('resolveSizeImagePath（F3 尺寸图解析）', () => {
  it('size 为空 → 返回空串', () => {
    expect(resolveSizeImagePath(null, ARTWORKS)).toBe('')
  })

  it('image_artwork_id 指向存在作品 → 返回作品图路径（优先于 image）', () => {
    const size = { id: 10, image_artwork_id: 1, image: 'solo.png' }
    expect(resolveSizeImagePath(size, ARTWORKS)).toBe('art/a.png')
  })

  it('image_artwork_id 指向不存在作品 → 回退 image 独立上传路径', () => {
    const size = { id: 10, image_artwork_id: 999, image: 'solo.png' }
    expect(resolveSizeImagePath(size, ARTWORKS)).toBe('solo.png')
  })

  it('image_artwork_id 指向的作品无 image_path → 回退 image', () => {
    const arts = [{ id: 5, image_path: null }]
    const size = { id: 10, image_artwork_id: 5, image: 'solo.png' }
    expect(resolveSizeImagePath(size, arts)).toBe('solo.png')
  })

  it('无 image_artwork_id、有 image → 返回 image', () => {
    expect(resolveSizeImagePath({ id: 10, image: 'solo.png' }, ARTWORKS)).toBe('solo.png')
  })

  it('两者都无 → 空串（外层兜底画风封面）', () => {
    expect(resolveSizeImagePath({ id: 10 }, ARTWORKS)).toBe('')
  })

  it('artworks 缺失（undefined）→ 不抛错，回退 image', () => {
    expect(resolveSizeImagePath({ id: 10, image_artwork_id: 1, image: 'solo.png' }, undefined)).toBe('solo.png')
  })
})

// ─── F6: 筛选标签派生 ───

const STYLES_SINGLE = [{
  id: 11, name: '默认',
  sizes: [
    { id: 111, name: '头像', base_price: 80 },
    { id: 112, name: '全身', base_price: 200 }
  ]
}]
const STYLES_MULTI = [
  ...STYLES_SINGLE,
  { id: 12, name: '线稿', sizes: [{ id: 121, name: '头像', base_price: 50 }] }
]

describe('deriveGalleryFilters（F6 筛选标签派生）', () => {
  it('单画风 → 标签只显示尺寸名', () => {
    const filters = deriveGalleryFilters(STYLES_SINGLE)
    expect(filters).toHaveLength(2)
    expect(filters[0]).toMatchObject({ sizeId: 111, styleId: 11, label: '头像', basePrice: 80 })
    expect(filters[1].label).toBe('全身')
  })

  it('多画风 → 标签用「画风 · 尺寸」区分同名尺寸', () => {
    const filters = deriveGalleryFilters(STYLES_MULTI)
    expect(filters).toHaveLength(3)
    expect(filters[0].label).toBe('默认 · 头像')
    expect(filters[2]).toMatchObject({ sizeId: 121, styleId: 12, label: '线稿 · 头像' })
  })

  it('空画风列表 → 空数组（不显示筛选行）', () => {
    expect(deriveGalleryFilters([])).toEqual([])
    expect(deriveGalleryFilters(null)).toEqual([])
  })

  it('画风无尺寸 → 不产生标签', () => {
    expect(deriveGalleryFilters([{ id: 1, name: '空', sizes: [] }])).toEqual([])
  })
})

// ─── F6: 档位筛选语义 ───

describe('filterArtworksBySize（F6 档位筛选）', () => {
  const ARTS = [
    { id: 1, tags: [111, 112] },
    { id: 2, tags: [112] },
    { id: 3, tags: [] },          // 没标档位
    { id: 4 }                     // 无 tags 字段（旧数据兼容）
  ]

  it('sizeId 为空 → 全部混编（含无标签作品）', () => {
    expect(filterArtworksBySize(ARTS, null)).toHaveLength(4)
  })

  it('选中档位 → 只显示标注该档位的作品', () => {
    expect(filterArtworksBySize(ARTS, 112).map(a => a.id)).toEqual([1, 2])
    expect(filterArtworksBySize(ARTS, 111).map(a => a.id)).toEqual([1])
  })

  it('没标档位的作品只在「全部」下出现，任何档位筛选下都不出现', () => {
    expect(filterArtworksBySize(ARTS, 111)).not.toContainEqual(expect.objectContaining({ id: 3 }))
    expect(filterArtworksBySize(ARTS, 112)).not.toContainEqual(expect.objectContaining({ id: 4 }))
  })

  it('档位无作品标注 → 空数组（UI 显示空态提示）', () => {
    expect(filterArtworksBySize(ARTS, 999)).toEqual([])
  })

  it('artworks 为 null → 不抛错', () => {
    expect(filterArtworksBySize(null, 111)).toEqual([])
  })
})

// ─── v0.35 mock 占位形状（联调前的演示数据契约） ───

describe('applyV035MockFields（mock 占位形状）', () => {
  it('尺寸 0 → image_artwork_id 引用第一张作品；尺寸 1 → image 引用第二张作品路径', () => {
    const { styles } = applyV035MockFields(STYLES_SINGLE, ARTWORKS)
    const sizes = styles[0].sizes
    expect(sizes[0].image_artwork_id).toBe(1)
    expect(sizes[1].image).toBe('art/b.png')
  })

  it('前三个尺寸带描述与工作天数（work_days 递增）', () => {
    const { styles } = applyV035MockFields(STYLES_SINGLE, ARTWORKS)
    const sizes = styles[0].sizes
    expect(sizes[0].description).toBeTruthy()
    expect(sizes[0].work_days).toBe(3)
    expect(sizes[1].work_days).toBe(6)
  })

  it('作品 tags：按步长 2 分配两个档位（覆盖所有档位）；最后一张不标（只在全部下出现）', () => {
    const arts = [
      { id: 1, image_path: 'a.png' },
      { id: 2, image_path: 'b.png' },
      { id: 3, image_path: 'c.png' }
    ]
    const { artworks } = applyV035MockFields(STYLES_SINGLE, arts)
    expect(artworks[0].tags).toEqual([111, 112])
    expect(artworks[1].tags).toEqual([111, 112]) // (2*1)%2=0, (2*1+1)%2=1 → 同两档位去重后一致
    expect(artworks[2].tags).toBeUndefined()
  })

  it('单尺寸画师 → 作品只标唯一档位（不产生重复标签）', () => {
    const styles = [{ id: 11, name: '默认', sizes: [{ id: 111, name: '头像', base_price: 80 }] }]
    const arts = [
      { id: 1, image_path: 'a.png' },
      { id: 2, image_path: 'b.png' }
    ]
    const { artworks } = applyV035MockFields(styles, arts)
    expect(artworks[0].tags).toEqual([111])
    expect(artworks[1].tags).toBeUndefined() // 最后一张不标
  })

  it('无画风（旧模型画师）→ 作品保持原样不附加 tags', () => {
    const arts = [{ id: 1, image_path: 'a.png' }]
    const { artworks } = applyV035MockFields([], arts)
    expect(artworks[0].tags).toBeUndefined()
    expect(artworks[0].image_path).toBe('a.png')
  })

  it('不破坏原有字段（name/base_price/title 保留）', () => {
    const { styles, artworks } = applyV035MockFields(STYLES_SINGLE, ARTWORKS)
    expect(styles[0].name).toBe('默认')
    expect(styles[0].sizes[0].base_price).toBe(80)
    expect(artworks[0].title).toBe('作品A')
  })
})
