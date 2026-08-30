// ============================================
// 260830 审计 H-4：交付文件「一次性下载」访问层对账回归
// 病灶：签名 URL 15 分钟内可无限转发（/uploads 钩子只做 HMAC 验签，从不查账）。
// 修法：每次 download-start 签发换新 nonce 写入 download_nonce 列并编入签名载荷，
// 钩子验签后凭载荷与 deliverables 账本对账（行不存在/已锁定/nonce 不符 → 403）。
// 本组用例经 app.inject 走完整请求链（钩子 + 静态服务），锁定四个契约场景 + 兼容边界。
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { signFilePath } from '../src/shared/file-sign.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'
import { buildApp } from '../src/app.js'

const FILE_BODY = 'one-time-download-payload-260830'

describe('一次性下载访问层对账（260830 审计 H-4）', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let order: SeededOrder
  let fileId: number

  /** 交付文件相对路径（与账本登记一致） */
  const deliverablePath = () => `deliverables/${artist.id}/final.png`
  const uploadRoot = () => resolve(process.env.UPLOAD_DIR || './uploads')

  /** 写真实文件到隔离上传目录（静态服务取得到才算真 200） */
  function writeUploadFile(relPath: string, body: string = FILE_BODY): void {
    const abs = resolve(join(uploadRoot(), relPath))
    mkdirSync(resolve(join(abs, '..')), { recursive: true })
    writeFileSync(abs, body)
  }

  /** 取账本行（对账断言用） */
  const row = () => db.prepare('SELECT download_locked, download_nonce FROM deliverables WHERE id = ?')
    .get(fileId) as { download_locked: number; download_nonce: string | null }

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    artist = seedArtist()
    order = seedOrder(artist.id, { order_no: 'DLA-001', status: 'done' })
    orderGalleryService.addDeliverable(order.id, deliverablePath(), 'final.png', FILE_BODY.length)
    fileId = (db.prepare('SELECT id FROM deliverables WHERE order_id = ?').get(order.id) as { id: number }).id
    writeUploadFile(deliverablePath())
  })

  it('TC-DLA-01: 锁定前 — start 签发的新链接放行 200，载荷写库', async () => {
    const { filePath, deliverableId, nonce } = orderGalleryService.startDeliverableDownload(order.id, fileId)
    expect(filePath).toBe(deliverablePath())
    expect(deliverableId).toBe(fileId)
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
    // nonce 已落账本列（访问层对账依据）
    expect(row().download_nonce).toBe(nonce)

    const sig = signFilePath(deliverablePath(), { deliverableId, nonce })
    const res = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${sig}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(FILE_BODY)
    // 交付目录响应头语义不回归（原 TC-ENV-03 覆盖点，260830 收口后迁至本组）
    expect(res.headers['content-disposition']).toBe('attachment')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('TC-DLA-02: 锁定后 — 已发出的旧链接 403（转发即死）', async () => {
    const { deliverableId, nonce } = orderGalleryService.startDeliverableDownload(order.id, fileId)
    const url = `/uploads/${deliverablePath()}?sig=${signFilePath(deliverablePath(), { deliverableId, nonce })}`

    // 确认下载完整接收 → 锁定
    orderGalleryService.confirmDeliverableDownload(order.id, fileId, '203.0.113.9')
    expect(row().download_locked).toBe(1)

    const res = await app.inject({ method: 'GET', url })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: '文件链接无效或已过期' })
  })

  it('TC-DLA-03: nonce 不符 — 行在且未锁定，载荷 nonce 与库中不一致仍 403', async () => {
    orderGalleryService.startDeliverableDownload(order.id, fileId) // 库中已有真实 nonce
    // 伪造载荷：deliverableId 正确、nonce 换成自己的——HMAC 合法但账对不上
    const forgedSig = signFilePath(deliverablePath(), { deliverableId: fileId, nonce: 'f'.repeat(32) })
    const res = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${forgedSig}` })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: '文件链接无效或已过期' })
  })

  it('TC-DLA-04: 再许可后 — 旧链接 403（nonce 已清空）；重新 start 的新链接 200', async () => {
    const first = orderGalleryService.startDeliverableDownload(order.id, fileId)
    const oldUrl = `/uploads/${deliverablePath()}?sig=${signFilePath(deliverablePath(), { deliverableId: first.deliverableId, nonce: first.nonce })}`
    orderGalleryService.confirmDeliverableDownload(order.id, fileId, '203.0.113.9')

    // 画师再许可：解锁 + 清 nonce
    orderGalleryService.repermitDeliverable(order.id, fileId)
    expect(row().download_locked).toBe(0)
    expect(row().download_nonce).toBeNull()

    // 旧链接彻底失效（载荷 nonce 与库中空值不符）
    const old = await app.inject({ method: 'GET', url: oldUrl })
    expect(old.statusCode).toBe(403)

    // 客户重新点「开始下载」→ 新签发链接放行
    const second = orderGalleryService.startDeliverableDownload(order.id, fileId)
    expect(second.nonce).not.toBe(first.nonce)
    const newSig = signFilePath(deliverablePath(), { deliverableId: second.deliverableId, nonce: second.nonce })
    const fresh = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${newSig}` })
    expect(fresh.statusCode).toBe(200)
    expect(fresh.body).toBe(FILE_BODY)
  })

  it('TC-DLA-05: 旧式无载荷交付链接（升级前签发未过期）→ 403（一次性语义下不再放行）', async () => {
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    // 不带 claims 的旧式签名（验签本身通过，但交付目录要求载荷对账）
    const legacySig = signFilePath(deliverablePath())
    const res = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${legacySig}` })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: '文件链接无效或已过期' })
  })

  it('TC-DLA-06: 非交付目录行为不变 — 参考图旧式签名链接照常 200', async () => {
    const refPath = `references/${artist.id}/ref.png`
    writeUploadFile(refPath, 'reference-image-body')
    const sig = signFilePath(refPath) // 无载荷，旧式签名
    const res = await app.inject({ method: 'GET', url: `/uploads/${refPath}?sig=${sig}` })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('reference-image-body')
  })

  it('TC-DLA-07: 载荷指向不存在的账本行 → 403（行不存在即拒）', async () => {
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    // deliverableId 指向不存在的行（999999），路径仍是真实交付文件
    const sig = signFilePath(deliverablePath(), { deliverableId: 999999, nonce: 'f'.repeat(32) })
    const res = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${sig}` })
    expect(res.statusCode).toBe(403)
  })

  it('TC-DLA-08: 预览模式（仅 deliverableId 无 nonce）— 行存在即放行，锁定后仍可预览（画师看自己完稿）', async () => {
    // 画师端预览载荷（拼图选图/水印/详情页）；未经 start，账本无 nonce 也可行（预览不查锁定）
    const previewSig = signFilePath(deliverablePath(), { deliverableId: fileId })
    const before = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${previewSig}` })
    expect(before.statusCode).toBe(200)
    expect(before.body).toBe(FILE_BODY)

    // 锁定（客户已完成一次性下载）后预览仍放行：锁定只约束客户下载链路，不约束画师预览自己的完稿；
    // 但任何下载模式旧链接（带过期 nonce）仍被拦（见 TC-DLA-02/04）
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    orderGalleryService.confirmDeliverableDownload(order.id, fileId, '203.0.113.9')
    const after = await app.inject({ method: 'GET', url: `/uploads/${deliverablePath()}?sig=${previewSig}` })
    expect(after.statusCode).toBe(200)
  })
})
