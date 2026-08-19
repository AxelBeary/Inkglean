import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import type { ArtistRow } from './setup.js'
import { deliverOrder, deliverOrderWithoutFile } from '../src/features/order/order-gallery.service.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/** P2-F8: 在临时上传目录真实落盘交付文件，返回相对路径 */
function ensureDeliverable(artistId: number, relName: string) {
  const absDir = join(process.env.UPLOAD_DIR as string, 'deliverables', String(artistId))
  mkdirSync(absDir, { recursive: true })
  const abs = join(absDir, relName)
  writeFileSync(abs, 'p2-f8 test file')
  return `deliverables/${artistId}/${relName}`
}

/**
 * audit-a P2-1: 带文件交付状态迁移条件与无文件交付对齐
 */

describe('audit-a P2-1 带文件交付', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-P21-01: wip 订单带文件交付后状态为 delivered 且队列压缩', () => {
    const o1 = seedOrder(artist.id, { status: 'wip', order_no: 'P21-001', queue_position: 1 })
    seedOrder(artist.id, { status: 'wip', order_no: 'P21-002', queue_position: 2 })
    seedOrder(artist.id, { status: 'wip', order_no: 'P21-003', queue_position: 3 })
    const filePath = ensureDeliverable(artist.id, 'art.png')

    const result = deliverOrder(o1.id, filePath, 'art.png', 1024)
    expect(result.statusChanged).toBe(true)
    expect(result.order.status).toBe('delivered')
    expect(result.order.completed_at).not.toBeNull()

    // 队列压缩：剩余两个活跃单 position 1..2
    const positions = db.prepare(
      "SELECT order_no, queue_position FROM orders WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled') ORDER BY queue_position"
    ).all(artist.id) as Array<{ order_no: string; queue_position: number }>
    expect(positions.map(p => p.order_no)).toEqual(['P21-002', 'P21-003'])
    expect(positions.map(p => p.queue_position)).toEqual([1, 2])
  })

  it('TC-P21-02: delivered 订单重复传文件只加文件不迁状态', () => {
    const o1 = seedOrder(artist.id, { status: 'delivered', order_no: 'P21-010', queue_position: 1 })
    db.prepare("UPDATE orders SET completed_at = '2026-08-01 10:00:00' WHERE id = ?").run(o1.id)

    const first = deliverOrder(o1.id, ensureDeliverable(artist.id, 'a.png'), 'a.png', 100)
    expect(first.statusChanged).toBe(false)
    expect(first.order.status).toBe('delivered')
    expect(first.order.completed_at).toBe('2026-08-01 10:00:00')

    const second = deliverOrder(o1.id, ensureDeliverable(artist.id, 'b.png'), 'b.png', 200)
    expect(second.statusChanged).toBe(false)
    expect(second.order.status).toBe('delivered')
    const files = db.prepare('SELECT original_name FROM deliverables WHERE order_id = ? ORDER BY id').all(o1.id) as Array<{ original_name: string }>
    expect(files.map(f => f.original_name)).toEqual(['a.png', 'b.png'])
  })

  it('TC-P21-03: pending 订单带文件交付仍被状态机拒绝', () => {
    const o1 = seedOrder(artist.id, { status: 'pending' })
    expect(() => deliverOrder(o1.id, 'deliverables/1/x.png', 'x.png', 100)).toThrow('INVALID_TRANSITION')
  })

  it('TC-P21-04: 无文件交付回归——wip 直接 delivered', () => {
    const o1 = seedOrder(artist.id, { status: 'wip' })
    const result = deliverOrderWithoutFile(o1.id)
    expect(result.statusChanged).toBe(true)
    expect(result.order.status).toBe('delivered')
  })
})
