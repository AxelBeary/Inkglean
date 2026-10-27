// ============================================
// 815 拍板 #4：交付文件一次性下载回归
// ①start 签发 ②confirm 锁定+IP 留痕 ③锁定后 410 ④半途 3 次 → 5 分钟冷却（可重试），累计 9 次彻底锁定
// ⑤60 秒下载器兜底锁定 ⑥画师再许可解锁（留痕，历史 IP 保留）
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'

interface DeliverableRow {
  id: number
  last_started_at: number | null
  download_locked: number
  download_ip: string | null
  downloaded_at: number | null
  download_attempts: number
  download_fail_total: number
  cooldown_until: number | null
}

describe('交付文件一次性下载（815 拍板 #4）', () => {
  let artist: ArtistRow
  let order: SeededOrder
  let fileId: number

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
    order = seedOrder(artist.id, { order_no: 'DL-001', status: 'done' })
    orderGalleryService.addDeliverable(order.id, `deliverables/${artist.id}/final.png`, 'final.png', 1024)
    fileId = (db.prepare('SELECT id FROM deliverables WHERE order_id = ?').get(order.id) as { id: number }).id
  })

  const row = (): DeliverableRow => db.prepare('SELECT * FROM deliverables WHERE id = ?').get(fileId) as DeliverableRow
  const noteCount = (frag: string): number =>
    (db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ? AND content LIKE ?').get(order.id, `%${frag}%`) as { c: number }).c

  it('TC-DL-01: start 签发路径；confirm 锁定 + IP 留痕', () => {
    const { filePath } = orderGalleryService.startDeliverableDownload(order.id, fileId)
    expect(filePath).toBe(`deliverables/${artist.id}/final.png`)
    expect(row().last_started_at).toBeTruthy()

    orderGalleryService.confirmDeliverableDownload(order.id, fileId, '203.0.113.9')
    const after = row()
    expect(after.download_locked).toBe(1)
    expect(after.download_ip).toBe('203.0.113.9')
    expect(after.downloaded_at).toBeTruthy()
    expect(after.last_started_at).toBeNull()
    expect(noteCount('已完成下载并锁定')).toBe(1)
  })

  it('TC-DL-02: 锁定后再 start → 410 DOWNLOAD_LOCKED', () => {
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    orderGalleryService.confirmDeliverableDownload(order.id, fileId, '203.0.113.9')

    expect(() => orderGalleryService.startDeliverableDownload(order.id, fileId)).toThrow('DOWNLOAD_LOCKED')
  })

  it('TC-DL-03: 半途下载 3 次 → 5 分钟冷却（可重试），不再永久锁', () => {
    // 第 1 次 start 正常；之后每次 start 结算上次为半途尝试
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    orderGalleryService.startDeliverableDownload(order.id, fileId) // attempts=1
    orderGalleryService.startDeliverableDownload(order.id, fileId) // attempts=2
    expect(row().download_attempts).toBe(2)

    // 第 4 次 start → attempts=3 触发冷却（不写 download_locked）
    expect(() => orderGalleryService.startDeliverableDownload(order.id, fileId)).toThrow('DOWNLOAD_COOLDOWN')
    const after = row()
    expect(after.download_locked).toBe(0)
    expect(after.cooldown_until).toBeGreaterThan(Date.now())
    expect(after.download_attempts).toBe(0) // 本段计数清零
    expect(after.download_fail_total).toBe(3) // 累计保留
    expect(noteCount('已暂停 5 分钟')).toBe(1)

    // 冷却到期后可再试（不再需要画师再许可）
    db.prepare('UPDATE deliverables SET cooldown_until = ? WHERE id = ?').run(Date.now() - 1, fileId)
    expect(orderGalleryService.startDeliverableDownload(order.id, fileId).filePath).toBeTruthy()
  })

  it('TC-DL-07: 累计 9 次半途 → 彻底锁定（防故意刷）', () => {
    // 模拟已走完两轮冷却、累计 8 次后的第三次半途
    db.prepare('UPDATE deliverables SET download_attempts = 2, download_fail_total = 8, last_started_at = ? WHERE id = ?')
      .run(Date.now(), fileId)

    expect(() => orderGalleryService.startDeliverableDownload(order.id, fileId)).toThrow('DOWNLOAD_LOCKED')
    const after = row()
    expect(after.download_locked).toBe(1)
    expect(after.download_fail_total).toBe(9)
    expect(noteCount('已彻底锁定')).toBe(1)
  })

  it('TC-DL-08: 画师再许可同时清零累计失败数', () => {
    db.prepare('UPDATE deliverables SET download_locked = 1, download_attempts = 2, download_fail_total = 9 WHERE id = ?')
      .run(fileId)

    orderGalleryService.repermitDeliverable(order.id, fileId)
    const after = row()
    expect(after.download_fail_total).toBe(0)
    expect(after.download_attempts).toBe(0)
    expect(orderGalleryService.startDeliverableDownload(order.id, fileId).filePath).toBeTruthy()
  })

  it('TC-DL-04: 60 秒兜底——上次开始超窗未确认，下次 start 视为下载器已完成 → 锁定', () => {
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    // 把开始时间拨到 61 秒前
    db.prepare('UPDATE deliverables SET last_started_at = ? WHERE id = ?').run(Date.now() - 61_000, fileId)

    expect(() => orderGalleryService.startDeliverableDownload(order.id, fileId)).toThrow('DOWNLOAD_LOCKED')
    expect(row().download_locked).toBe(1)
    expect(noteCount('下载窗口已过')).toBe(1)
  })

  it('TC-DL-05: 画师再许可解锁（留痕，历史 IP 保留）', () => {
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    orderGalleryService.confirmDeliverableDownload(order.id, fileId, '203.0.113.9')

    orderGalleryService.repermitDeliverable(order.id, fileId)
    const after = row()
    expect(after.download_locked).toBe(0)
    expect(after.download_attempts).toBe(0)
    expect(after.cooldown_until).toBeNull()
    // 取证链不断：历史下载记录保留
    expect(after.download_ip).toBe('203.0.113.9')
    expect(after.downloaded_at).toBeTruthy()
    expect(noteCount('画师已再许可')).toBe(1)

    // 再许可后可重新下载
    expect(orderGalleryService.startDeliverableDownload(order.id, fileId).filePath).toBeTruthy()
  })

  it('TC-DL-06: 非本订单文件 → 404（归属校验）', () => {
    const otherOrder = seedOrder(artist.id, { order_no: 'DL-002', status: 'done' })
    expect(() => orderGalleryService.startDeliverableDownload(otherOrder.id, fileId)).toThrow('ORDER_NOT_FOUND')
  })
})
