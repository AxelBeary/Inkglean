// 审计 #21 条目 1：交付时未收尾款的留痕
// 收款侧 P2-F9（delivered 拒正数收款）+ 状态机 delivered:[] 无后继 → 交付即封死尾款入账，
// 故服务层必须在备注时间线写下未收金额；已付清/未定价订单不留痕，重复交付不重复刷备注。
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow } from './setup.js'
import { deliverOrder, deliverOrderWithoutFile } from '../src/features/order/order-gallery.service.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

function ensureDeliverable(artistId: number, relName: string) {
  const absDir = join(process.env.UPLOAD_DIR as string, 'deliverables', String(artistId))
  mkdirSync(absDir, { recursive: true })
  writeFileSync(join(absDir, relName), 'deliver-unpaid-balance')
  return `deliverables/${artistId}/${relName}`
}

function unpaidNotes(orderId: number) {
  return db
    .prepare("SELECT content FROM order_notes WHERE order_id = ? AND created_by = 'system' AND content LIKE '⚠️%'")
    .all(orderId) as Array<{ content: string }>
}

describe('交付未收尾款留痕（#21-1）', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '89101', subdomain: 'unpaid-deliver' })
  })

  it('有余额时交付：写入未收金额备注（终价−已收）', () => {
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 50000, paid_total_cents = 30000 WHERE id = ?').run(order.id)

    const filePath = ensureDeliverable(artist.id, 'unpaid-a.png')
    const result = deliverOrder(order.id, filePath, 'unpaid-a.png', 10)

    expect(result.statusChanged).toBe(true)
    const notes = unpaidNotes(order.id)
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toContain('¥200.00')
  })

  it('已付清后交付：不写留痕备注', () => {
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 20000, paid_total_cents = 20000 WHERE id = ?').run(order.id)

    const filePath = ensureDeliverable(artist.id, 'paid-b.png')
    deliverOrder(order.id, filePath, 'paid-b.png', 10)

    expect(unpaidNotes(order.id)).toHaveLength(0)
  })

  it('超付（已收 > 终价）交付：不写留痕备注', () => {
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 10000, paid_total_cents = 15000 WHERE id = ?').run(order.id)

    const filePath = ensureDeliverable(artist.id, 'over-c.png')
    deliverOrder(order.id, filePath, 'over-c.png', 10)

    expect(unpaidNotes(order.id)).toHaveLength(0)
  })

  it('未定价订单交付：无应付口径，不写留痕备注', () => {
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = NULL, total_price_cents = NULL, price_snapshot = NULL WHERE id = ?').run(order.id)

    const filePath = ensureDeliverable(artist.id, 'no-price-d.png')
    deliverOrder(order.id, filePath, 'no-price-d.png', 10)

    expect(unpaidNotes(order.id)).toHaveLength(0)
  })

  it('无文件交付有余额：在 📦 备注之后追加留痕', () => {
    const order = seedOrder(artist.id, { status: 'wip' })
    db.prepare('UPDATE orders SET final_price_cents = 30000, paid_total_cents = 0 WHERE id = ?').run(order.id)

    const result = deliverOrderWithoutFile(order.id)

    expect(result.statusChanged).toBe(true)
    const notes = db
      .prepare("SELECT content FROM order_notes WHERE order_id = ? AND created_by = 'system' ORDER BY id ASC")
      .all(order.id) as Array<{ content: string }>
    expect(notes.map(n => n.content.startsWith('📦') ? 'box' : 'warn')).toEqual(['box', 'warn'])
    expect(unpaidNotes(order.id)[0].content).toContain('¥300.00')
  })

  it('重复交付（已 delivered）：留痕备注不二次累积', () => {
    const order = seedOrder(artist.id, { status: 'done' })
    db.prepare('UPDATE orders SET final_price_cents = 50000, paid_total_cents = 10000 WHERE id = ?').run(order.id)

    const filePath = ensureDeliverable(artist.id, 'dup-e.png')
    deliverOrder(order.id, filePath, 'dup-e.png', 10)
    const again = deliverOrder(order.id, filePath, 'dup-e.png', 10)

    expect(again.statusChanged).toBe(false)
    expect(unpaidNotes(order.id)).toHaveLength(1)

    const noFileAgain = deliverOrderWithoutFile(order.id)
    expect(noFileAgain.statusChanged).toBe(false)
    expect(unpaidNotes(order.id)).toHaveLength(1)
  })
})
