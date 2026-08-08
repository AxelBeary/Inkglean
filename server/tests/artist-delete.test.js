import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'

describe('deleteArtist 软删除', () => {
  beforeEach(() => {
    cleanDb()
  })

  // TC-D-01: 软删除后记录仍在 DB，deleted_at 被标记
  it('TC-D-01: 软删除标记 deleted_at，记录不物理删除', () => {
    const artist = seedArtist()
    artistService.deleteArtist(artist.id)

    // getArtistById 不过滤 deleted_at（认证中间件需要找到已删除画师）
    const row = artistService.getArtistById(artist.id)
    expect(row).not.toBeNull()
    expect(row.deleted_at).not.toBeNull()
  })

  // TC-D-02: 软删除后公开查询接口排除该画师
  it('TC-D-02: 软删除后 getAllArtists/getArtistByQq 不可见', () => {
    const artist = seedArtist({ qq_number: '11111' })
    artistService.deleteArtist(artist.id)

    // getAllArtists 过滤 deleted_at IS NULL
    const all = artistService.getAllArtists()
    expect(all.find(a => a.id === artist.id)).toBeUndefined()

    // getArtistByQq 同样过滤
    const byQq = artistService.getArtistByQq('11111')
    expect(byQq).toBeUndefined()
  })

  // TC-D-03: 软删除不影响关联订单
  it('TC-D-03: 关联订单不受软删除影响', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id, { status: 'wip' })

    artistService.deleteArtist(artist.id)

    // 订单仍在
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)
    expect(row).not.toBeNull()
    expect(row.status).toBe('wip')
    expect(row.artist_id).toBe(artist.id)
  })

  // TC-D-04: 软删除不影响关联画风（SPEC-PRICE-2：替代旧档位用例）
  it('TC-D-04: 关联画风不受软删除影响', () => {
    const artist = seedArtist()
    db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '日系', 0, 1)").run(artist.id)

    artistService.deleteArtist(artist.id)

    const styles = db.prepare('SELECT * FROM art_styles WHERE artist_id = ?').all(artist.id)
    expect(styles).toHaveLength(1)
    expect(styles[0].name).toBe('日系')
  })

  // TC-D-05: 重复删除幂等（不报错）
  it('TC-D-05: 重复删除不报错，deleted_at 保持', () => {
    const artist = seedArtist()
    artistService.deleteArtist(artist.id)
    const first = artistService.getArtistById(artist.id)

    // 第二次删除
    artistService.deleteArtist(artist.id)
    const second = artistService.getArtistById(artist.id)

    expect(second.deleted_at).not.toBeNull()
    // token_version 会再次递增（COALESCE+1），但 deleted_at 仍非空
    expect(second.token_version).toBeGreaterThan(first.token_version)
  })

  // TC-D-06: 删除不存在的 id 不报错
  it('TC-D-06: 删除不存在的 id 静默通过', () => {
    expect(() => artistService.deleteArtist(99999)).not.toThrow()
  })

  // TC-D-07: 软删除同时递增 token_version（使旧 token 失效）
  it('TC-D-07: 软删除递增 token_version', () => {
    const artist = seedArtist()
    const before = artist.token_version // 默认 1

    artistService.deleteArtist(artist.id)

    const after = artistService.getArtistById(artist.id)
    expect(after.token_version).toBe(before + 1)
  })

  // TC-D-08: token_version 为 NULL 时 COALESCE 兜底
  it('TC-D-08: token_version 为 NULL 时删除后变为 2', () => {
    const artist = seedArtist()
    // 模拟老数据：token_version = NULL
    db.prepare('UPDATE artists SET token_version = NULL WHERE id = ?').run(artist.id)

    artistService.deleteArtist(artist.id)

    const after = artistService.getArtistById(artist.id)
    // COALESCE(NULL, 1) + 1 = 2
    expect(after.token_version).toBe(2)
  })
})
