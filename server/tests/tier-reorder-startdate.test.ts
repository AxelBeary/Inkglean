import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, type ArtistRow, type OrderRow } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'

// ============================================
// v0.26 B: 开工日
// （v0.26 A 档位拖拽排序已随 SPEC-PRICE-2 v50 退役：price_tiers 表清退）
// ============================================

describe('开工日 (Start Date, v0.26 B)', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  function seedOrder(): OrderRow {
    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_position, queue_zone)
      VALUES (?, ?, '99999', 'pending', 1, 'formal')
    `).run(`SD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, artist.id)
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid) as OrderRow
  }

  it('TC-SD-01: updateStartDate 设置开工日', () => {
    const order = seedOrder()
    const updated = orderService.updateStartDate(order.id, '2026-08-15')
    expect(updated.start_date).toBe('2026-08-15')
  })

  it('TC-SD-02: updateStartDate 清除开工日', () => {
    const order = seedOrder()
    orderService.updateStartDate(order.id, '2026-08-15')
    const updated = orderService.updateStartDate(order.id, null)
    expect(updated.start_date).toBeNull()
  })

  it('TC-SD-03: 非法格式抛错', () => {
    const order = seedOrder()
    expect(() => orderService.updateStartDate(order.id, 'not-a-date')).toThrow()
    expect(() => orderService.updateStartDate(order.id, '2026/08/15')).toThrow()
  })

  it('TC-SD-04: 不存在的订单抛错', () => {
    expect(() => orderService.updateStartDate(99999, '2026-08-15')).toThrow('ORDER_NOT_FOUND')
  })

  it('TC-SD-05: 迁移 v29 幂等（start_date 列存在）', () => {
    const cols = db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>
    const col = cols.find(c => c.name === 'start_date')
    expect(col).toBeDefined()
    // 新订单 start_date 默认 NULL
    const order = seedOrder()
    expect(order.start_date).toBeNull()
  })

  it('TC-SD-06: getOrder 返回尺寸工期（tier_work_days 字段名过渡保留）', () => {
    db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artist.id)
    const style = db.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artist.id) as { id: number }
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, work_days, sort_order) VALUES (?, ?, 200, 14, 0)').run(style.id, '全身')
    const size = db.prepare('SELECT id FROM style_sizes WHERE art_style_id = ?').get(style.id) as { id: number }
    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, style_size_id, status, queue_position, queue_zone)
      VALUES (?, ?, '99999', ?, 'pending', 1, 'formal')
    `).run(`SD-WD-${Date.now()}`, artist.id, size.id)
    const order = orderService.getOrder(Number(result.lastInsertRowid))!
    expect(order.tier_work_days).toBe(14)
  })
})
