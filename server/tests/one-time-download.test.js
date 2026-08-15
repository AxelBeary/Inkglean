// ============================================
// 815 拍板 #4：交付文件一次性下载回归
// ①start 签发 ②confirm 锁定+IP 留痕 ③锁定后 410 ④半途 3 次防护锁定+冷却
// ⑤60 秒下载器兜底锁定 ⑥画师再许可解锁（留痕，历史 IP 保留）
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderGalleryService from '../src/features/order/order-gallery.service.js'

describe('交付文件一次性下载（815 拍板 #4）', () => {
  let artist
  let order
  let fileId

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
    order = seedOrder(artist.id, { order_no: 'DL-001', status: 'done' })
    orderGalleryService.addDeliverable(order.id, `deliverables/${artist.id}/final.png`, 'final.png', 1024)
    fileId = db.prepare('SELECT id FROM deliverables WHERE order_id = ?').get(order.id).id
  })

  const row = () => db.prepare('SELECT * FROM deliverables WHERE id = ?').get(fileId)
  const noteCount = (frag) =>
    db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ? AND content LIKE ?').get(order.id, `%${frag}%`).c

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

  it('TC-DL-03: 半途下载 3 次 → 防护锁定 + 冷却 + 留痕', () => {
    // 第 1 次 start 正常；之后每次 start 结算上次为半途尝试
    orderGalleryService.startDeliverableDownload(order.id, fileId)
    orderGalleryService.startDeliverableDownload(order.id, fileId) // attempts=1
    orderGalleryService.startDeliverableDownload(order.id, fileId) // attempts=2
    expect(row().download_attempts).toBe(2)

    // 第 4 次 start → attempts=3 触发防护锁定
    expect(() => orderGalleryService.startDeliverableDownload(order.id, fileId)).toThrow('DOWNLOAD_LOCKED')
    const after = row()
    expect(after.download_locked).toBe(1)
    expect(after.cooldown_until).toBeGreaterThan(Date.now())
    expect(noteCount('未完成下载')).toBe(1)

    // 冷却期内即使解锁标记也被 423 拦（此处直接验证 cooldown 字段生效路径）
    db.prepare('UPDATE deliverables SET download_locked = 0 WHERE id = ?').run(fileId)
    expect(() => orderGalleryService.startDeliverableDownload(order.id, fileId)).toThrow('DOWNLOAD_COOLDOWN')
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
