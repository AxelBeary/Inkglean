// ============================================
// 815 审计：交付幂等回归
// 1) deliverOrderWithoutFile 已交付重复调用 → 短路返回，不再追加系统备注/活动日志
// 2) addDeliverable 同订单同文件重复交付 → 幂等去重，不重复落行
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'

describe('交付幂等（815 审计）', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  const noteCount = (orderId) => db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?').get(orderId).c
  const logCount = (orderId) => db.prepare('SELECT COUNT(*) AS c FROM order_activity_logs WHERE order_id = ?').get(orderId).c

  it('TC-DLV-01: 无文件交付重复调用 → 幂等短路，备注/日志不再累积', () => {
    const order = seedOrder(artist.id, { order_no: 'DLV-001', status: 'done' })

    const first = orderGalleryService.deliverOrderWithoutFile(order.id)
    expect(first.statusChanged).toBe(true)
    const notesAfterFirst = noteCount(order.id)
    const logsAfterFirst = logCount(order.id)
    expect(notesAfterFirst).toBeGreaterThanOrEqual(1)

    // 重复调用 3 次：备注与日志数量不变，状态保持 delivered
    for (let i = 0; i < 3; i++) {
      const again = orderGalleryService.deliverOrderWithoutFile(order.id)
      expect(again.statusChanged).toBe(false)
      expect(again.order.status).toBe('delivered')
    }
    expect(noteCount(order.id)).toBe(notesAfterFirst)
    expect(logCount(order.id)).toBe(logsAfterFirst)
  })

  it('TC-DLV-02: 同订单同文件重复交付 → deliverables 只落一行；不同文件正常追加', () => {
    const order = seedOrder(artist.id, { order_no: 'DLV-002', status: 'done' })

    orderGalleryService.addDeliverable(order.id, 'images/test/a.png', 'a.png', 100)
    orderGalleryService.addDeliverable(order.id, 'images/test/a.png', 'a.png', 100)
    orderGalleryService.addDeliverable(order.id, 'images/test/a.png', 'a-renamed.png', 100)
    expect(db.prepare('SELECT COUNT(*) AS c FROM deliverables WHERE order_id = ?').get(order.id).c).toBe(1)

    orderGalleryService.addDeliverable(order.id, 'images/test/b.png', 'b.png', 200)
    expect(db.prepare('SELECT COUNT(*) AS c FROM deliverables WHERE order_id = ?').get(order.id).c).toBe(2)
  })
})
