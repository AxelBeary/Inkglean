import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { issueAdminDeliverableDownload } from '../src/features/order/order-gallery.service.js'
import { addPayment } from '../src/features/order/order-pricing.js'
import { FILE_TTL_MS, verifyFileTokenDetailed } from '../src/shared/file-sign.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import type { OrderStatus } from '../src/types/entities.js'
import { cleanDb, db, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'

const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR!)
const FILE_BODY = 'synthetic customer deliverable'
const DEPOSIT_CENTS = 200
const INVISIBLE_STATES = [
  { label: '画师主动隐身', sql: "UPDATE artists SET status = 'hidden' WHERE id = ?" },
  { label: '平台下架', sql: 'UPDATE artists SET home_takedown_at = CURRENT_TIMESTAMP WHERE id = ?' },
  { label: '画师被封禁', sql: 'UPDATE artists SET is_banned = 1 WHERE id = ?' },
  { label: '画师被软删', sql: 'UPDATE artists SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?' }
]

describe('历史订单客户取件合同', () => {
  let app: FastifyInstance
  let artist: ArtistRow

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })

  beforeEach(() => {
    cleanDb()
    resetRateLimitBuckets()
    artist = seedArtist()
  })

  afterAll(async () => {
    await app.close()
  })

  function makeOrder(status: OrderStatus = 'delivered', netPaidCents = DEPOSIT_CENTS) {
    const order = seedOrder(artist.id, { status, description: '客户约稿要求' })
    db.prepare('UPDATE orders SET paid_total_cents = ?, final_price_cents = 1000 WHERE id = ?')
      .run(netPaidCents, order.id)
    return order
  }

  function addFile(order: SeededOrder, name = 'final.png', exists = true): number {
    const filePath = `deliverables/${artist.id}/${order.order_no}-${name}`
    if (exists) {
      const file = resolve(UPLOAD_ROOT, filePath)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, FILE_BODY)
    }
    const row = db.prepare('INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)')
      .run(order.id, filePath, name, FILE_BODY.length)
    return Number(row.lastInsertRowid)
  }

  function readOrder(order: SeededOrder, page: 'track' | 'delivery', token: string | null = order.customerToken) {
    return app.inject({
      method: 'GET',
      url: `/api/orders/${page}/${order.order_no}`,
      ...(token === null ? {} : { query: { token } })
    })
  }

  function requestStart(order: SeededOrder, fileId: number, token: string | null = order.customerToken) {
    return app.inject({
      method: 'POST',
      url: `/api/orders/delivery/${order.order_no}/file/${fileId}/download-start`,
      ...(token === null ? {} : { query: { token } })
    })
  }

  function requestConfirm(order: SeededOrder, fileId: number, confirmationToken?: string, token: string | null = order.customerToken) {
    return app.inject({
      method: 'POST',
      url: `/api/orders/delivery/${order.order_no}/file/${fileId}/download-confirm`,
      ...(token === null ? {} : { query: { token } }),
      ...(confirmationToken === undefined ? {} : { payload: { confirmationToken } })
    })
  }

  async function beginDownload(order: SeededOrder, fileId: number) {
    const start = await requestStart(order, fileId)
    expect(start.statusCode).toBe(200)
    return start.json<{ url: string; confirmationToken: string }>()
  }

  async function expectNotFound(order: SeededOrder, fileId: number, token: string | null = order.customerToken) {
    for (const response of [
      await readOrder(order, 'track', token),
      await readOrder(order, 'delivery', token),
      await requestStart(order, fileId, token),
      await requestConfirm(order, fileId, 'not-applicable', token)
    ]) {
      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' })
    }
  }

  it.each(INVISIBLE_STATES)('$label后，定金订单只显示取件并可完成下载', async ({ sql }) => {
    const order = makeOrder()
    const fileId = addFile(order)
    db.prepare(sql).run(artist.id)

    const track = await readOrder(order, 'track')
    expect(track.statusCode).toBe(200)
    expect(track.json()).toEqual({ orderNo: order.order_no, deliveryOnly: true })

    const delivery = await readOrder(order, 'delivery')
    expect(delivery.statusCode).toBe(200)
    expect(delivery.json()).toEqual({
      orderNo: order.order_no,
      status: 'delivered',
      artistName: artist.name,
      deliveryOnly: true,
      deliverables: [{
        id: fileId, fileName: 'final.png', fileSize: FILE_BODY.length, url: '', downloadLocked: false, downloadPending: false
      }]
    })

    const { url, confirmationToken } = await beginDownload(order, fileId)
    const download = await app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)

    const confirm = await requestConfirm(order, fileId, confirmationToken)
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json()).toEqual({ locked: true })
    const after = await readOrder(order, 'delivery')
    expect(after.json()).toMatchObject({ deliveryOnly: true, deliverables: [{ id: fileId, downloadLocked: true, downloadPending: false }] })
    const locked = await requestStart(order, fileId)
    expect(locked.statusCode).toBe(410)
    expect(locked.json()).toMatchObject({ code: 'DOWNLOAD_LOCKED' })
  })

  it('画师可见时未支付、未交付的订单仍按原口径列出并领取已有文件', async () => {
    const order = makeOrder('done', 0)
    const fileId = addFile(order)

    const track = await readOrder(order, 'track')
    expect(track.statusCode).toBe(200)
    expect(track.json()).toMatchObject({ orderNo: order.order_no, description: order.description, paidTotalCents: 0 })
    expect(track.json()).not.toHaveProperty('deliveryOnly')
    const list = await readOrder(order, 'delivery')
    expect(list.statusCode).toBe(200)
    expect(list.json()).toMatchObject({ status: 'done', deliverables: [{ id: fileId, downloadPending: false }] })
    expect(list.json()).not.toHaveProperty('deliveryOnly')

    const { url, confirmationToken } = await beginDownload(order, fileId)
    expect((await app.inject({ method: 'GET', url })).body).toBe(FILE_BODY)
    expect((await requestConfirm(order, fileId, confirmationToken)).statusCode).toBe(200)
  })

  it.each([
    { label: '没有实收', status: 'delivered', paid: 0, record: true },
    { label: '未交付', status: 'done', paid: DEPOSIT_CENTS, record: true },
    { label: '没有交付记录', status: 'delivered', paid: DEPOSIT_CENTS, record: false }
  ] as const)('不可见且$label，查单和各取件操作均不开放', async ({ status, paid, record }) => {
    const order = makeOrder(status, paid)
    const fileId = record ? addFile(order) : 1
    db.prepare(INVISIBLE_STATES[0].sql).run(artist.id)
    await expectNotFound(order, fileId)
  })

  it('已交付且有历史收款，全额撤销后净实收为零仍不可领取', async () => {
    // 走真实收款/撤销路径：门槛读 orders.paid_total_cents，只有让 addPayment 回冲才能真正证明「净额」口径。
    // 必须先收款再置为 delivered——已交付订单禁止补录正数收款（addPayment 终态守卫），本批口径依赖这一点。
    const order = makeOrder('done', 0)
    const fileId = addFile(order)
    const payment = addPayment(order.id, { amountCents: DEPOSIT_CENTS, createdBy: 'artist' })
    db.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(order.id)
    // 负数流水必须带备注（addPayment 规则），此处如实说明全额撤销
    addPayment(order.id, { amountCents: -DEPOSIT_CENTS, revokeOfPaymentId: payment.id, note: '全额退款测试', createdBy: 'artist' })
    const net = db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(order.id) as { paid_total_cents: number }
    expect(net.paid_total_cents).toBe(0)
    db.prepare(INVISIBLE_STATES[1].sql).run(artist.id)
    await expectNotFound(order, fileId)
  })

  it('即使订单符合历史取件条件，错误或缺失的客户令牌仍统一返回查无订单', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const otherOrder = makeOrder()
    db.prepare(INVISIBLE_STATES[0].sql).run(artist.id)
    await expectNotFound(order, fileId, otherOrder.customerToken)
    await expectNotFound(order, fileId, null)
  })

  it('软删画师仅凭缺失文件的旧记录不能取件，也不影响同单仍存在的文件', async () => {
    const order = makeOrder()
    const missing = addFile(order, 'removed.png', false)
    db.prepare(INVISIBLE_STATES[3].sql).run(artist.id)
    await expectNotFound(order, missing)

    const remaining = addFile(order)
    expect((await readOrder(order, 'delivery')).json()).toMatchObject({ deliverables: [{ id: remaining }] })
    expect((await requestStart(order, missing)).statusCode).toBe(404)
    expect((await requestConfirm(order, missing, 'not-applicable')).statusCode).toBe(404)
    const { url } = await beginDownload(order, remaining)
    expect((await app.inject({ method: 'GET', url })).body).toBe(FILE_BODY)
  })

  it('画师变为不可见前签发的有效链接仍可正常下载、一次性消费和确认', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const { url, confirmationToken } = await beginDownload(order, fileId)

    db.prepare(INVISIBLE_STATES[1].sql).run(artist.id)
    const download = await app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403)
    expect((await requestConfirm(order, fileId, confirmationToken)).json()).toEqual({ locked: true })
  })

  it('画师变为不可见不改变原签名的五分钟有效期', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const before = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(before)
    try {
      const { url } = await beginDownload(order, fileId)
      db.prepare(INVISIBLE_STATES[2].sql).run(artist.id)
      now.mockReturnValue(before + FILE_TTL_MS + 1)
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403)
    } finally {
      now.mockRestore()
    }
  })

  it('开始响应的确认令牌匹配签名；缺少令牌返回可恢复冲突，实际领取后才可确认', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const { url, confirmationToken } = await beginDownload(order, fileId)
    const sig = new URL(url, 'http://localhost').searchParams.get('sig')
    expect(confirmationToken).toBeTruthy()
    expect(verifyFileTokenDetailed(sig)?.claims?.nonce).toBe(confirmationToken)

    const missingToken = await requestConfirm(order, fileId)
    expect(missingToken.statusCode).toBe(409)
    expect(missingToken.json()).toMatchObject({ code: 'ORDER_CONFLICT' })
    const notYetReceived = await requestConfirm(order, fileId, confirmationToken)
    expect(notYetReceived.statusCode).toBe(409)
    expect(notYetReceived.json()).toMatchObject({ code: 'ORDER_CONFLICT' })

    const download = await app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)
    const confirmed = await requestConfirm(order, fileId, confirmationToken)
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toEqual({ locked: true })
  })

  it('迟到确认不会锁住新一轮已领取的下载；正确确认可幂等重试', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const previous = await beginDownload(order, fileId)
    const first = await app.inject({ method: 'GET', url: previous.url })
    expect(first.body).toBe(FILE_BODY)

    const current = await beginDownload(order, fileId)
    expect(current.confirmationToken).not.toBe(previous.confirmationToken)
    const second = await app.inject({ method: 'GET', url: current.url })
    expect(second.statusCode).toBe(200)
    expect(second.body).toBe(FILE_BODY)

    const late = await requestConfirm(order, fileId, previous.confirmationToken)
    expect(late.statusCode).toBe(409)
    expect(late.json()).toMatchObject({ code: 'ORDER_CONFLICT' })
    const list = await readOrder(order, 'delivery')
    expect(list.json()).toMatchObject({ deliverables: [{ id: fileId, downloadLocked: false, downloadPending: false }] })

    const confirmed = await requestConfirm(order, fileId, current.confirmationToken)
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toEqual({ locked: true })
    const retry = await requestConfirm(order, fileId, current.confirmationToken)
    expect(retry.statusCode).toBe(200)
    expect(retry.json()).toEqual({ locked: true })
  })

  it('只标记未过期的管理待领取文件；到期可重新开始客户下载', async () => {
    const order = makeOrder()
    const managed = addFile(order, 'managed.png')
    const ordinary = addFile(order, 'ordinary.png')
    db.prepare(INVISIBLE_STATES[3].sql).run(artist.id)
    const before = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(before)
    try {
      const admin = issueAdminDeliverableDownload(order.id, managed)
      await beginDownload(order, ordinary)
      const pending = await readOrder(order, 'delivery')
      expect(pending.statusCode).toBe(200)
      expect(pending.json()).toMatchObject({
        deliveryOnly: true,
        deliverables: expect.arrayContaining([
          expect.objectContaining({ id: managed, downloadPending: true, downloadLocked: false }),
          expect.objectContaining({ id: ordinary, downloadPending: false })
        ])
      })
      const blocked = await requestStart(order, managed)
      expect(blocked.statusCode).toBe(409)
      expect(blocked.json()).toMatchObject({ code: 'ORDER_CONFLICT' })

      now.mockReturnValue(admin.issuedAt + FILE_TTL_MS + 1)
      const expired = await readOrder(order, 'delivery')
      expect(expired.statusCode).toBe(200)
      expect(expired.json<{ deliverables: Array<{ downloadPending: boolean }> }>().deliverables.map(d => d.downloadPending)).toEqual([false, false])
      const { url, confirmationToken } = await beginDownload(order, managed)
      expect(confirmationToken).not.toBe(admin.nonce)
      const download = await app.inject({ method: 'GET', url })
      expect(download.statusCode).toBe(200)
      expect(download.body).toBe(FILE_BODY)
      expect((await requestConfirm(order, managed, confirmationToken)).statusCode).toBe(200)
    } finally {
      now.mockRestore()
    }
  })

  it('参考图和公开过程稿只在画师可见时续签，取件资格不恢复普通查单数据', async () => {
    const order = makeOrder()
    addFile(order)
    const reference = 'references/customer-fixture.png'
    const preview = 'previews/customer-fixture.png'
    db.prepare("INSERT INTO order_references (order_id, file_path, source) VALUES (?, ?, 'client')").run(order.id, reference)
    db.prepare('INSERT INTO order_previews (order_id, file_path) VALUES (?, ?)').run(order.id, preview)
    db.prepare('UPDATE orders SET preview_visible_to_client = 1 WHERE id = ?').run(order.id)
    const refresh = () => app.inject({
      method: 'POST',
      url: `/api/orders/track/${order.order_no}/refresh-signatures`,
      payload: { token: order.customerToken, paths: [reference, preview] }
    })

    const visible = await refresh()
    expect(visible.statusCode).toBe(200)
    expect(Object.keys(visible.json<{ urls: Record<string, string> }>().urls)).toEqual([reference, preview])

    db.prepare(INVISIBLE_STATES[0].sql).run(artist.id)
    expect((await readOrder(order, 'track')).json()).toEqual({ orderNo: order.order_no, deliveryOnly: true })
    const invisible = await refresh()
    expect(invisible.statusCode).toBe(404)
    expect(invisible.json()).toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})
