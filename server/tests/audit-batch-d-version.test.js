import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'
import * as orderWorkflowService from '../src/features/order/order-workflow.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

/**
 * 审计批 D-1（R-5 + P3-1）：订单 version 乐观锁
 * 结构性防患：写路径带版本守卫，旧 version 写入 → ORDER_CONFLICT
 */

function seedOrder(artistId, overrides = {}) {
  const defaults = {
    order_no: `D1-${Math.floor(Math.random() * 1e9)}`,
    client_qq: '99999',
    priority: 'medium',
    status: 'pending',
    source: 'self',
    queue_position: 1,
    queue_zone: 'formal'
  }
  const data = { ...defaults, ...overrides }
  const result = db.prepare(`
    INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position, queue_zone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.order_no, artistId, data.client_qq, data.priority, data.status, data.source, data.queue_position, data.queue_zone)
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(result.lastInsertRowid))
}

/** 手动把订单 version 拨回旧值（模拟双标签页拿到旧快照后另一标签已写入） */
function staleVersionOf(orderId) {
  const row = db.prepare('SELECT version FROM orders WHERE id = ?').get(orderId)
  return row.version - 1
}

describe('审计批 D-1 订单 version 乐观锁', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88100', subdomain: 'd1artist' })
  })

  it('TC-D1-01: 迁移 v53 后 orders.version 列存在且新订单默认 1', () => {
    const cols = db.prepare('PRAGMA table_info(orders)').all()
    const col = cols.find(c => c.name === 'version')
    expect(col).toBeTruthy()
    expect(col.dflt_value).toBe('1')
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    expect(order.version).toBe(1)
  })

  it('TC-D1-02: 带当前 version 写入成功且 version+1', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    const updated = orderService.updateOrderStatus(order.id, 'confirmed', false, order.version)
    expect(updated.status).toBe('confirmed')
    expect(updated.version).toBe(order.version + 1)
  })

  it('TC-D1-03: 旧 version 写入 → ORDER_CONFLICT（模拟双标签页覆盖）', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    // 另一标签页先写（版本 +1）
    orderService.updateOrderStatus(order.id, 'confirmed', false, order.version)
    expect(() => {
      orderService.updateOrderStatus(order.id, 'wip', false, staleVersionOf(order.id))
    }).toThrow('ORDER_CONFLICT')
    // 冲突不产生任何写
    const after = orderService.getOrder(order.id)
    expect(after.status).toBe('confirmed')
    expect(after.version).toBe(2)
  })

  it('TC-D1-04: 不传 version → 行为不变（兼容期兜底读当前版本）', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    orderService.updateOrderStatus(order.id, 'confirmed')
    const updated = orderService.updateOrderStatus(order.id, 'wip')
    expect(updated.status).toBe('wip')
    expect(updated.version).toBe(3)
  })

  it('TC-D1-05: updateDeadline/updateStartDate/updateFinalPrice 旧 version 均抛 ORDER_CONFLICT', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    orderService.updateDeadline(order.id, '2026-09-01T00:00:00.000Z') // 版本推进
    expect(() => orderService.updateDeadline(order.id, '2026-09-02T00:00:00.000Z', staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
    expect(() => orderService.updateStartDate(order.id, '2026-08-20', staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
    expect(() => orderService.updateFinalPrice(order.id, 50000, null, staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
  })

  it('TC-D1-06: advanceStage/rollbackStage/enableTracking 旧 version 均抛 ORDER_CONFLICT', () => {
    seedArtistStages(artist.id)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    const stages = db.prepare(
      'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(artist.id)

    expect(() => orderWorkflowService.advanceStage(order.id, stages[1].id, staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
    // 正常推进两档后，用旧 version 回退 → 冲突
    const advanced = orderWorkflowService.advanceStage(order.id, stages[1].id, order.version)
    orderWorkflowService.advanceStage(order.id, stages[2].id, advanced.version)
    expect(() => orderWorkflowService.rollbackStage(order.id, stages[1].id, staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
  })

  it('TC-D1-07: enableTracking 旧 version 抛 ORDER_CONFLICT', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    seedArtistStages(artist.id)
    expect(() => orderWorkflowService.enableTracking(order.id, staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
  })

  it('TC-D1-08: deliverOrder/deliverOrderWithoutFile 旧 version 抛 ORDER_CONFLICT', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    orderService.updateOrderStatus(order.id, 'confirmed')
    orderService.updateOrderStatus(order.id, 'wip')
    expect(() => orderGalleryService.deliverOrder(order.id, 'deliverables/1/x.png', 'x.png', 100, staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
    expect(() => orderGalleryService.deliverOrderWithoutFile(order.id, staleVersionOf(order.id))).toThrow('ORDER_CONFLICT')
  })

  it('TC-D1-09: promoteOrder 旧 version 抛 ORDER_CONFLICT', () => {
    seedArtistStages(artist.id)
    const buffer = seedOrder(artist.id, { order_no: 'D1-BUF-1', queue_zone: 'buffer', queue_position: 1 })
    expect(() => orderService.promoteOrder(buffer.id, staleVersionOf(buffer.id))).toThrow('ORDER_CONFLICT')
  })

  it('TC-D1-10: compactQueue 批量重排逐条带 version，重排后 version 各 +1 且无冲突', () => {
    const o1 = seedOrder(artist.id, { order_no: 'D1-F1', queue_position: 3, status: 'wip' })
    const o2 = seedOrder(artist.id, { order_no: 'D1-F2', queue_position: 1, status: 'wip' })
    const o3 = seedOrder(artist.id, { order_no: 'D1-F3', queue_position: 2, status: 'wip' })

    orderService.compactQueue(artist.id)

    for (const o of [o1, o2, o3]) {
      const row = db.prepare('SELECT version, queue_position FROM orders WHERE id = ?').get(o.id)
      expect(row.version).toBe(o.version + 1)
    }
    const positions = db.prepare(
      "SELECT queue_position FROM orders WHERE artist_id = ? AND status = 'wip' ORDER BY queue_position"
    ).all(artist.id).map(r => r.queue_position)
    expect(positions).toEqual([1, 2, 3])
  })

  it('TC-D1-11: addPayment 走相对增量不设版本条件，但 version 照常 +1（无丢失更新问题）', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    orderService.addPayment(order.id, { amountCents: 1000, note: '定金', createdBy: 'artist' })
    const row = db.prepare('SELECT version, paid_total_cents FROM orders WHERE id = ?').get(order.id)
    expect(row.paid_total_cents).toBe(1000)
    expect(row.version).toBe(2)
  })

  it('TC-D1-12: 路由层 PUT status 旧 version → 409 ORDER_CONFLICT，当前 version → 200 且 version+1', async () => {
    const token = createSession(artist.id, artist.token_version)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456' })
    // 先推进一档，让 order.version（1）成为「旧快照」但仍是合法正整数（≥1）
    orderService.updateOrderStatus(order.id, 'confirmed', false, order.version)
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const stale = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'wip', version: order.version }
      })
      expect(stale.statusCode).toBe(409)
      expect(stale.json().code).toBe('ORDER_CONFLICT')

      const ok = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'wip', version: order.version + 1 }
      })
      expect(ok.statusCode).toBe(200)
      expect(ok.json().version).toBe(order.version + 2)
    } finally {
      await app.close()
    }
  })
})
