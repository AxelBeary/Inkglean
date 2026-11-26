// F0179 后端回归：客户访问令牌从 URL query 迁往 x-order-token header（双读兼容窗口）
// 覆盖：header 优先 / query 回退（旧版客户端不断）/ header 与 query 并存按 header 判定 /
//       双缺与令牌不符同形 404 且不回显令牌 / 超长 header 视为非法回退 query /
//       download-start → 实际领取 → download-confirm 全链路亦走 header。
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR!)
const FILE_BODY = 'synthetic deliverable for header token test'
const TOKEN = 'hdr-token-secret-0001'

describe('F0179 客户令牌 header 承载（x-order-token 优先 + query 回退）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let order: SeededOrder
  let fileId: number

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist({ qq_number: '88310', subdomain: 'hdr-token' })
    seedArtistStages(artist.id)
    order = seedOrder(artist.id, {
      order_no: 'HDR-TOK-01',
      client_qq: '99310',
      customerToken: TOKEN
    })
    // 一次性下载链路需要真实 deliverable 行 + 落盘文件（confirm 前必须实际领取，
    // 文件访问层会把 nonce 标记为已消费，见 order-gallery confirmDeliverableDownload 口径）
    const filePath = `deliverables/${artist.id}/HDR-TOK-01-final.png`
    const absolute = resolve(UPLOAD_ROOT, filePath)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, FILE_BODY)
    const row = db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(order.id, filePath, 'final.png', FILE_BODY.length)
    fileId = Number(row.lastInsertRowid)
  })

  it('header 令牌：track / delivery 200', async () => {
    const track = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': TOKEN }
    })
    expect(track.statusCode).toBe(200)
    expect(track.json().orderNo).toBe('HDR-TOK-01')

    const delivery = await app.inject({
      method: 'GET',
      url: `/api/orders/delivery/${order.order_no}`,
      headers: { 'x-order-token': TOKEN }
    })
    expect(delivery.statusCode).toBe(200)
    expect(delivery.json().orderNo).toBe('HDR-TOK-01')
  })

  it('query 令牌（兼容窗口）：track 200 —— 旧版前端/收藏请求不断', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}?token=${encodeURIComponent(TOKEN)}`
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().orderNo).toBe('HDR-TOK-01')
  })

  it('header 与 query 并存：按 header 判定（header 对 query 错 → 404；header 错 query 对 → 404）', async () => {
    // F0179 口径：header 说了算——正确 query 救不了错误 header（防降级混用绕过）
    const headerWrong = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': 'wrong-header-token' },
      query: { token: TOKEN }
    })
    expect(headerWrong.statusCode).toBe(404)
    expect(headerWrong.json().code).toBe('ORDER_NOT_FOUND')

    const bothRight = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': TOKEN },
      query: { token: TOKEN }
    })
    expect(bothRight.statusCode).toBe(200)
  })

  it('双缺：与不存在订单同形 404，响应不回显令牌', async () => {
    const missing = await app.inject({ method: 'GET', url: `/api/orders/track/${order.order_no}` })
    const nonexistent = await app.inject({
      method: 'GET',
      url: '/api/orders/track/CT-NO-SUCH',
      headers: { 'x-order-token': 'whatever' }
    })
    expect(missing.statusCode).toBe(404)
    expect(nonexistent.statusCode).toBe(404)
    expect(missing.json()).toEqual(nonexistent.json())
    // 错误分支不回显 header/query 里的令牌（silent 日志纪律的响应面）
    expect(missing.body).not.toContain(TOKEN)
    expect(nonexistent.body).not.toContain('whatever')
  })

  it('超长 header（>128 字符）视为非法 → 回退 query 判定', async () => {
    const oversized = 'x'.repeat(129)
    // header 非法 + query 正确：兼容窗口兜底生效
    const fallback = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': oversized },
      query: { token: TOKEN }
    })
    expect(fallback.statusCode).toBe(200)

    // header 非法 + 无 query：与令牌缺失同形 404
    const rejected = await app.inject({
      method: 'GET',
      url: `/api/orders/track/${order.order_no}`,
      headers: { 'x-order-token': oversized }
    })
    expect(rejected.statusCode).toBe(404)
  })

  it('download-start → 实际领取 → download-confirm 一次性下载链路走 header 令牌', async () => {
    const start = await app.inject({
      method: 'POST',
      url: `/api/orders/delivery/${order.order_no}/file/${fileId}/download-start`,
      headers: { 'x-order-token': TOKEN }
    })
    expect(start.statusCode).toBe(200)
    const { url, confirmationToken } = start.json<{ url: string; confirmationToken: string }>()

    // 实际领取（访问层消费 nonce）——confirm 的前置（未领取先确认必 409，拍板口径）
    const download = await app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)

    const confirm = await app.inject({
      method: 'POST',
      url: `/api/orders/delivery/${order.order_no}/file/${fileId}/download-confirm`,
      headers: { 'x-order-token': TOKEN },
      payload: { confirmationToken }
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().locked).toBe(true)

    // 错 header 在 start 上同样 404（同形不暴露存在性）
    const wrongHeader = await app.inject({
      method: 'POST',
      url: `/api/orders/delivery/${order.order_no}/file/${fileId}/download-start`,
      headers: { 'x-order-token': 'wrong' }
    })
    expect(wrongHeader.statusCode).toBe(404)
    expect(wrongHeader.json().code).toBe('ORDER_NOT_FOUND')
  })
})
