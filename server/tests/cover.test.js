import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'

// ============================================
// v0.25 #5: 封面图（service 层）
// ============================================

describe('封面图 (Cover Artwork)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  /** 快速创建作品 */
  function addArtwork(title) {
    return artistService.createArtwork(artist.id, {
      imagePath: `images/${artist.id}/${title}.png`,
      title
    })
  }

  // TC-CV-01: 设封面 — 基本功能
  it('TC-CV-01: setCover 将作品标记为封面', () => {
    const a1 = addArtwork('作品1')
    const result = artistService.setCover(artist.id, a1.id)

    expect(result.is_cover).toBe(1)
    // 数据库验证
    const row = db.prepare('SELECT is_cover FROM artworks WHERE id = ?').get(a1.id)
    expect(row.is_cover).toBe(1)
  })

  // TC-CV-02: 多张封面共存（用户原声：多张来回滚动）
  it('TC-CV-02: 设多张封面时共存，不互相取消', () => {
    const a1 = addArtwork('作品1')
    const a2 = addArtwork('作品2')
    const a3 = addArtwork('作品3')

    artistService.setCover(artist.id, a1.id)
    artistService.setCover(artist.id, a2.id)

    // a1 仍是封面（多张共存）
    const r1 = db.prepare('SELECT is_cover FROM artworks WHERE id = ?').get(a1.id)
    expect(r1.is_cover).toBe(1)
    // a2 也是封面
    const r2 = db.prepare('SELECT is_cover FROM artworks WHERE id = ?').get(a2.id)
    expect(r2.is_cover).toBe(1)
    // a3 从未设过
    const r3 = db.prepare('SELECT is_cover FROM artworks WHERE id = ?').get(a3.id)
    expect(r3.is_cover).toBe(0)
  })

  // TC-CV-03: 取消封面
  it('TC-CV-03: clearCover 取消封面', () => {
    const a1 = addArtwork('作品1')
    artistService.setCover(artist.id, a1.id)
    const result = artistService.clearCover(artist.id, a1.id)

    expect(result.is_cover).toBe(0)
  })

  // TC-CV-04: 取消非封面作品 — 无副作用
  it('TC-CV-04: clearCover 对非封面作品无副作用', () => {
    const a1 = addArtwork('作品1')
    const a2 = addArtwork('作品2')
    artistService.setCover(artist.id, a1.id)
    artistService.clearCover(artist.id, a2.id)

    // a1 仍是封面
    const r1 = db.prepare('SELECT is_cover FROM artworks WHERE id = ?').get(a1.id)
    expect(r1.is_cover).toBe(1)
  })

  // TC-CV-05: 封面排第一（getArtworks 排序）
  it('TC-CV-05: getArtworks 封面排第一', () => {
    const a1 = addArtwork('作品1')
    const a2 = addArtwork('作品2')
    const a3 = addArtwork('作品3')

    // 设 a3 为封面
    artistService.setCover(artist.id, a3.id)
    const list = artistService.getArtworks(artist.id)

    expect(list[0].id).toBe(a3.id)
    expect(list[0].is_cover).toBe(1)
    // 其余按 sort_order
    expect(list[1].id).toBe(a1.id)
    expect(list[2].id).toBe(a2.id)
  })

  // TC-CV-06: 无封面时排序不变（向后兼容）
  it('TC-CV-06: 无封面时按 sort_order 排序', () => {
    const a1 = addArtwork('作品1')
    const a2 = addArtwork('作品2')
    const list = artistService.getArtworks(artist.id)

    expect(list[0].id).toBe(a1.id)
    expect(list[1].id).toBe(a2.id)
  })

  // TC-CV-07: 封面隔离 — 不影响其他画师
  it('TC-CV-07: 封面操作不影响其他画师', () => {
    const other = seedArtist({ qq_number: '77001', subdomain: 'bob', artist_code: 'BOB' })
    const a1 = addArtwork('我的作品')
    const b1 = artistService.createArtwork(other.id, {
      imagePath: `images/${other.id}/b.png`, title: '别人的作品'
    })

    artistService.setCover(artist.id, a1.id)

    // 别人的作品不受影响
    const bRow = db.prepare('SELECT is_cover FROM artworks WHERE id = ?').get(b1.id)
    expect(bRow.is_cover).toBe(0)
  })

  // TC-CV-08: 默认 is_cover=0（迁移兼容）
  it('TC-CV-08: 新作品默认 is_cover=0', () => {
    const a1 = addArtwork('作品1')
    expect(a1.is_cover).toBe(0)
  })
})
