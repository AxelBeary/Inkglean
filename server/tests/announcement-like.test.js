import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'

describe('F3 小公告 + F1 点赞 (v0.19 第 1 波)', () => {
  beforeEach(() => {
    cleanDb()
  })

  // ─── F3: 小公告 ───

  it('TC-ANN-01: 设置公告后 getAnnouncement 返回文本', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88001', name: 'A', subdomain: 'ann1' })
    artistService.updateArtist(artist.id, { announcement: '本周休息' })
    const fresh = artistService.getArtistById(artist.id)

    const ann = artistService.getAnnouncement(fresh)
    expect(ann).not.toBeNull()
    expect(ann.text).toBe('本周休息')
    expect(ann.expiresAt).toBeNull()
  })

  it('TC-ANN-02: 未设置公告返回 null', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88002', name: 'B', subdomain: 'ann2' })
    const fresh = artistService.getArtistById(artist.id)

    expect(artistService.getAnnouncement(fresh)).toBeNull()
  })

  it('TC-ANN-03: 公告过期后返回 null', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88003', name: 'C', subdomain: 'ann3' })
    // #36 后 updateArtist 拒绝过去日期，直接写 DB 模拟历史数据过期
    db.prepare('UPDATE artists SET announcement = ?, announcement_expires_at = ? WHERE id = ?')
      .run('已过期公告', '2020-01-01 00:00:00', artist.id)
    const fresh = artistService.getArtistById(artist.id)

    expect(artistService.getAnnouncement(fresh)).toBeNull()
  })

  it('TC-ANN-04: 公告未过期正常返回', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88004', name: 'D', subdomain: 'ann4' })
    artistService.updateArtist(artist.id, {
      announcement: '未来公告',
      announcement_expires_at: '2099-12-31 23:59:59'
    })
    const fresh = artistService.getArtistById(artist.id)

    const ann = artistService.getAnnouncement(fresh)
    expect(ann).not.toBeNull()
    expect(ann.text).toBe('未来公告')
    expect(ann.expiresAt).toBe('2099-12-31 23:59:59')
  })

  it('TC-ANN-05: 清除公告（设 null）', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88005', name: 'E', subdomain: 'ann5' })
    artistService.updateArtist(artist.id, { announcement: '临时公告' })
    artistService.updateArtist(artist.id, { announcement: null })
    const fresh = artistService.getArtistById(artist.id)

    expect(artistService.getAnnouncement(fresh)).toBeNull()
  })

  // ─── F1: 点赞 ───

  it('TC-LIKE-01: 点赞 +1', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88006', name: 'F', subdomain: 'like1' })
    const artwork = artistService.createArtwork(artist.id, { imagePath: 'images/1.png', title: '测试' })
    expect(artwork.like_count).toBe(0)

    const liked = artistService.likeArtwork(artwork.id)
    expect(liked.like_count).toBe(1)
  })

  it('TC-LIKE-02: 取消点赞 -1', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88007', name: 'G', subdomain: 'like2' })
    const artwork = artistService.createArtwork(artist.id, { imagePath: 'images/2.png', title: '测试' })
    artistService.likeArtwork(artwork.id)
    artistService.likeArtwork(artwork.id)

    const unliked = artistService.unlikeArtwork(artwork.id)
    expect(unliked.like_count).toBe(1)
  })

  it('TC-LIKE-03: 不低于 0', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88008', name: 'H', subdomain: 'like3' })
    const artwork = artistService.createArtwork(artist.id, { imagePath: 'images/3.png', title: '测试' })

    const result = artistService.unlikeArtwork(artwork.id)
    expect(result.like_count).toBe(0)
  })

  it('TC-LIKE-04: 上限保护 99999', async () => {
    const artist = await artistService.createArtist({ qqNumber: '88009', name: 'I', subdomain: 'like4' })
    const artwork = artistService.createArtwork(artist.id, { imagePath: 'images/4.png', title: '测试' })
    // 直接设到上限
    db.prepare('UPDATE artworks SET like_count = 99999 WHERE id = ?').run(artwork.id)

    const result = artistService.likeArtwork(artwork.id)
    expect(result.like_count).toBe(99999)
  })

  it('TC-LIKE-05: 不存在的作品返回 null', () => {
    expect(artistService.likeArtwork(999999)).toBeNull()
    expect(artistService.unlikeArtwork(999999)).toBeNull()
  })
})
