import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { getOrderLogs, logActivity } from '../src/features/order/activity-log.service.js'

describe('操作日志（d3 P2 脏 JSON 容错）', () => {
  beforeEach(() => cleanDb())

  it('TC-AL-01: 单行 detail_json 非 JSON 时 detail 置 null，整页不 500', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id)
    logActivity(order.id, 'note_update', 'artist', { action: 'add', hasImage: false })
    db.prepare("UPDATE order_activity_logs SET detail_json = 'not-json' WHERE order_id = ?").run(order.id)

    const result = getOrderLogs(order.id)
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].detail).toBeNull()
    expect(result.total).toBe(1)
  })

  it('TC-AL-02: 正常 detail_json 仍解析为对象（断言语义不降级）', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id)
    logActivity(order.id, 'payment', 'artist', { amountCents: 1000 })

    const result = getOrderLogs(order.id)
    expect(result.logs[0].detail).toEqual({ amountCents: 1000 })
  })
})
