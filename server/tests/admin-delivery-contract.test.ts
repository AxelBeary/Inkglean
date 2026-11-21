import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, renameSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { Writable } from 'stream'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { DOWNLOAD_GRACE_MS, trackDeliverableTransfer } from '../src/features/order/order-gallery.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'

const FILE_BODY = 'synthetic archive delivery'
const HISTORICAL_TIME = '2026-10-01 01:02:03'
const HISTORICAL_IP = '192.0.2.10'

interface LinkReceipt {
  url: string
  expiresInSeconds: number
}

interface DeliveryLedger {
  download_locked: number
  download_nonce: string | null
  download_attempts: number
  download_fail_total: number
  last_started_at: number | null
  cooldown_until: number | null
  downloaded_at: string | null
  download_ip: string | null
}

function ledger(fileId: number): DeliveryLedger {
  return db.prepare(`
    SELECT download_locked, download_nonce, download_attempts, download_fail_total,
      last_started_at, cooldown_until, downloaded_at, download_ip FROM deliverables WHERE id = ?
  `).get(fileId) as DeliveryLedger
}

function attachFile(order: SeededOrder, name: string, onDisk = true) {
  const relativePath = `deliverables/${order.artist_id}/${name}`
  const file = resolve(process.env.UPLOAD_DIR!, relativePath)
  if (onDisk) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, FILE_BODY)
  }
  const result = db.prepare('INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)')
    .run(order.id, relativePath, name, Buffer.byteLength(FILE_BODY))
  return { id: Number(result.lastInsertRowid), file }
}

function paidArchive(artistId: number, number: string, amount = 150, status = 'delivered'): SeededOrder {
  const order = seedOrder(artistId, { order_no: number, status })
  db.prepare('UPDATE orders SET paid_total_cents = ? WHERE id = ?').run(amount, order.id)
  return order
}

function login(artist: ArtistRow, verified = true) {
  return {
    artist_token: createSession(artist.id, artist.token_version, verified ? {
      authLevel: 'admin_verified', adminVerifiedAt: new Date(Date.now()).toISOString()
    } : {})
  }
}

function lookupUrl(orderNo: string) {
  return `/api/admin/delivery/${orderNo}`
}

function reissueUrl(orderNo: string, fileId: number) {
  return `${lookupUrl(orderNo)}/files/${fileId}/reissue`
}

function customerUrl(order: SeededOrder, fileId: number, action: 'start' | 'confirm') {
  return `/api/orders/delivery/${order.order_no}/file/${fileId}/download-${action}?token=${encodeURIComponent(order.customerToken)}`
}

describe('管理端历史交付合同', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow
  let order: SeededOrder
  let file: ReturnType<typeof attachFile>
  let logText: string

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    logText = ''
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logText += chunk.toString()
        callback()
      }
    })
    app = await buildApp({ logger: stream })
    await app.ready()
    admin = seedArtist({ qq_number: '70001', subdomain: 'archive-admin' })
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(admin.qq_number)
    artist = seedArtist()
    order = paidArchive(artist.id, 'ARCHIVE-001')
    file = attachFile(order, 'archive.bin')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await app.close()
  })

  const lookup = (orderNo = order.order_no) => app.inject({ method: 'GET', url: lookupUrl(orderNo), cookies: login(admin) })
  const reissue = (fileId = file.id, orderNo = order.order_no) =>
    app.inject({ method: 'POST', url: reissueUrl(orderNo, fileId), cookies: login(admin) })

  async function receipt(fileId = file.id): Promise<LinkReceipt> {
    const response = await reissue(fileId)
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    const body = response.json<LinkReceipt>()
    expect(Object.keys(body).sort()).toEqual(['expiresInSeconds', 'url'])
    expect(body.expiresInSeconds).toBe(300)
    return body
  }

  it('查询与补发都要求管理员完成二次验证', async () => {
    const requests = [
      { method: 'GET' as const, url: lookupUrl(order.order_no) },
      { method: 'POST' as const, url: reissueUrl(order.order_no, file.id) }
    ]
    for (const request of requests) {
      expect((await app.inject(request)).statusCode).toBe(401)
      expect((await app.inject({ ...request, cookies: login(artist) })).statusCode).toBe(403)
      const basic = await app.inject({ ...request, cookies: login(admin, false) })
      expect(basic.statusCode).toBe(401)
      expect(basic.json().code).toBe('STEP_UP_REQUIRED')
    }
    expect(ledger(file.id).download_nonce).toBeNull()
    expect(db.prepare('SELECT id FROM admin_actions').all()).toHaveLength(0)
  })

  it('按完整订单号精确搜索，支持已下架及软删画师的已付存档', async () => {
    db.prepare("UPDATE artists SET status = 'hidden', is_banned = 1, home_takedown_at = CURRENT_TIMESTAMP, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(artist.id)
    db.prepare('UPDATE deliverables SET download_locked = 1 WHERE id = ?').run(file.id)
    const response = await lookup()
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      orderNo: order.order_no,
      deliverables: [{ id: file.id, fileName: 'archive.bin', fileSize: Buffer.byteLength(FILE_BODY), downloadLocked: true }]
    })
    expect((await lookup('ARCHIVE')).statusCode).toBe(404)
    expect((await lookup('archive-001')).statusCode).toBe(404)
    const issued = await receipt()
    expect((await app.inject({ method: 'GET', url: issued.url })).body).toBe(FILE_BODY)
  })

  it('要求已交付且净实收为正，正额的无文件交付显示空清单', async () => {
    for (const candidate of [paidArchive(artist.id, 'ARCHIVE-002', 0), paidArchive(artist.id, 'ARCHIVE-003', 150, 'done')]) {
      const candidateFile = attachFile(candidate, candidate.order_no + '.bin')
      expect((await lookup(candidate.order_no)).statusCode).toBe(404)
      expect((await reissue(candidateFile.id, candidate.order_no)).statusCode).toBe(404)
      expect(ledger(candidateFile.id).download_nonce).toBeNull()
    }
    const empty = paidArchive(artist.id, 'ARCHIVE-004')
    expect((await lookup(empty.order_no)).json()).toEqual({ orderNo: empty.order_no, deliverables: [] })
    expect(db.prepare('SELECT id FROM admin_actions').all()).toHaveLength(0)
  })

  it('仅接收订单所属的单文件 ID，签发前要求磁盘文件存在', async () => {
    const absent = attachFile(order, 'missing.bin', false)
    const other = paidArchive(artist.id, 'ARCHIVE-005')
    const otherFile = attachFile(other, 'other.bin')
    expect((await reissue(absent.id)).statusCode).toBe(404)
    expect((await reissue(otherFile.id)).statusCode).toBe(404)
    const unexpectedBody = await app.inject({
      method: 'POST', url: reissueUrl(order.order_no, file.id), cookies: login(admin), payload: { filePath: 'archive.bin' }
    })
    expect(unexpectedBody.statusCode).toBe(400)
    expect(ledger(file.id).download_nonce).toBeNull()
    expect(db.prepare('SELECT id FROM admin_actions').all()).toHaveLength(0)
  })

  it('签发清除旧防护状态并写入行政留痕，HEAD 与 304 保留凭证，文件 GET 才消费', async () => {
    db.prepare(`
      UPDATE deliverables SET download_locked = 1, download_attempts = 2, download_fail_total = 7,
        last_started_at = ?, cooldown_until = ?, downloaded_at = ?, download_ip = ? WHERE id = ?
    `).run(Date.now(), Date.now() + 60_000, HISTORICAL_TIME, HISTORICAL_IP, file.id)
    db.prepare("INSERT INTO admin_actions (admin_id, action, target_type, target_id) VALUES (?, 'artist_ban', 'artist', ?)")
      .run(admin.id, artist.id)
    const issued = await receipt()
    const pending = ledger(file.id)
    expect(Boolean(pending.download_nonce)).toBe(true)
    expect(Number.isInteger(pending.last_started_at)).toBe(true)
    expect(pending).toMatchObject({
      download_locked: 0, download_attempts: 0, download_fail_total: 0,
      cooldown_until: null, downloaded_at: HISTORICAL_TIME, download_ip: HISTORICAL_IP
    })

    const head = await app.inject({ method: 'HEAD', url: issued.url })
    expect(head.statusCode).toBe(200)
    expect(head.body).toBe('')
    const cached = await app.inject({ method: 'GET', url: issued.url, headers: { 'if-none-match': head.headers.etag! } })
    expect(cached.statusCode).toBe(304)
    expect(ledger(file.id).download_locked).toBe(0)
    expect(ledger(file.id).download_nonce === pending.download_nonce).toBe(true)

    const download = await app.inject({ method: 'GET', url: issued.url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)
    expect(download.headers['cache-control']).toBe('no-store')
    expect(ledger(file.id)).toEqual({ ...pending, download_locked: 1, download_nonce: null, last_started_at: null })
    expect((await app.inject({ method: 'HEAD', url: issued.url })).statusCode).toBe(403)
    expect((await lookup()).json().deliverables[0].downloadLocked).toBe(true)

    const audit = await app.inject({
      method: 'GET', url: `/api/admin/admin-actions?action=delivery_link_reissue&targetType=deliverable&targetId=${file.id}`, cookies: login(admin)
    })
    expect(audit.statusCode).toBe(200)
    expect(audit.json().total).toBe(1)
    expect(audit.json().rows[0]).toMatchObject({
      admin_id: admin.id, action: 'delivery_link_reissue', target_type: 'deliverable', target_id: file.id,
      reason: order.order_no, admin_ip: '127.0.0.1'
    })
    expect(db.prepare('SELECT id FROM order_notes WHERE order_id = ?').all(order.id)).toHaveLength(0)
    expect(logText.includes('/uploads/deliverables/')).toBe(true)
    expect(logText.includes('?sig=')).toBe(false)
    const linkSignature = new URL(issued.url, 'http://localhost').searchParams.get('sig')!
    expect(audit.body.includes(linkSignature) || logText.includes(linkSignature)).toBe(false)
  })

  it('补发替换本文件旧链接，画师状态变化与本单其他文件的链接彼此独立', async () => {
    const sibling = attachFile(order, 'sibling.bin')
    const siblingReceipt = await receipt(sibling.id)
    const customer = await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'start') })
    expect(customer.statusCode).toBe(200)
    const firstAdminLink = await receipt()
    expect((await app.inject({ method: 'HEAD', url: customer.json().url })).statusCode).toBe(403)
    db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)
    expect((await app.inject({ method: 'HEAD', url: firstAdminLink.url })).statusCode).toBe(200)
    const secondAdminLink = await receipt()
    expect((await app.inject({ method: 'HEAD', url: firstAdminLink.url })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: siblingReceipt.url })).body).toBe(FILE_BODY)
    expect((await app.inject({ method: 'GET', url: secondAdminLink.url })).body).toBe(FILE_BODY)
  })

  it('同一链接同时开始领取时，只向一个请求返回文件', async () => {
    const issued = await receipt()
    const downloads = await Promise.all([
      app.inject({ method: 'GET', url: issued.url }),
      app.inject({ method: 'GET', url: issued.url })
    ])
    expect(downloads.map(result => result.statusCode).sort()).toEqual([200, 403])
    expect(downloads.find(result => result.statusCode === 200)?.body).toBe(FILE_BODY)
    expect(downloads.find(result => result.statusCode === 403)?.headers['content-disposition']).toBeUndefined()
    expect(ledger(file.id).download_locked).toBe(1)
  })

  it('管理链接有效期保护待取件，期满恢复客户下载且不累计未完成次数', async () => {
    const start = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(start)
    const issued = await receipt()
    now.mockReturnValue(start + 300_000)
    expect((await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'start') })).statusCode).toBe(409)
    expect((await app.inject({ method: 'HEAD', url: issued.url })).statusCode).toBe(200)
    now.mockReturnValue(start + 300_001)
    expect((await app.inject({ method: 'GET', url: issued.url })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'confirm') })).statusCode).toBe(409)
    expect(ledger(file.id).download_locked).toBe(0)
    expect(ledger(file.id).downloaded_at).toBeNull()

    const customer = await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'start') })
    expect(customer.statusCode).toBe(200)
    expect(ledger(file.id)).toMatchObject({ download_attempts: 0, download_fail_total: 0, last_started_at: start + 300_001 })
    expect((await app.inject({ method: 'GET', url: customer.json().url })).body).toBe(FILE_BODY)
    expect((await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'confirm') })).statusCode).toBe(200)
    expect(ledger(file.id).download_locked).toBe(1)
  })

  it('磁盘文件暂不可读时保留管理签名，文件恢复后同一签名可取件', async () => {
    const issued = await receipt()
    const moved = file.file + '.fixture'
    renameSync(file.file, moved)
    try {
      expect((await app.inject({ method: 'GET', url: issued.url })).statusCode).toBe(404)
      expect(ledger(file.id).download_locked).toBe(0)
    } finally {
      renameSync(moved, file.file)
    }
    expect((await app.inject({ method: 'GET', url: issued.url })).body).toBe(FILE_BODY)
  })

  it('保护正在传送与等待客户确认的文件，补发后拒绝旧客户确认', async () => {
    const oldStart = await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'start') })
    expect(oldStart.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: oldStart.json().url })).body).toBe(FILE_BODY)
    expect((await reissue()).statusCode).toBe(409)

    db.prepare('UPDATE deliverables SET last_started_at = ? WHERE id = ?').run(Date.now() - DOWNLOAD_GRACE_MS - 1, file.id)
    const response = new ServerResponse(new IncomingMessage(new Socket()))
    trackDeliverableTransfer(file.id, response)
    try {
      expect((await reissue()).statusCode).toBe(409)
    } finally {
      response.emit('finish')
    }
    expect(db.prepare('SELECT id FROM admin_actions').all()).toHaveLength(0)
    const issued = await receipt()
    const late = await app.inject({ method: 'POST', url: customerUrl(order, file.id, 'confirm') })
    expect(late.statusCode).toBe(409)
    expect(ledger(file.id).downloaded_at).toBeNull()
    expect((await app.inject({ method: 'GET', url: issued.url })).body).toBe(FILE_BODY)
    expect(ledger(file.id).download_locked).toBe(1)
  })
})
