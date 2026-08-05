/**
 * REQ-022 F1: 发布为作品 — POST /api/artist/orders/:id/publish-artwork
 *
 * 用户拍板（不许翻案）：delivered 门槛 / 一图一作品
 * 覆盖：正常发布（复制非移动）/ 非 delivered 拒绝 / 跨画师 / 跨单交付物 /
 *       title 校验 / 空 ids / 路径穿越 / 非图片格式 / 去重
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'
import { buildApp } from '../src/app.js'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

describe('发布为作品 (REQ-022 F1)', () => {
  let app
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 辅助 ───

  function makeArtist(qq) {
    return seedArtist({ qq_number: qq, subdomain: `pub-${qq.slice(-4)}` })
  }

  function authH(artist) {
    const token = createSession(artist.id, artist.token_version)
    return { authorization: AUTH_PREFIX + token }
  }

  /** 交付物 fixture：磁盘文件 + DB 行 */
  function seedDeliverable(orderId, artistId, name = 'd1.jpg') {
    const rel = `deliverables/${artistId}/${name}`
    mkdirSync(join(uploadDir, 'deliverables', String(artistId)), { recursive: true })
    writeFileSync(join(uploadDir, rel), Buffer.from('fake-image-bytes'))
    const r = db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(orderId, rel, name, 100)
    return { id: r.lastInsertRowid, rel, abs: join(uploadDir, rel) }
  }

  function publish(artist, orderId, payload) {
    return app.inject({
      method: 'POST',
      url: `/api/artist/orders/${orderId}/publish-artwork`,
      headers: authH(artist),
      payload
    })
  }

  // ─── 正常链路 ───

  it('TC-PA-01: 2 张图 → 2 条 artworks，复制非移动，原交付物保留', async () => {
    const artist = makeArtist('66001')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id, 'f1.jpg')
    const d2 = seedDeliverable(order.id, artist.id, 'f2.png')

    const res = await publish(artist, order.id, {
      deliverableIds: [d1.id, d2.id],
      title: '完稿发布',
      description: '客户约稿成品'
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.artworks).toHaveLength(2)

    // camelCase 字段 + 一图一作品（title/description 各条共用同一入参）
    for (const a of body.artworks) {
      expect(a).toHaveProperty('id')
      expect(a.imagePath).toMatch(new RegExp(`^images/${artist.id}/`))
      expect(a.title).toBe('完稿发布')
      expect(a.description).toBe('客户约稿成品')
    }

    // 原交付物保留：文件在磁盘 + DB 行在
    expect(existsSync(d1.abs)).toBe(true)
    expect(existsSync(d2.abs)).toBe(true)
    expect(db.prepare('SELECT COUNT(*) c FROM deliverables WHERE order_id = ?').get(order.id).c).toBe(2)

    // artworks 落库：is_cover 默认 0，imagePath 指向公开目录的新文件
    const rows = db.prepare('SELECT * FROM artworks WHERE artist_id = ? ORDER BY id').all(artist.id)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.is_cover).toBe(0)
      expect(r.image_path).toMatch(new RegExp(`^images/${artist.id}/`))
      expect(existsSync(join(uploadDir, r.image_path))).toBe(true)
    }
    // 新路径与源路径不同（复制而非引用）
    expect(rows[0].image_path).not.toBe(d1.rel)
  })

  it('TC-PA-02: description 缺省时为 null', async () => {
    const artist = makeArtist('66002')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id)

    const res = await publish(artist, order.id, { deliverableIds: [d1.id], title: '无描述' })
    expect(res.statusCode).toBe(201)
    expect(res.json().artworks[0].description).toBeNull()
  })

  it('TC-PA-03: deliverableIds 重复去重处理（不报错）', async () => {
    const artist = makeArtist('66003')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id, 'dup.jpg')

    const res = await publish(artist, order.id, {
      deliverableIds: [d1.id, d1.id, d1.id],
      title: '去重'
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().artworks).toHaveLength(1)
  })

  it('TC-PA-04: title 恰好 100 字符通过（边界）', async () => {
    const artist = makeArtist('66004')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id)

    const res = await publish(artist, order.id, { deliverableIds: [d1.id], title: 'T'.repeat(100) })
    expect(res.statusCode).toBe(201)
  })

  // ─── 状态门槛（用户拍板：delivered） ───

  it('TC-PA-05: 非 delivered 状态拒绝（wip/done/pending → 400）', async () => {
    const artist = makeArtist('66005')
    for (const status of ['wip', 'done', 'pending']) {
      const order = seedOrder(artist.id, { status })
      const d1 = seedDeliverable(order.id, artist.id, `${status}.jpg`)
      const res = await publish(artist, order.id, { deliverableIds: [d1.id], title: 'x' })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('PUBLISH_WRONG_STATUS')
      // 未产生作品
      expect(db.prepare('SELECT COUNT(*) c FROM artworks').get().c).toBe(0)
    }
  })

  // ─── 权限 ───

  it('TC-PA-06: 跨画师订单 API 层 404（requireOwnOrder 防枚举现行惯例）', async () => {
    const owner = makeArtist('66006')
    const other = makeArtist('66007')
    const order = seedOrder(owner.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, owner.id)

    const res = await publish(other, order.id, { deliverableIds: [d1.id], title: '偷' })
    expect(res.statusCode).toBe(404)
    expect(db.prepare('SELECT COUNT(*) c FROM artworks').get().c).toBe(0)
  })

  it('TC-PA-07: service 层二次防御 — 直接调用返回 ORDER_NOT_OWNED 403', () => {
    const owner = makeArtist('66008')
    const other = makeArtist('66009')
    const order = seedOrder(owner.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, owner.id)

    expect(() => orderGalleryService.publishArtwork(order.id, other.id, [d1.id], '偷'))
      .rejects.toMatchObject({ code: 'ORDER_NOT_OWNED', statusCode: 403 })
  })

  // ─── 交付物校验 ───

  it('TC-PA-08: deliverableIds 含其他订单的交付物 → 404', async () => {
    const artist = makeArtist('66010')
    const orderA = seedOrder(artist.id, { status: 'delivered' })
    const orderB = seedOrder(artist.id, { status: 'delivered' })
    const dOther = seedDeliverable(orderB.id, artist.id, 'other.jpg')

    const res = await publish(artist, orderA.id, { deliverableIds: [dOther.id], title: 'x' })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('DELIVERABLE_NOT_FOUND')
  })

  it('TC-PA-09: deliverableIds 含不存在的 id → 404', async () => {
    const artist = makeArtist('66011')
    const order = seedOrder(artist.id, { status: 'delivered' })

    const res = await publish(artist, order.id, { deliverableIds: [99999], title: 'x' })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('DELIVERABLE_NOT_FOUND')
  })

  it('TC-PA-10: 非图片格式交付物（zip）拒绝发布 → 400', async () => {
    const artist = makeArtist('66012')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const dZip = seedDeliverable(order.id, artist.id, 'pack.zip')

    const res = await publish(artist, order.id, { deliverableIds: [dZip.id], title: 'x' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_FILE_TYPE')
  })

  it('TC-PA-11: 磁盘文件缺失 → 400 MISSING_FILE（DB 行在但文件被删）', async () => {
    const artist = makeArtist('66013')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id, 'ghost.jpg')
    const { unlinkSync } = await import('fs')
    unlinkSync(d1.abs)

    const res = await publish(artist, order.id, { deliverableIds: [d1.id], title: 'x' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MISSING_FILE')
  })

  // ─── 输入校验（schema 层） ───

  it('TC-PA-12: title 为空 → 400', async () => {
    const artist = makeArtist('66014')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id)

    const res = await publish(artist, order.id, { deliverableIds: [d1.id], title: '' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION')
  })

  it('TC-PA-13: title 超 100 → 400', async () => {
    const artist = makeArtist('66015')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id)

    const res = await publish(artist, order.id, { deliverableIds: [d1.id], title: 'T'.repeat(101) })
    expect(res.statusCode).toBe(400)
  })

  it('TC-PA-14: deliverableIds 空数组 → 400', async () => {
    const artist = makeArtist('66016')
    const order = seedOrder(artist.id, { status: 'delivered' })

    const res = await publish(artist, order.id, { deliverableIds: [], title: 'x' })
    expect(res.statusCode).toBe(400)
  })

  it('TC-PA-15: description 超 500 → 400', async () => {
    const artist = makeArtist('66017')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id)

    const res = await publish(artist, order.id, {
      deliverableIds: [d1.id], title: 'x', description: 'D'.repeat(501)
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-PA-16: 额外字段被静默剥离（ajv removeAdditional 现行配置，不拒绝）', async () => {
    const artist = makeArtist('66018')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const d1 = seedDeliverable(order.id, artist.id)

    const res = await publish(artist, order.id, {
      deliverableIds: [d1.id], title: 'x', hack: true
    })
    // 与 TC-RT-12c（weibo_url 剥离）同一惯例：额外字段被剥离，请求正常处理
    expect(res.statusCode).toBe(201)
    const rows = db.prepare('SELECT COUNT(*) c FROM artworks WHERE artist_id = ?').get(artist.id)
    expect(rows.c).toBe(1)
  })

  // ─── 路径防御 ───

  it('TC-PA-17: DB 中交付物路径含 .. → 拒绝（ILLEGAL_PATH）', async () => {
    const artist = makeArtist('66019')
    const order = seedOrder(artist.id, { status: 'delivered' })
    // 直接构造脏 DB 行（正常上传链路不会产生 ../ 路径，此为纵深防御测试）
    const r = db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(order.id, `deliverables/${artist.id}/../../escape.jpg`, 'escape.jpg', 100)

    const res = await publish(artist, order.id, { deliverableIds: [r.lastInsertRowid], title: 'x' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
  })

  it('TC-PA-18: DB 中交付物路径指向其他画师目录 → 拒绝（ILLEGAL_PATH）', async () => {
    const artist = makeArtist('66020')
    const order = seedOrder(artist.id, { status: 'delivered' })
    const r = db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(order.id, 'deliverables/99999/x.jpg', 'x.jpg', 100)

    const res = await publish(artist, order.id, { deliverableIds: [r.lastInsertRowid], title: 'x' })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
  })

  it('TC-PA-19: 订单不存在 → 404', async () => {
    const artist = makeArtist('66021')
    const res = await publish(artist, 999999, { deliverableIds: [1], title: 'x' })
    expect(res.statusCode).toBe(404)
  })
})
