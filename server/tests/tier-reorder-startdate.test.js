import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as artistService from '../src/features/artist/artist.service.js'
import * as orderService from '../src/features/order/order.service.js'

// ============================================
// v0.26 A: 档位拖拽排序 + v0.26 B: 开工日
// ============================================

describe('档位排序 (Tier Reorder, v0.26 A)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  function addTier(name, price) {
    return artistService.createTier(artist.id, { name, price })
  }

  it('TC-TR-01: reorderTiers 正常排序', () => {
    const t1 = addTier('头像', 50)
    const t2 = addTier('半身', 100)
    const t3 = addTier('全身', 200)

    // 反转顺序
    const result = artistService.reorderTiers(artist.id, [t3.id, t2.id, t1.id])
    expect(result[0].id).toBe(t3.id)
    expect(result[1].id).toBe(t2.id)
    expect(result[2].id).toBe(t1.id)
    // sort_order 验证
    expect(result[0].sort_order).toBe(1)
    expect(result[2].sort_order).toBe(3)
  })

  it('TC-TR-02: 排序后 getTiers 返回新顺序', () => {
    const t1 = addTier('A', 10)
    const t2 = addTier('B', 20)
    artistService.reorderTiers(artist.id, [t2.id, t1.id])
    const list = artistService.getTiers(artist.id)
    expect(list[0].id).toBe(t2.id)
    expect(list[1].id).toBe(t1.id)
  })

  it('TC-TR-03: 长度不匹配抛错', () => {
    addTier('A', 10)
    addTier('B', 20)
    expect(() => artistService.reorderTiers(artist.id, [1])).toThrow('REORDER_LENGTH')
  })

  it('TC-TR-04: 包含他人档位抛错', () => {
    const other = seedArtist({ qq_number: '77002', subdomain: 'bob', artist_code: 'BOB' })
    const t1 = addTier('A', 10)
    addTier('B', 20)
    const tOther = artistService.createTier(other.id, { name: 'X', price: 99 })
    // 长度匹配（2 个），但含他人 ID
    expect(() => artistService.reorderTiers(artist.id, [t1.id, tOther.id])).toThrow('REORDER_INVALID')
  })

  it('TC-TR-05: 重复 ID 抛错', () => {
    const t1 = addTier('A', 10)
    addTier('B', 20)
    expect(() => artistService.reorderTiers(artist.id, [t1.id, t1.id])).toThrow('REORDER_DUPLICATE')
  })

  it('TC-TR-06: 幂等——相同顺序不变', () => {
    const t1 = addTier('A', 10)
    const t2 = addTier('B', 20)
    const result = artistService.reorderTiers(artist.id, [t1.id, t2.id])
    expect(result[0].id).toBe(t1.id)
    expect(result[1].id).toBe(t2.id)
  })
})

describe('开工日 (Start Date, v0.26 B)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  function seedOrder(overrides = {}) {
    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, status, queue_position, queue_zone)
      VALUES (?, ?, '99999', 'pending', 1, 'formal')
    `).run(`SD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, artist.id)
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid)
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
    const cols = db.prepare('PRAGMA table_info(orders)').all()
    const col = cols.find(c => c.name === 'start_date')
    expect(col).toBeDefined()
    // 新订单 start_date 默认 NULL
    const order = seedOrder()
    expect(order.start_date).toBeNull()
  })

  it('TC-SD-06: getOrder 返回 tier_work_days', () => {
    const tier = artistService.createTier(artist.id, { name: '全身', price: 200, workDays: 14 })
    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, tier_id, status, queue_position, queue_zone)
      VALUES (?, ?, '99999', ?, 'pending', 1, 'formal')
    `).run(`SD-WD-${Date.now()}`, artist.id, tier.id)
    const order = orderService.getOrder(Number(result.lastInsertRowid))
    expect(order.tier_work_days).toBe(14)
  })
})
