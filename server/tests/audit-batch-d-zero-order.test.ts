import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import { createDiscountCode } from '../src/features/pricing/discount.service.js'

/**
 * 审计批 D-3（R-11）：零元订单显式化
 * 允许零元单但显式标记：写入系统备注，不改状态机
 */

function seedStyleSize(artistId: number, price: number) {
  db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artistId)
  const style = db.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artistId) as { id: number }
  db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, 0)').run(style.id, '头像', price)
  return db.prepare('SELECT * FROM style_sizes WHERE art_style_id = ?').get(style.id) as { id: number; art_style_id: number }
}

describe('审计批 D-3 零元订单显式化', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88300', subdomain: 'd3artist' })
  })

  it('TC-D3-01: base_price=0 订单创建成功 + 系统备注「0 元订单：无需收款」', () => {
    const size = seedStyleSize(artist.id, 0)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456', styleSizeId: size.id })

    expect(order.total_price_cents).toBe(0)
    expect(order.order_no).toBeTruthy()
    const note = (order.notes as unknown as Array<{ created_by: string; content: string }>).find(n => n.created_by === 'system' && n.content === '0 元订单：无需收款')
    expect(note).toBeTruthy()
  })

  it('TC-D3-02: 100% 折扣订单同样显式标记（折扣后最终总价为 0）', () => {
    const size = seedStyleSize(artist.id, 5000)
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    createDiscountCode(artist.id, { code: 'FREE100', discountType: 'percent', discountValue: 100 })

    const order = orderService.createOrder({
      artistId: artist.id,
      clientQq: '123456',
      styleSizeId: size.id,
      discountCode: 'FREE100'
    })
    expect(order.total_price_cents).toBe(0)
    const note = (order.notes as unknown as Array<{ created_by: string; content: string }>).find(n => n.created_by === 'system' && n.content === '0 元订单：无需收款')
    expect(note).toBeTruthy()
  })

  it('TC-D3-03: 零元单可正常推进交付（状态机不受影响）', () => {
    const size = seedStyleSize(artist.id, 0)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456', styleSizeId: size.id })
    orderService.updateOrderStatus(order.id, 'confirmed')
    orderService.updateOrderStatus(order.id, 'wip')
    orderService.updateOrderStatus(order.id, 'done')
    const delivered = orderService.updateOrderStatus(order.id, 'delivered')
    expect(delivered.status).toBe('delivered')
  })

  it('TC-D3-04: 非零订单不写零元备注', () => {
    const size = seedStyleSize(artist.id, 200)
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '123456', styleSizeId: size.id })
    expect(order.total_price_cents).toBe(20000)
    expect((order.notes as unknown as Array<{ content: string }>).some(n => n.content === '0 元订单：无需收款')).toBe(false)
  })
})
