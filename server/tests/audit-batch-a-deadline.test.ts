import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'

/**
 * audit-a P2-2: 截稿日/开工日交叉校验时区错位
 * 用例全部用本地 Date 构造（new Date(y, m, d, h)），在任何运行机时区下语义确定：
 * localDate(date) 必然等于我们指定的本地日历日，不依赖 UTC+8 这一具体时区。
 */

function localDateStr(date: Date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

describe('audit-a P2-2 截稿日交叉校验', () => {
  let artist: ArtistRow
  let order: ReturnType<typeof orderService.createOrder>

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
    order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
  })

  it('TC-P22-01: 本地明日凌晨截稿日对本地今日开工日通过（修复 UTC 前缀误拒）', () => {
    const now = new Date()
    // 本地明日 02:00（正时区下 UTC 仍是今日 → 旧实现拿 UTC 前缀比会误拒）
    const localTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0)
    db.prepare('UPDATE orders SET start_date = ? WHERE id = ?').run(localDateStr(now), order.id)

    const updated = orderService.updateDeadline(order.id, localTomorrow.toISOString())
    // 存储仍走 UTC（toSqliteDate 不变）
    expect(updated.deadline).toBe(localTomorrow.toISOString().slice(0, 19).replace('T', ' '))
  })

  it('TC-P22-02: 真早于开工日的截稿日仍拒绝', () => {
    const now = new Date()
    // 本地今日中午（绝对早于本地明日开工日）
    const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
    db.prepare('UPDATE orders SET start_date = ? WHERE id = ?').run(localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)), order.id)

    expect(() => orderService.updateDeadline(order.id, localToday.toISOString())).toThrow('INVALID_DEADLINE')
  })

  it('TC-P22-03: updateStartDate 对称校验——本地明日开工日对本地明日凌晨截稿日通过', () => {
    const now = new Date()
    const localTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0)
    // 先设截稿日（存储 UTC，本地日为明日）
    orderService.updateDeadline(order.id, localTomorrow.toISOString())

    const updated = orderService.updateStartDate(order.id, localDateStr(localTomorrow))
    expect(updated.start_date).toBe(localDateStr(localTomorrow))
  })

  it('TC-P22-04: updateStartDate 对称校验——晚于截稿日本地日的开工日仍拒绝', () => {
    const now = new Date()
    const localTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0)
    orderService.updateDeadline(order.id, localTomorrow.toISOString())
    const twoDaysLater = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)

    expect(() => orderService.updateStartDate(order.id, localDateStr(twoDaysLater))).toThrow('INVALID_START_DATE')
  })

  it('TC-P22-05: d3 P2——updateDeadline 拒绝越界 ISO 日与非 ISO 串（不再静默归一化）', () => {
    expect(() => orderService.updateDeadline(order.id, '2026-02-31T00:00:00Z')).toThrow('INVALID_DEADLINE')
    expect(() => orderService.updateDeadline(order.id, '31 Feb 2026')).toThrow('INVALID_DEADLINE')
    expect(() => orderService.updateDeadline(order.id, '2026/02/31')).toThrow('INVALID_DEADLINE')
  })

  it('TC-P22-06: d3 P2——updateStartDate 拒绝 2026-02-31（历法回读）', () => {
    expect(() => orderService.updateStartDate(order.id, '2026-02-31')).toThrow('INVALID_DEADLINE')
  })
})
