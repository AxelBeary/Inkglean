import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'

/**
 * audit-a 批：R-7 队列分区重排 / R-10 下单总价封顶 / R-12 订单号解析边角
 */

function seedOrder(artistId, overrides = {}) {
  const defaults = {
    order_no: `A-${Math.floor(Math.random() * 1e9)}`,
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

describe('audit-a R-7 queue_position 分区重排', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88060', subdomain: 'r7artist' })
  })

  it('TC-R7-01: compactQueue 后 formal/buffer 两区各自 1..n 无重复', () => {
    seedOrder(artist.id, { order_no: 'F1', queue_zone: 'formal', queue_position: 3, status: 'wip' })
    seedOrder(artist.id, { order_no: 'F2', queue_zone: 'formal', queue_position: 1, status: 'wip' })
    seedOrder(artist.id, { order_no: 'B1', queue_zone: 'buffer', queue_position: 5, status: 'pending' })
    seedOrder(artist.id, { order_no: 'B2', queue_zone: 'buffer', queue_position: 2, status: 'pending' })

    orderService.compactQueue(artist.id)

    const formal = db.prepare("SELECT order_no, queue_position FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered','cancelled') ORDER BY queue_position").all(artist.id)
    const buffer = db.prepare("SELECT order_no, queue_position FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered','cancelled') ORDER BY queue_position").all(artist.id)
    expect(formal.map(r => r.queue_position)).toEqual([1, 2])
    expect(buffer.map(r => r.queue_position)).toEqual([1, 2])
    expect(new Set(formal.map(r => r.queue_position)).size).toBe(formal.length)
    expect(new Set(buffer.map(r => r.queue_position)).size).toBe(buffer.length)
  })

  it('TC-R7-02: promoteOrder 递补后位置号落在 formal 区末尾且不与任何 formal 单重复', () => {
    seedArtistStages(artist.id)
    const f1 = seedOrder(artist.id, { order_no: 'F-1', queue_zone: 'formal', queue_position: 1, status: 'wip' })
    const f2 = seedOrder(artist.id, { order_no: 'F-2', queue_zone: 'formal', queue_position: 2, status: 'wip' })
    const b1 = seedOrder(artist.id, { order_no: 'B-1', queue_zone: 'buffer', queue_position: 1, status: 'pending' })
    const b2 = seedOrder(artist.id, { order_no: 'B-2', queue_zone: 'buffer', queue_position: 2, status: 'pending' })

    orderService.promoteOrder(b1.id)

    const formal = db.prepare("SELECT order_no, queue_position FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered','cancelled') ORDER BY queue_position").all(artist.id)
    expect(formal.map(r => r.order_no)).toEqual(['F-1', 'F-2', 'B-1'])
    expect(formal.map(r => r.queue_position)).toEqual([1, 2, 3])
    expect(new Set(formal.map(r => r.queue_position)).size).toBe(3)
    // buffer 区保持自身编号（promote 不压缩 buffer 区，b2 原位置 2 不变）
    const bufferPos = db.prepare('SELECT queue_position FROM orders WHERE id = ?').get(b2.id)
    expect(bufferPos.queue_position).toBe(2)
    expect(f1.id).not.toBe(b1.id)
    expect(f2.id).not.toBe(b1.id)
  })

  it('TC-R7-03: 客户排队位置按订单自身分区计算（formal 不被 buffer 干扰）', () => {
    seedOrder(artist.id, { order_no: 'Q-F1', queue_zone: 'formal', queue_position: 1, status: 'wip', client_qq: '66001' })
    seedOrder(artist.id, { order_no: 'Q-F2', queue_zone: 'formal', queue_position: 2, status: 'wip', client_qq: '66002' })
    seedOrder(artist.id, { order_no: 'Q-B1', queue_zone: 'buffer', queue_position: 1, status: 'pending', client_qq: '66003' })
    seedOrder(artist.id, { order_no: 'Q-B2', queue_zone: 'buffer', queue_position: 2, status: 'pending', client_qq: '66004' })

    const result = orderService.getClientQueuePosition('Q-F2', '66002')
    expect(result.position).toBe(2)
    expect(result.total).toBe(2)
  })
})

describe('audit-a R-10 createOrder 总价封顶', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88061', subdomain: 'r10artist' })
  })

  function seedStyleAndSize(basePrice) {
    db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artist.id)
    const style = db.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artist.id)
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, 1)').run(style.id, '超大', basePrice)
    return db.prepare('SELECT * FROM style_sizes WHERE art_style_id = ?').get(style.id)
  }

  /** 直插超界百分比增项（模拟绕过校验的脏模板/存量数据），pct=999999、quantity=999 */
  function seedOverflowAddon(styleId) {
    const tpl = db.prepare(`
      INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, category, max_quantity)
      VALUES (?, '极端百分比', 'quantity', 'percent', 999999, 'add', 999)
    `).run(artist.id)
    db.prepare(`
      INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled, tpl_name, tpl_control_type, tpl_price_mode, tpl_default_price, tpl_category, tpl_max_quantity)
      VALUES (?, ?, 1, '极端百分比', 'quantity', 'percent', 999999, 'add', 999)
    `).run(styleId, Number(tpl.lastInsertRowid))
    return db.prepare('SELECT id FROM style_addons WHERE art_style_id = ?').get(styleId)
  }

  it('TC-R10-01: 溢出组合被拒（INVALID_PRICE 且不落库）', () => {
    const size = seedStyleAndSize(999999)
    const addon = seedOverflowAddon(size.art_style_id, 999)

    expect(() => orderService.createOrder({
      artistId: artist.id,
      clientQq: '111',
      styleSizeId: size.id,
      styleAddons: [{ styleAddonId: addon.id, quantity: 999 }]
    })).toThrow('INVALID_PRICE')

    expect(db.prepare('SELECT COUNT(*) AS c FROM orders WHERE artist_id = ?').get(artist.id).c).toBe(0)
  })

  it('TC-R10-02: 常规大额（10 万元单）不受影响', () => {
    const size = seedStyleAndSize(100000)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111', styleSizeId: size.id })
    expect(order.total_price_cents).toBe(10_000_000)
  })

  it('TC-R10-03: 接近封顶的合法组合仍放行（999999 元基础价）', () => {
    const size = seedStyleAndSize(999999)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111', styleSizeId: size.id })
    expect(order.total_price_cents).toBe(99_999_900)
  })
})

describe('audit-a R-12 订单号解析边角', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88062', subdomain: 'alice' })
  })

  it('TC-R12-01: 上一单后缀非数字 → 下一序号按 1 处理，不抛错', () => {
    db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position)
      VALUES ('ALICE-abc', ?, '000', 'medium', 'delivered', 'self', 1)
    `).run(artist.id)

    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.order_no).toBe('ALICE-001')
  })

  it('TC-R12-02: 超长数字后缀（parseInt → Infinity）→ 按 0 处理，不生成 Infinity 订单号', () => {
    db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position)
      VALUES (?, ?, '000', 'medium', 'delivered', 'self', 1)
    `).run(`ALICE-${'9'.repeat(400)}`, artist.id)

    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.order_no).toBe('ALICE-001')
  })
})
