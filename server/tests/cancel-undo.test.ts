// ============================================
// 815 拍板 #1：取消 5 秒撤销（窗口存 DB）回归
// ①取消带窗口 ②窗口内撤销恢复原状 ③过期 410 ④只撤最近一次（新取消作废旧窗口）
// ⑤窗口期内队列不动、结算后重排 ⑥路由层 cancel/cancel-undo 契约
// ============================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as orderService from '../src/features/order/order.service.js'

/** cancel_undo_windows 行（测试消费字段） */
interface UndoWindowRow {
  prev_status: string
  consumed: number
}

/** order_activity_logs 行（detail_json 字段） */
interface LogRow {
  detail_json: string | null
}

describe('取消 5 秒撤销（815 拍板 #1）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  const windowRows = (orderId: number): UndoWindowRow[] =>
    db.prepare('SELECT * FROM cancel_undo_windows WHERE order_id = ? ORDER BY id DESC').all(orderId) as UndoWindowRow[]

  it('TC-CU-01: 取消写窗口；窗口内撤销恢复原状态并留痕', () => {
    const order = seedOrder(artist.id, { order_no: 'CU-001', status: 'wip' })

    const cancelled = orderService.cancelOrderWithUndo(order.id)
    expect(cancelled.status).toBe('cancelled')
    expect(windowRows(order.id)).toHaveLength(1)
    expect(windowRows(order.id)[0].prev_status).toBe('wip')
    expect(windowRows(order.id)[0].consumed).toBe(0)

    const restored = orderService.undoCancelOrder(order.id, artist.id)
    expect(restored.status).toBe('wip')
    expect(windowRows(order.id)[0].consumed).toBe(1)
    // 撤销留痕（status_change + undo 标记）
    const logs = db.prepare(
      "SELECT detail_json FROM order_activity_logs WHERE order_id = ? AND action_type = 'status_change'"
    ).all(order.id) as LogRow[]
    const undoLog = logs.filter(l => l.detail_json && JSON.parse(l.detail_json).undo === true)
    expect(undoLog).toHaveLength(1)
  })

  it('TC-CU-02: 窗口过期后撤销 → 410', () => {
    const order = seedOrder(artist.id, { order_no: 'CU-002', status: 'wip' })
    orderService.cancelOrderWithUndo(order.id)
    // 把窗口拨到过去
    db.prepare('UPDATE cancel_undo_windows SET expires_at = ? WHERE order_id = ?').run(Date.now() - 1000, order.id)

    expect(() => orderService.undoCancelOrder(order.id, artist.id)).toThrow('CANCEL_UNDO_EXPIRED')
    // 订单保持已取消
    expect((db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id) as { status: string }).status).toBe('cancelled')
  })

  it('TC-CU-03: 只撤最近一次——新取消作废旧窗口', () => {
    const o1 = seedOrder(artist.id, { order_no: 'CU-003', status: 'wip' })
    const o2 = seedOrder(artist.id, { order_no: 'CU-004', status: 'wip' })

    orderService.cancelOrderWithUndo(o1.id)
    orderService.cancelOrderWithUndo(o2.id)

    // o1 的窗口已被作废（consumed=2），不可再撤
    expect(windowRows(o1.id)[0].consumed).toBe(2)
    expect(() => orderService.undoCancelOrder(o1.id, artist.id)).toThrow('CANCEL_UNDO_EXPIRED')
    // o2 的窗口有效
    expect(orderService.undoCancelOrder(o2.id, artist.id).status).toBe('wip')
  })

  it('TC-CU-04: 窗口期内队列位置不动，过期结算后重排', () => {
    const o1 = seedOrder(artist.id, { order_no: 'CU-005', status: 'wip', queue_position: 1 })
    const o2 = seedOrder(artist.id, { order_no: 'CU-006', status: 'wip', queue_position: 2 })

    orderService.cancelOrderWithUndo(o1.id)
    // 撤销期内：o2 位置保持原样（队列未重排）
    expect((db.prepare('SELECT queue_position FROM orders WHERE id = ?').get(o2.id) as { queue_position: number }).queue_position).toBe(2)

    // 窗口拨到过去后结算
    db.prepare('UPDATE cancel_undo_windows SET expires_at = ? WHERE order_id = ?').run(Date.now() - 1000, o1.id)
    orderService.settleExpiredUndoWindows(artist.id)
    expect((db.prepare('SELECT queue_position FROM orders WHERE id = ?').get(o2.id) as { queue_position: number }).queue_position).toBe(1)
    expect(windowRows(o1.id)[0].consumed).toBe(2)
  })

  it('TC-CU-05: 已收款取消仍需显式确认（409）', () => {
    const order = seedOrder(artist.id, { order_no: 'CU-007', status: 'wip' })
    db.prepare('UPDATE orders SET paid_total_cents = 5000 WHERE id = ?').run(order.id)

    expect(() => orderService.cancelOrderWithUndo(order.id)).toThrow('CANCEL_WITH_PAYMENT')
    expect(orderService.cancelOrderWithUndo(order.id, true).status).toBe('cancelled')
  })
})

describe('取消撤销路由层（815 拍板 #1）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => { await app.close() })

  it('TC-CU-06: POST /cancel 返回 undoWindowMs；/cancel-undo 恢复状态', async () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id, { order_no: 'CU-010', status: 'wip' })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/cancel`,
      headers,
      payload: {}
    })
    expect(cancelRes.statusCode).toBe(200)
    expect(cancelRes.json().status).toBe('cancelled')
    expect(cancelRes.json().undoWindowMs).toBe(5000)

    const undoRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/cancel-undo`,
      headers
    })
    expect(undoRes.statusCode).toBe(200)
    expect(undoRes.json().status).toBe('wip')

    // 二次撤销：订单已恢复非 cancelled，状态检查先行拦截（400）
    const again = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/cancel-undo`,
      headers
    })
    expect(again.statusCode).toBe(400)
    expect(again.json().code).toBe('INVALID_TRANSITION')
  })
})
