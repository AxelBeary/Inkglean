import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { deliverOrderWithoutFile } from '../src/features/order/order-gallery.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'

/**
 * audit-a R-1: 脏缓冲单不得劫持交付/取消（tryAutoPromote best-effort）
 */

describe('audit-a R-1 自动递补容错', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88091', subdomain: 'r1artist' })
    seedArtistStages(artist.id)
    db.prepare('UPDATE artists SET batch_limit = 1, buffer_limit = 5, auto_promote = 1 WHERE id = ?').run(artist.id)
  })

  function makePriceOrder(orderNo, zone, status) {
    const order = seedOrder(artist.id, { order_no: orderNo, queue_zone: zone, status, queue_position: 1 })
    db.prepare('UPDATE orders SET total_price_cents = 10000, final_price_cents = 10000 WHERE id = ?').run(order.id)
    return order
  }

  /** 构造守恒必败的脏缓冲单：Σ节点价(2000) ≠ 总价(10000) */
  function makeDirtyBuffer(orderNo) {
    const order = makePriceOrder(orderNo, 'buffer', 'pending')
    db.prepare(`
      INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order)
      VALUES (?, '脏期1', 3000, 1000, 0), (?, '脏期2', 7000, 1000, 1)
    `).run(order.id, order.id)
    return order
  }

  it('TC-R1-01: 交付正式单触发递补时，脏缓冲单不炸主流程且留在 buffer', () => {
    const formal = makePriceOrder('R1-FORM', 'formal', 'wip')
    const dirty = makeDirtyBuffer('R1-DIRTY')

    // 修复前：tryAutoPromote → promoteOrder → 守恒抛错 → 整个交付事务回滚
    expect(() => deliverOrderWithoutFile(formal.id)).not.toThrow()

    const delivered = db.prepare('SELECT status FROM orders WHERE id = ?').get(formal.id)
    expect(delivered.status).toBe('delivered')
    const bufferZone = db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(dirty.id)
    expect(bufferZone.queue_zone).toBe('buffer')
  })

  it('TC-R1-02: 健康缓冲单递补回归不破（auto_promote 正常生效）', () => {
    const formal = makePriceOrder('R1-FORM2', 'formal', 'wip')
    const buffer = makePriceOrder('R1-HEALTHY', 'buffer', 'pending')

    deliverOrderWithoutFile(formal.id)

    const promoted = db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(buffer.id)
    expect(promoted.queue_zone).toBe('formal')
  })
})

/**
 * audit-a R-2: 取消已收款订单守卫
 */
describe('audit-a R-2 取消已收款订单', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88092', subdomain: 'r2artist' })
  })

  it('TC-R2-01: 已收款订单直接取消 → CANCEL_WITH_PAYMENT 409 + detail.paidCents', () => {
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET paid_total_cents = 5000 WHERE id = ?').run(order.id)

    let caught = null
    try {
      orderService.updateOrderStatus(order.id, 'cancelled')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught.code).toBe('CANCEL_WITH_PAYMENT')
    expect(caught.statusCode).toBe(409)
    expect(caught.detail).toEqual({ paidCents: 5000 })
    // 状态未被写入
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status).toBe('wip')
  })

  it('TC-R2-02: confirmPaidCancel=true 已收款订单取消成功', () => {
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET paid_total_cents = 5000 WHERE id = ?').run(order.id)
    const updated = orderService.updateOrderStatus(order.id, 'cancelled', true)
    expect(updated.status).toBe('cancelled')
  })

  it('TC-R2-03: 未收款订单取消不受影响', () => {
    const order = seedOrder(artist.id, { status: 'pending' })
    const updated = orderService.updateOrderStatus(order.id, 'cancelled')
    expect(updated.status).toBe('cancelled')
  })

  it('TC-R2-04: 路由 PUT status 透传 confirmPaidCancel', async () => {
    const { buildApp } = await import('../src/app.js')
    const { createSession } = await import('../src/features/auth/auth.service.js')
    const app = await buildApp({ logger: false })
    await app.ready()
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET paid_total_cents = 3000 WHERE id = ?').run(order.id)

    // 不带确认 → 409 + detail
    const noConfirm = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/status`,
      headers,
      payload: { status: 'cancelled' }
    })
    expect(noConfirm.statusCode).toBe(409)
    expect(noConfirm.json().code).toBe('CANCEL_WITH_PAYMENT')
    expect(noConfirm.json().detail).toEqual({ paidCents: 3000 })

    // 带确认 → 200 cancelled
    const withConfirm = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/status`,
      headers,
      payload: { status: 'cancelled', confirmPaidCancel: true }
    })
    expect(withConfirm.statusCode).toBe(200)
    expect(withConfirm.json().status).toBe('cancelled')
    await app.close()
  })
})
