// P2-F10: addNote/deleteNote 备注与操作日志同事务
// 日志写入抛错 → 备注写入整体回滚；成功路径两条记录同时落库
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as activityLogService from '../src/features/order/activity-log.service.js'

vi.mock('../src/features/order/activity-log.service.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/features/order/activity-log.service.js')>()
  return { ...mod, logActivity: vi.fn(mod.logActivity) }
})

describe('P2-F10 备注事务', () => {
  beforeEach(() => {
    cleanDb()
    vi.mocked(activityLogService.logActivity).mockRestore()
  })

  it('TC-NTX-01: addNote 日志写失败 → 备注整体回滚', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id)

    vi.mocked(activityLogService.logActivity).mockImplementationOnce(() => {
      throw new Error('mock logActivity boom')
    })

    expect(() => orderService.addNote(order.id, '不会落库的备注', 'artist')).toThrow('mock logActivity boom')

    const notes = db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?').get(order.id) as { c: number }
    expect(notes.c).toBe(0)
    const logs = db.prepare('SELECT COUNT(*) AS c FROM order_activity_logs WHERE order_id = ?').get(order.id) as { c: number }
    expect(logs.c).toBe(0)
  })

  it('TC-NTX-02: addNote 成功路径备注 + 日志同时落库', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id)

    orderService.addNote(order.id, '正常备注', 'artist')

    const notes = db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?').get(order.id) as { c: number }
    expect(notes.c).toBe(1)
    const logs = db.prepare('SELECT COUNT(*) AS c FROM order_activity_logs WHERE order_id = ?').get(order.id) as { c: number }
    expect(logs.c).toBe(1)
  })

  it('TC-NTX-03: deleteNote 日志写失败 → 备注删除整体回滚', () => {
    const artist = seedArtist()
    const order = seedOrder(artist.id)
    orderService.addNote(order.id, '要删但删不掉的备注', 'artist')
    const noteId = (db.prepare('SELECT id FROM order_notes WHERE order_id = ?').get(order.id) as { id: number }).id

    vi.mocked(activityLogService.logActivity).mockImplementationOnce(() => {
      throw new Error('mock logActivity boom')
    })

    expect(() => orderService.deleteNote(order.id, noteId)).toThrow('mock logActivity boom')

    const notes = db.prepare('SELECT COUNT(*) AS c FROM order_notes WHERE order_id = ?').get(order.id) as { c: number }
    expect(notes.c).toBe(1)
  })
})
