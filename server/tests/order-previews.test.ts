import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { getOrder } from '../src/features/order/order.service.js'
import { createOrder } from '../src/features/order/order-create.js'
import { logActivity } from '../src/features/order/activity-log.service.js'
import {
  addPreview,
  listPreviews,
  updatePreview,
  removePreview,
  updatePreviewSettings,
  getClientPreviews,
  getRevisionQuota
} from '../src/features/order/order-gallery.service.js'
import { MIGRATIONS } from '../src/db/init.js'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

// ============================================
// v81: 过程稿（order_previews）+ 免费修改次数
// 契约：_briefs/_CONTRACT.md §1~§4；语义要点见 v81 迁移注释
// ============================================

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR || './uploads')

/** 落一张真实存在的过程稿图（路径校验要求文件真实存在） */
function ensurePreviewFile(artistId: number, name = 'p1.png'): string {
  const dir = join(UPLOAD_ROOT, 'previews', String(artistId))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), 'v81 preview file')
  return `previews/${artistId}/${name}`
}

/** 1x1 透明 PNG（真实魔数，过 d3 图片魔数校验） */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/** multipart 请求体（照 audit-batch-f-reference-ownership 的同款拼装） */
function multipartBody(filename: string, contentType: string, content: Buffer): { boundary: string; body: Buffer } {
  const boundary = '----V81Boundary' + Date.now() + Math.random().toString(36).slice(2)
  const head = Buffer.from([
    '--' + boundary,
    'Content-Disposition: form-data; name="file"; filename="' + filename + '"',
    'Content-Type: ' + contentType,
    ''
  ].join('\r\n') + '\r\n')
  const tail = Buffer.from('\r\n--' + boundary + '--')
  return { boundary, body: Buffer.concat([head, content, tail]) }
}

/** 造 n 条修改记录（口径同生产：status_change → revision，撤销带 undo 标记不计） */
function seedRevisions(orderId: number, n: number): void {
  for (let i = 0; i < n; i++) {
    logActivity(orderId, 'status_change', 'artist', { from: 'wip', to: 'revision' })
  }
}

function seedStyleSize(artistId: number, freeRevisions: number): number {
  db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artistId)
  const style = db.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artistId) as { id: number }
  const r = db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order, free_revisions) VALUES (?, ?, ?, 1, ?)')
    .run(style.id, '头像', 100, freeRevisions)
  return Number(r.lastInsertRowid)
}

describe('v81 过程稿 + 免费修改次数', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let token: string
  let order: SeededOrder

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist({ qq_number: '88181', subdomain: 'v81-preview' })
    token = createSession(artist.id, artist.token_version)
    order = seedOrder(artist.id, { status: 'wip' })
    app = await buildApp({ logger: false })
  })

  // ─── 1/2. 双层开关 ───

  it('TC-V81-01: 订单开关关 → 客户拿不到任何过程稿；开 → 只拿 visible=1', async () => {
    const visiblePath = ensurePreviewFile(artist.id, 'visible.png')
    const hiddenPath = ensurePreviewFile(artist.id, 'hidden.png')
    const visibleId = addPreview(order.id, artist.id, visiblePath, '线稿')
    const hiddenId = addPreview(order.id, artist.id, hiddenPath, '自用参考')
    updatePreview(order.id, hiddenId, { visible: false })

    // 开关关（默认 0）
    expect(getClientPreviews(order.id)).toEqual([])
    const closed = await app.inject({ method: 'GET', url: `/api/orders/track/${order.order_no}?token=${order.customerToken}` })
    expect(closed.statusCode).toBe(200)
    expect(closed.json().previews).toEqual([])

    // 开关开
    updatePreviewSettings(order.id, { previewVisibleToClient: true })
    const list = getClientPreviews(order.id)
    expect(list.map(p => p.id)).toEqual([visibleId])
    expect(list[0].caption).toBe('线稿')
    expect(list[0].url.startsWith('/uploads/previews/')).toBe(true)

    const open = await app.inject({ method: 'GET', url: `/api/orders/track/${order.order_no}?token=${order.customerToken}` })
    expect(open.statusCode).toBe(200)
    expect(open.json().previews.map((p: { id: number }) => p.id)).toEqual([visibleId])
  })

  it('TC-V81-02: 单图 visible=0 不下发客户，但画师 GET 能看到（含开关状态）', async () => {
    const shown = addPreview(order.id, artist.id, ensurePreviewFile(artist.id, 'a.png'), '第一版')
    const hidden = addPreview(order.id, artist.id, ensurePreviewFile(artist.id, 'b.png'), null)
    updatePreview(order.id, hidden, { visible: false })
    updatePreviewSettings(order.id, { previewVisibleToClient: true, freeRevisionLimit: 3 })

    expect(getClientPreviews(order.id).map(p => p.id)).toEqual([shown])

    const res = await app.inject({
      method: 'GET',
      url: `/api/artist/orders/${order.id}/previews`,
      headers: { Authorization: 'Bearer ' + token }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.previews.map((p: { id: number }) => p.id)).toEqual([hidden, shown]) // 时间倒序，新图在前
    expect(body.previews.find((p: { id: number }) => p.id === hidden).visible).toBe(false)
    expect(body.previews.find((p: { id: number }) => p.id === shown).visible).toBe(true)
    expect(body.previewVisibleToClient).toBe(true)
    expect(body.freeRevisionLimit).toBe(3)
    expect(body.revisionUsed).toBe(0)
  })

  // ─── 3. 路径越界 ───

  it('TC-V81-03: filePath 越界/不存在一拒到底（ILLEGAL_PATH）', () => {
    // 穿越（前缀对但含 ..）
    expect(() => addPreview(order.id, artist.id, `previews/../etc/passwd`, null)).toThrow('ILLEGAL_PATH')
    // 前缀不对（即便文件真实存在也只认 previews/）
    const deliverableDir = join(UPLOAD_ROOT, 'deliverables', String(artist.id))
    mkdirSync(deliverableDir, { recursive: true })
    writeFileSync(join(deliverableDir, 'x.png'), 'not a preview')
    expect(() => addPreview(order.id, artist.id, `deliverables/${artist.id}/x.png`, null)).toThrow('ILLEGAL_PATH')
    // 前缀对但文件不存在
    expect(() => addPreview(order.id, artist.id, `previews/${artist.id}/ghost.png`, null)).toThrow('ILLEGAL_PATH')

    expect(db.prepare('SELECT COUNT(*) AS c FROM order_previews WHERE order_id = ?').get(order.id)).toEqual({ c: 0 })
  })

  it('TC-V81-03b: 路由层同样拒绝越界路径（400 ILLEGAL_PATH）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/previews`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { filePath: 'previews/../secret.png' }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
  })

  it('TC-V81-03c: 跨订单的过程稿 id 一律 404（不泄露他人订单）', async () => {
    const other = seedOrder(artist.id, { status: 'wip' })
    const previewId = addPreview(other.id, artist.id, ensurePreviewFile(artist.id, 'other.png'), null)

    expect(() => updatePreview(order.id, previewId, { visible: false })).toThrow('PREVIEW_NOT_FOUND')
    expect(() => removePreview(order.id, previewId)).toThrow('PREVIEW_NOT_FOUND')
    // 路由层同款（跨单 pid → 404，不是 403/500）
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/artist/orders/${order.id}/previews/${previewId}`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { visible: false }
    })
    expect(patchRes.statusCode).toBe(404)
    expect(patchRes.json().code).toBe('PREVIEW_NOT_FOUND')

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/previews/${previewId}`,
      headers: { Authorization: 'Bearer ' + token }
    })
    expect(delRes.statusCode).toBe(404)

    // 原行未被动
    const row = db.prepare('SELECT visible FROM order_previews WHERE id = ?').get(previewId) as { visible: number }
    expect(row.visible).toBe(1)
  })

  it('TC-V81-03d: 画师 A 拿画师 B 目录下的图给 A 的订单加过程稿 → 被拒（归属前缀）', async () => {
    const otherArtist = seedArtist({ qq_number: '88182', subdomain: 'v81-preview-b' })
    // 文件真实存在、只是落在画师 B 的目录——被拒的唯一原因是归属前缀，不是「文件不存在」
    const filePath = ensurePreviewFile(otherArtist.id, 'b-only.png')
    expect(existsSync(join(UPLOAD_ROOT, filePath))).toBe(true)

    expect(() => addPreview(order.id, artist.id, filePath, null)).toThrow('ILLEGAL_PATH')

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/previews`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { filePath }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ILLEGAL_PATH')
    expect(db.prepare('SELECT COUNT(*) AS c FROM order_previews WHERE order_id = ?').get(order.id)).toEqual({ c: 0 })
  })

  it('TC-V81-04: DELETE 只删登记行，不删磁盘文件', async () => {
    const filePath = ensurePreviewFile(artist.id, 'keep.png')
    const id = addPreview(order.id, artist.id, filePath, null)
    removePreview(order.id, id)
    expect(listPreviews(order.id)).toEqual([])
    expect(existsSync(join(UPLOAD_ROOT, filePath))).toBe(true)
  })

  // ─── 4. 配额派生 ───

  it('TC-V81-05: 配额口径——0=不限（remaining=null）、3 用 2 剩 1、用超不下穿 0', () => {
    // 默认 limit=0 → 不限
    seedRevisions(order.id, 2)
    expect(getRevisionQuota(getOrder(order.id)!)).toEqual({ limit: 0, used: 2, remaining: null })

    updatePreviewSettings(order.id, { freeRevisionLimit: 3 })
    expect(getRevisionQuota(getOrder(order.id)!)).toEqual({ limit: 3, used: 2, remaining: 1 })

    seedRevisions(order.id, 3) // 累计 5
    const quota = getRevisionQuota(getOrder(order.id)!)
    expect(quota.used).toBe(5)
    expect(quota.remaining).toBe(0) // 不用负数
  })

  it('TC-V81-06: track 下发 revisionQuota（limit=0 → remaining=null）', async () => {
    seedRevisions(order.id, 1)
    const res = await app.inject({ method: 'GET', url: `/api/orders/track/${order.order_no}?token=${order.customerToken}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().revisionQuota).toEqual({ limit: 0, used: 1, remaining: null })

    updatePreviewSettings(order.id, { freeRevisionLimit: 2 })
    const res2 = await app.inject({ method: 'GET', url: `/api/orders/track/${order.order_no}?token=${order.customerToken}` })
    expect(res2.json().revisionQuota).toEqual({ limit: 2, used: 1, remaining: 1 })
  })

  // ─── 5. freeRevisionLimit 边界 ───

  it('TC-V81-07: freeRevisionLimit 只收 0..99 整数（100 / -1 / 1.5 全拒）', async () => {
    for (const bad of [100, -1, 1.5]) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/artist/orders/${order.id}/preview-settings`,
        headers: { Authorization: 'Bearer ' + token },
        payload: { freeRevisionLimit: bad }
      })
      expect(res.statusCode).toBe(400)
      // 服务层兑底同款断言（绕过 HTTP 也不收）
      expect(() => updatePreviewSettings(order.id, { freeRevisionLimit: bad })).toThrow('VALIDATION')
    }
    // 边界内正常
    const ok = await app.inject({
      method: 'PATCH',
      url: `/api/artist/orders/${order.id}/preview-settings`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { previewVisibleToClient: true, freeRevisionLimit: 0 }
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ previewVisibleToClient: true, freeRevisionLimit: 0 })
  })

  // ─── 6. 下单快照 ───

  it('TC-V81-08: 下单把档位 free_revisions 快照进 orders.free_revision_limit', () => {
    const sizeWithRevisions = seedStyleSize(artist.id, 2)
    const created = createOrder({ artistId: artist.id, clientQq: '1234567', styleSizeId: sizeWithRevisions })
    expect(getOrder(created.id)!.free_revision_limit).toBe(2)

    // 档位事后改数字，不倒改历史订单
    db.prepare('UPDATE style_sizes SET free_revisions = 9 WHERE id = ?').run(sizeWithRevisions)
    expect(getOrder(created.id)!.free_revision_limit).toBe(2)

    // 无档位（手写单）→ 0 = 不限
    const manual = createOrder({ artistId: artist.id, clientQq: '1234567', source: 'manual' })
    expect(getOrder(manual.id)!.free_revision_limit).toBe(0)
  })

  it('TC-V81-09: 档位 free_revisions 可写（0..99），且新列随尺寸列表下发', async () => {
    const sizeId = seedStyleSize(artist.id, 0)
    const size = db.prepare('SELECT * FROM style_sizes WHERE id = ?').get(sizeId) as { art_style_id: number }

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/art-styles/${size.art_style_id}/sizes/${sizeId}`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { free_revisions: 4 }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().free_revisions).toBe(4)

    const bad = await app.inject({
      method: 'PUT',
      url: `/api/artist/art-styles/${size.art_style_id}/sizes/${sizeId}`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { free_revisions: 100 }
    })
    expect(bad.statusCode).toBe(400)
  })

  // ─── 7. 迁移幂等 ───

  it('TC-V81-10: 迁移 up() 连跑两次不报错（列/表已存在即跳过）', () => {
    const v81 = MIGRATIONS.find(m => m.version === 81)!
    expect(v81).toBeDefined()
    expect(() => {
      v81.up(db)
      v81.up(db)
    }).not.toThrow()
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 81').get()
    expect(applied).toEqual({ version: 81 })
  })

  // ─── debug 批 A2：caption 含标签/实体不再静默清空（400 让画师自己改） ───

  it('TC-V81-13: POST/PATCH caption 含标签或实体 → 400 PREVIEW_CAPTION_INVALID，且不落库', async () => {
    const filePath = ensurePreviewFile(artist.id, 'caption-guard.png')
    const badPost = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/previews`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { filePath, caption: '<b>线稿</b>' }
    })
    expect(badPost.statusCode).toBe(400)
    expect(badPost.json().code).toBe('PREVIEW_CAPTION_INVALID')
    expect(listPreviews(order.id).length).toBe(0)

    const created = addPreview(order.id, artist.id, filePath, '线稿')
    const badPatch = await app.inject({
      method: 'PATCH',
      url: `/api/artist/orders/${order.id}/previews/${created}`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { caption: '<svg onload=alert(1)>线稿</svg>' }
    })
    expect(badPatch.statusCode).toBe(400)
    expect(badPatch.json().code).toBe('PREVIEW_CAPTION_INVALID')
    const row = listPreviews(order.id).find(p => p.id === created)!
    expect(row.caption).toBe('线稿')
  })

  it('TC-V81-14: 正常纯文本（含小于号/和号）不被误拦', async () => {
    const filePath = ensurePreviewFile(artist.id, 'caption-ok.png')
    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/previews`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { filePath, caption: '价格<100 & 细修' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().caption).toBe('价格<100 & 细修')
  })

  // ─── 上传端点 ───

  it('TC-V81-11: POST /api/upload/preview 落 previews/{artistId}/ 并回签名 URL', async () => {
    const { boundary, body } = multipartBody('step1.png', 'image/png', PNG_1X1)
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload/preview',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: body
    })
    expect(res.statusCode).toBe(200)
    const uploaded = res.json() as { filePath: string; url: string; mimeType: string; size: number }
    expect(uploaded.filePath.startsWith(`previews/${artist.id}/`)).toBe(true)
    expect(uploaded.url.startsWith('/uploads/previews/')).toBe(true)
    expect(uploaded.size).toBeGreaterThan(0)

    // 签名链接真能取到（/uploads 钩子 + 静态服务这条链路通）
    const file = await app.inject({ method: 'GET', url: uploaded.url })
    expect(file.statusCode).toBe(200)

    // 挂单：上传产出的路径直接可用
    const attach = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/previews`,
      headers: { Authorization: 'Bearer ' + token },
      payload: { filePath: uploaded.filePath, caption: '第一版' }
    })
    expect(attach.statusCode).toBe(200)
    expect(attach.json().caption).toBe('第一版')
    expect(attach.json().visible).toBe(true)
  })

  it('TC-V81-12: 上传端点要求登录；非图片格式被拒', async () => {
    const anon = await app.inject({ method: 'POST', url: '/api/upload/preview' })
    expect(anon.statusCode).toBe(401)

    const { boundary, body } = multipartBody('note.txt', 'text/plain', Buffer.from('hello'))
    const bad = await app.inject({
      method: 'POST',
      url: '/api/upload/preview',
      headers: { Authorization: 'Bearer ' + token, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: body
    })
    expect(bad.statusCode).toBe(400)
  })
})
