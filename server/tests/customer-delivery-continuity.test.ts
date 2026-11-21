import { mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
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

  function downloadStep(order: SeededOrder, fileId: number, step: 'start' | 'confirm', token: string | null = order.customerToken) {
    return app.inject({
      method: 'POST',
      url: `/api/orders/delivery/${order.order_no}/file/${fileId}/download-${step}`,
      ...(token === null ? {} : { query: { token } })
    })
  }

  async function expectNotFound(order: SeededOrder, fileId: number, token = order.customerToken as string | null) {
    for (const response of [
      await readOrder(order, 'track', token),
      await readOrder(order, 'delivery', token),
      await downloadStep(order, fileId, 'start', token),
      await downloadStep(order, fileId, 'confirm', token)
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
      deliverables: [{ id: fileId, fileName: 'final.png', fileSize: FILE_BODY.length, url: '', downloadLocked: false }]
    })

    const start = await downloadStep(order, fileId, 'start')
    expect(start.statusCode).toBe(200)
    const { url } = start.json<{ url: string }>()
    const download = await app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)

    const confirm = await downloadStep(order, fileId, 'confirm')
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json()).toEqual({ locked: true })
    const after = await readOrder(order, 'delivery')
    expect(after.json()).toMatchObject({ deliveryOnly: true, deliverables: [{ id: fileId, downloadLocked: true }] })
    const locked = await downloadStep(order, fileId, 'start')
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
    expect(list.json()).toMatchObject({ status: 'done', deliverables: [{ id: fileId }] })
    expect(list.json()).not.toHaveProperty('deliveryOnly')

    const start = await downloadStep(order, fileId, 'start')
    expect(start.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: start.json<{ url: string }>().url })).body).toBe(FILE_BODY)
    expect((await downloadStep(order, fileId, 'confirm')).statusCode).toBe(200)
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

  it('已交付且有历史收款，全退后净实收为零仍不可领取', async () => {
    const order = makeOrder('delivered', 0)
    const fileId = addFile(order)
    const payment = db.prepare('INSERT INTO order_payments (order_id, amount_cents) VALUES (?, ?)')
      .run(order.id, DEPOSIT_CENTS)
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, revoke_of_payment_id) VALUES (?, ?, ?)')
      .run(order.id, -DEPOSIT_CENTS, payment.lastInsertRowid)
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
    expect((await downloadStep(order, missing, 'start')).statusCode).toBe(404)
    expect((await downloadStep(order, missing, 'confirm')).statusCode).toBe(404)
    const start = await downloadStep(order, remaining, 'start')
    expect(start.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: start.json<{ url: string }>().url })).body).toBe(FILE_BODY)
  })

  it('画师变为不可见前签发的有效链接仍可正常下载、一次性消费和确认', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const start = await downloadStep(order, fileId, 'start')
    expect(start.statusCode).toBe(200)
    const { url } = start.json<{ url: string }>()

    db.prepare(INVISIBLE_STATES[1].sql).run(artist.id)
    const download = await app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.body).toBe(FILE_BODY)
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(403)
    expect((await downloadStep(order, fileId, 'confirm')).json()).toEqual({ locked: true })
  })

  it('画师变为不可见不改变原签名的五分钟有效期', async () => {
    const order = makeOrder()
    const fileId = addFile(order)
    const before = Date.now()
    const now = vi.spyOn(Date, 'now').mockReturnValue(before)
    try {
      const start = await downloadStep(order, fileId, 'start')
      expect(start.statusCode).toBe(200)
      db.prepare(INVISIBLE_STATES[2].sql).run(artist.id)
      now.mockReturnValue(before + 5 * 60_000 + 1)
      expect((await app.inject({ method: 'GET', url: start.json<{ url: string }>().url })).statusCode).toBe(403)
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
