/**
 * F7: 发布作品幂等
 *
 * 覆盖：同一 deliverable 连续发布 → 第二次幂等返回同一 artwork（无重复文件/行）；
 *       混合请求（部分已发布）取现有行 + 未发布正常发布；
 *       并发双发唯一约束兜底回查（不抛 500、只留一行一文件）；
 *       DB 唯一索引存在；普通上传作品（无 source_deliverable_id）可多图并存。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createArtwork } from '../src/features/artist/artist.service.js'
import { publishArtwork } from '../src/features/order/order-gallery.service.js'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'

describe('F7 发布作品幂等', () => {
  let artist: ArtistRow
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88301', subdomain: 'f7artist' })
  })

  /** 交付物 fixture：磁盘文件 + DB 行 */
  function seedDeliverable(orderId: number, name = 'idem.jpg'): { id: number; rel: string } {
    const rel = `deliverables/${artist.id}/${name}`
    mkdirSync(join(uploadDir, 'deliverables', String(artist.id)), { recursive: true })
    writeFileSync(join(uploadDir, rel), Buffer.from('fake-image-bytes'))
    const r = db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(orderId, rel, name, 100)
    return { id: Number(r.lastInsertRowid), rel }
  }

  /** 发布目录下 jpg 副本数（幂等断言：无重复文件） */
  const imageFileCount = (): number => {
    const dir = join(uploadDir, 'images', String(artist.id))
    if (!existsSync(dir)) return 0
    return readdirSync(dir).filter(f => f.endsWith('.jpg')).length
  }

  it('TC-F7-01: 同一 deliverable 连续发布两次 → 第二次幂等返回同一 artwork，无重复文件/行', async () => {
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d = seedDeliverable(order.id)

    const first = await publishArtwork(order.id, artist.id, [d.id], '完稿')
    const second = await publishArtwork(order.id, artist.id, [d.id], '完稿')

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(second[0].id).toBe(first[0].id)
    expect(second[0].imagePath).toBe(first[0].imagePath)
    expect((db.prepare('SELECT COUNT(*) c FROM artworks WHERE artist_id = ?').get(artist.id) as { c: number }).c).toBe(1)
    expect((db.prepare('SELECT COUNT(*) c FROM artworks WHERE source_deliverable_id = ?').get(d.id) as { c: number }).c).toBe(1)
    expect(imageFileCount()).toBe(1)
  })

  it('TC-F7-02: 混合请求（已发布 + 未发布）→ 已发布取现有行、未发布正常发布，整体返回', async () => {
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, 'mix-a.jpg')
    const d2 = seedDeliverable(order.id, 'mix-b.jpg')

    const first = await publishArtwork(order.id, artist.id, [d1.id], '已发布')
    const mixed = await publishArtwork(order.id, artist.id, [d1.id, d2.id], '混合')

    expect(mixed).toHaveLength(2)
    expect(mixed[0].id).toBe(first[0].id)
    expect(mixed[0].imagePath).toBe(first[0].imagePath)
    expect(mixed[1].id).not.toBe(first[0].id)
    expect((db.prepare('SELECT COUNT(*) c FROM artworks WHERE artist_id = ?').get(artist.id) as { c: number }).c).toBe(2)
    expect(imageFileCount()).toBe(2)
  })

  it('TC-F7-03: 并发双发 → 均成功返回同一 artwork，只留一行一文件（不报 500）', async () => {
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d = seedDeliverable(order.id, 'race.jpg')

    const [a, b] = await Promise.all([
      publishArtwork(order.id, artist.id, [d.id], '并发'),
      publishArtwork(order.id, artist.id, [d.id], '并发')
    ])

    expect(a[0].id).toBe(b[0].id)
    expect((db.prepare('SELECT COUNT(*) c FROM artworks WHERE artist_id = ?').get(artist.id) as { c: number }).c).toBe(1)
    expect((db.prepare('SELECT source_deliverable_id FROM artworks WHERE id = ?').get(a[0].id) as { source_deliverable_id: number | null }).source_deliverable_id).toBe(d.id)
    expect(imageFileCount()).toBe(1)
  })

  it('TC-F7-04: 唯一约束存在——直接二次 INSERT 同 source_deliverable_id 抛 UNIQUE', async () => {
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d = seedDeliverable(order.id, 'dup.jpg')
    await publishArtwork(order.id, artist.id, [d.id], '约束')

    expect(() => db.prepare(
      'INSERT INTO artworks (artist_id, image_path, title, source_deliverable_id) VALUES (?, ?, ?, ?)'
    ).run(artist.id, `images/${artist.id}/dup2.jpg`, 'x', d.id)).toThrow(/UNIQUE|uq_artworks_source_deliverable/)
  })

  it('TC-F7-05: 普通上传作品（无 source_deliverable_id）不受唯一索引影响，可多图并存', async () => {
    const a1 = await createArtwork(artist.id, { imagePath: `images/${artist.id}/u1.jpg`, title: 'u1' })
    const a2 = await createArtwork(artist.id, { imagePath: `images/${artist.id}/u2.jpg`, title: 'u2' })

    expect(a1!.source_deliverable_id).toBeNull()
    expect(a2!.source_deliverable_id).toBeNull()
    expect((db.prepare('SELECT COUNT(*) c FROM artworks WHERE artist_id = ?').get(artist.id) as { c: number }).c).toBe(2)
  })
})
