import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { getArtistOrders } from '../src/features/order/order-read.js'

// ─────────────────────────────────────────────────────────
// v130: 订单列表排序（sort 白名单）
// 口径：缺省/非法值=时间倒序；time_asc=时间正序；priority=优先级高→低（同级时间倒序）
// ─────────────────────────────────────────────────────────

describe('v130 订单列表排序 (getArtistOrders sort)', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88030', subdomain: 'sorttest' })
    // 三单：时间错开（显式改写 created_at 保证序），优先级各不同
    seedOrder(artist.id, { order_no: 'SORT-001', priority: 'low' })
    seedOrder(artist.id, { order_no: 'SORT-002', priority: 'high' })
    seedOrder(artist.id, { order_no: 'SORT-003', priority: 'medium' })
    db.prepare("UPDATE orders SET created_at = '2026-01-01 10:00:00' WHERE order_no = 'SORT-001'").run()
    db.prepare("UPDATE orders SET created_at = '2026-01-02 10:00:00' WHERE order_no = 'SORT-002'").run()
    db.prepare("UPDATE orders SET created_at = '2026-01-03 10:00:00' WHERE order_no = 'SORT-003'").run()
  })

  const nos = (sort?: string): string[] => getArtistOrders(artist.id, undefined, sort ? { sort } : {}).items.map(o => o.order_no)

  it('TC-SORT-01: 缺省与非法值均回落时间倒序', () => {
    expect(nos(undefined)).toEqual(['SORT-003', 'SORT-002', 'SORT-001'])
    expect(nos('DROP TABLE orders')).toEqual(['SORT-003', 'SORT-002', 'SORT-001'])
  })

  it('TC-SORT-02: time_asc 时间正序', () => {
    expect(nos('time_asc')).toEqual(['SORT-001', 'SORT-002', 'SORT-003'])
  })

  it('TC-SORT-03: priority 高→低（high/medium/low）', () => {
    expect(nos('priority')).toEqual(['SORT-002', 'SORT-003', 'SORT-001'])
  })
})
