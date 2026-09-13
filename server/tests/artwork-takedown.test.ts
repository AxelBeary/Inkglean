import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import {
  getArtworks,
  getArtistArtworks,
  getArtworksPaged,
  getPublicArtworksPaged,
  getArtworkById,
  takedownArtwork,
  restoreArtwork,
  likeArtwork,
  unlikeArtwork
} from '../src/features/artist/artist-artwork.service.js'
import { getPublicStyles } from '../src/features/pricing/style.public.service.js'

// ============================================
// v76 作品级下架（takedown_at）读路径过滤与可恢复语义
//   公开端一律滤（getArtworks / getPublicArtworksPaged / 档位示例图），
//   画师端/管理端不滤（getArtistArtworks / getArtworksPaged）；行保留、可恢复。
// ============================================

function seedArtwork(artistId: number, title: string, sortOrder: number): number {
  return Number(db.prepare(
    'INSERT INTO artworks (artist_id, image_path, title, description, like_count, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(artistId, `images/${artistId}/${title}.webp`, title, `${title}的自由描述`, 3, sortOrder).lastInsertRowid)
}

describe('v76 作品下架：行保留 + 公开滤 / 画师不滤', () => {
  beforeEach(() => cleanDb())

  it('TC-TD-01: 下架后行仍在、字段不丢；公开端不可见、画师端仍可见且带 takedown_at', () => {
    const artist = seedArtist({ subdomain: 'td1' })
    const keepId = seedArtwork(artist.id, '保留作品', 1)
    const hideId = seedArtwork(artist.id, '被下架作品', 2)

    expect(takedownArtwork(hideId, '违规内容')).toBe(true)

    // 行保留：title/description/like_count 不丢
    const raw = getArtworkById(hideId)!
    expect(raw.title).toBe('被下架作品')
    expect(raw.description).toBe('被下架作品的自由描述')
    expect(raw.like_count).toBe(3)
    expect(raw.takedown_at).not.toBeNull()
    expect(raw.takedown_reason).toBe('违规内容')

    // 公开端过滤
    expect(getArtworks(artist.id).map(a => a.id)).toEqual([keepId])
    const pub = getPublicArtworksPaged(artist.id, 1, 10)
    expect(pub.items.map(a => a.id)).toEqual([keepId])
    expect(pub.total).toBe(1)

    // 画师端不过滤，且透出 takedown_at
    const artistList = getArtistArtworks(artist.id)
    expect(artistList.map(a => a.id).sort((x, y) => x - y)).toEqual([keepId, hideId].sort((x, y) => x - y))
    const hiddenOnArtistSide = artistList.find(a => a.id === hideId)!
    expect(hiddenOnArtistSide.takedown_at).not.toBeNull()
    expect(hiddenOnArtistSide.takedown_reason).toBe('违规内容')
    // 画师端分页同样不过滤
    const paged = getArtworksPaged(artist.id, 1, 10)
    expect(paged.items.map(a => a.id).sort((x, y) => x - y)).toEqual([keepId, hideId].sort((x, y) => x - y))
    expect(paged.total).toBe(2)
  })

  it('TC-TD-02: getPublicArtworksPaged 的 total/hasMore 同口径过滤，分页不错位不漏空洞', () => {
    const artist = seedArtist({ subdomain: 'td2' })
    const a1 = seedArtwork(artist.id, 'A1', 1)
    const a2 = seedArtwork(artist.id, 'A2', 2)
    const a3 = seedArtwork(artist.id, 'A3', 3)
    takedownArtwork(a2, '违规')

    // 3 张下架 1 张 -> total=2；pageSize=1 走完分页：第 1 页 a1、第 2 页 a3、第 3 页空且 hasMore=false
    const p1 = getPublicArtworksPaged(artist.id, 1, 1)
    expect(p1.total).toBe(2)
    expect(p1.items.map(a => a.id)).toEqual([a1])
    expect(p1.hasMore).toBe(true)

    const p2 = getPublicArtworksPaged(artist.id, 2, 1)
    expect(p2.total).toBe(2)
    expect(p2.items.map(a => a.id)).toEqual([a3])
    expect(p2.hasMore).toBe(false)

    const p3 = getPublicArtworksPaged(artist.id, 3, 1)
    expect(p3.items).toHaveLength(0)
    expect(p3.hasMore).toBe(false)
  })

  it('TC-TD-03: 档位示例图回退——作品下架后该尺寸 artwork_image_path 置 null，回退 image 列', () => {
    const artist = seedArtist({ subdomain: 'td3' })
    const artId = seedArtwork(artist.id, '示例图作品', 1)
    const imagePath = `images/${artist.id}/示例图作品.webp`
    const styleRow = db.prepare(
      'INSERT INTO art_styles (artist_id, name, is_active) VALUES (?, ?, 1)'
    ).run(artist.id, '日系')
    db.prepare(
      'INSERT INTO style_sizes (art_style_id, name, base_price, image, image_artwork_id) VALUES (?, ?, ?, ?, ?)'
    ).run(Number(styleRow.lastInsertRowid), '头像', 10000, 'images/fallback-size.webp', artId)

    // 下架前：实时引用命中作品图
    const before = getPublicStyles(artist.id)[0].sizes[0]
    expect(before.image_artwork_id).toBe(artId)
    expect(before.artwork_image_path).toBe(imagePath)

    takedownArtwork(artId, '违规')

    // 下架后：artwork_image_path 置 null，回退到尺寸自身 image 列（下游 ?? null 兜底，无 NPE）
    const after = getPublicStyles(artist.id)[0].sizes[0]
    expect(after.image_artwork_id).toBe(artId) // 引用关系仍在（画师端可解绑）
    expect(after.artwork_image_path).toBeNull()
    expect(after.image).toBe('images/fallback-size.webp')
  })

  it('TC-TD-04: 被下架作品不可点赞/取消点赞（like_count 不变）', () => {
    const artist = seedArtist({ subdomain: 'td4' })
    const artId = seedArtwork(artist.id, '被点赞作品', 1)
    // 未下架时可点赞
    expect(likeArtwork(artId)?.like_count).toBe(4)

    takedownArtwork(artId, '违规')
    expect(likeArtwork(artId)).toBeNull()
    expect(unlikeArtwork(artId)).toBeNull()
    // 点赞数未被改动（仍停在 4）
    expect(getArtworkById(artId)!.like_count).toBe(4)
  })

  it('TC-TD-05: restoreArtwork 后公开端恢复、可再次点赞', () => {
    const artist = seedArtist({ subdomain: 'td5' })
    const artId = seedArtwork(artist.id, '恢复作品', 1)
    takedownArtwork(artId, '违规')
    expect(getArtworks(artist.id).map(a => a.id)).not.toContain(artId)

    expect(restoreArtwork(artId)).toBe(true)
    const restored = getArtworkById(artId)!
    expect(restored.takedown_at).toBeNull()
    expect(restored.takedown_reason).toBeNull()
    expect(getArtworks(artist.id).map(a => a.id)).toContain(artId)
    expect(getPublicArtworksPaged(artist.id, 1, 10).total).toBe(1)
    // 恢复后重新可点赞
    expect(likeArtwork(artId)?.like_count).toBe(4)
  })
})
