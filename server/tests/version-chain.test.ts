/**
 * F5: 订单 version 版本链补全
 *
 * 覆盖：priority / reorder / finalPrice（addExtraItem+deleteExtraItem）/
 *       focusImage（small+off）/ removeReference 清焦点图 写后 version 递增；
 *       任一上述写后，带旧 version 的 deadline 写必抛 ORDER_CONFLICT（版本链连通证明）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as orderQueueService from '../src/features/order/order-queue.service.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'

describe('F5 订单 version 版本链补全', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88201', subdomain: 'f5artist' })
  })

  /** 当前 version - 1 = 旧快照版本（模拟双标签页拿到写入前的版本） */
  const staleVersionOf = (orderId: number) =>
    (db.prepare('SELECT version FROM orders WHERE id = ?').get(orderId) as { version: number }).version - 1

  function seedReference(orderId: number, path: string) {
    const r = db.prepare("INSERT INTO order_references (order_id, file_path, source) VALUES (?, ?, 'client')")
      .run(orderId, path)
    return { id: Number(r.lastInsertRowid), path }
  }

  it('TC-F5-01: updatePriority 写后 version +1', () => {
    const order = seedOrder(artist.id, { status: 'confirmed' })
    const updated = orderQueueService.updatePriority(order.id, 'high')
    expect(updated.version).toBe(order.version + 1)
  })

  it('TC-F5-02: reorderQueue 参与行 version 均 +1，位置按传入顺序', () => {
    const o1 = seedOrder(artist.id, { order_no: 'F5-A', status: 'wip', queue_position: 1 })
    const o2 = seedOrder(artist.id, { order_no: 'F5-B', status: 'wip', queue_position: 2 })
    const o3 = seedOrder(artist.id, { order_no: 'F5-C', status: 'wip', queue_position: 3 })

    orderQueueService.reorderQueue(artist.id, [o3.id, o1.id, o2.id])

    for (const o of [o1, o2, o3]) {
      expect((db.prepare('SELECT version FROM orders WHERE id = ?').get(o.id) as { version: number }).version).toBe(o.version + 1)
    }
    const rows = db.prepare(
      "SELECT id, queue_position FROM orders WHERE artist_id = ? AND status = 'wip' ORDER BY queue_position"
    ).all(artist.id) as Array<{ id: number; queue_position: number | null }>
    expect(rows.map(r => r.id)).toEqual([o3.id, o1.id, o2.id])
  })

  it('TC-F5-03: adjustFinalPrice（addExtraItem / deleteExtraItem）写后 version 递增', () => {
    const order = seedOrder(artist.id, { status: 'confirmed' })
    const afterAdd = orderService.addExtraItem(order.id, { name: '加急', priceCents: 1000 })
    expect(afterAdd.version).toBe(order.version + 1)

    const item = db.prepare('SELECT id FROM order_extra_items WHERE order_id = ?').get(order.id) as { id: number }
    const afterDelete = orderService.deleteExtraItem(order.id, item.id)
    expect(afterDelete.version).toBe(afterAdd.version + 1)
  })

  it('TC-F5-04: setFocusImage（small 与 off 两分支）写后 version 递增', () => {
    const order = seedOrder(artist.id, { status: 'wip' })
    const ref = seedReference(order.id, `references/${artist.id}/focus.jpg`)

    const set = orderGalleryService.setFocusImage(order.id, ref.path, 'small')
    expect(set.version).toBe(order.version + 1)

    const off = orderGalleryService.setFocusImage(order.id, null, 'off')
    expect(off.version).toBe(set.version + 1)
    expect(off.focus_image_path).toBeNull()
    expect((off as typeof off & { focus_image_mode: string }).focus_image_mode).toBe('off')
  })

  it('TC-F5-05: removeReference 连带清焦点图写后 version +1', () => {
    const order = seedOrder(artist.id, { status: 'wip' })
    const ref = seedReference(order.id, `references/${artist.id}/r.jpg`)
    orderGalleryService.setFocusImage(order.id, ref.path, 'large')

    const updated = orderGalleryService.removeReference(order.id, ref.id)
    expect(updated.version).toBe(order.version + 2)
    expect(updated.focus_image_path).toBeNull()
    expect((updated as typeof updated & { focus_image_mode: string }).focus_image_mode).toBe('off')
  })

  it('TC-F5-06: 带旧 version 的 deadline 写在任一前述写后必抛 ORDER_CONFLICT', () => {
    // priority 后
    const o1 = seedOrder(artist.id, { order_no: 'F5-P', status: 'confirmed', queue_position: 1 })
    orderQueueService.updatePriority(o1.id, 'high')
    expect(() => orderService.updateDeadline(o1.id, '2026-09-01T00:00:00.000Z', staleVersionOf(o1.id)))
      .toThrow('ORDER_CONFLICT')

    // reorder 后（三单都在正式区，整体重排）
    const o2 = seedOrder(artist.id, { order_no: 'F5-R1', status: 'wip', queue_position: 2 })
    const o3 = seedOrder(artist.id, { order_no: 'F5-R2', status: 'wip', queue_position: 3 })
    orderQueueService.reorderQueue(artist.id, [o3.id, o1.id, o2.id])
    expect(() => orderService.updateDeadline(o2.id, '2026-09-02T00:00:00.000Z', staleVersionOf(o2.id)))
      .toThrow('ORDER_CONFLICT')

    // finalPrice 后
    const o4 = seedOrder(artist.id, { order_no: 'F5-F', status: 'confirmed', queue_position: 4 })
    orderService.addExtraItem(o4.id, { name: 'x', priceCents: 100 })
    expect(() => orderService.updateDeadline(o4.id, '2026-09-03T00:00:00.000Z', staleVersionOf(o4.id)))
      .toThrow('ORDER_CONFLICT')

    // focusImage 后
    const o5 = seedOrder(artist.id, { order_no: 'F5-I', status: 'wip', queue_position: 5 })
    const ref = seedReference(o5.id, `references/${artist.id}/i.jpg`)
    orderGalleryService.setFocusImage(o5.id, ref.path, 'small')
    expect(() => orderService.updateDeadline(o5.id, '2026-09-04T00:00:00.000Z', staleVersionOf(o5.id)))
      .toThrow('ORDER_CONFLICT')
  })
})
