import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import * as dashboard from '../src/features/artist/dashboard.service.js'

// ============================================
// 仪表盘 API 测试（v0.18 第二批）
// 收入统计 + 合并待办 + 活动流
// ============================================

/** 设置订单为已完成并指定 completed_at */
function completeOrder(orderId, completedAt, finalPriceCents = 10000) {
  db.prepare("UPDATE orders SET status = 'done', completed_at = ?, final_price_cents = ? WHERE id = ?")
    .run(completedAt, finalPriceCents, orderId)
}

/** 添加订单备注 */
function addNote(orderId, content, createdAt) {
  db.prepare('INSERT INTO order_notes (order_id, content, created_by, created_at) VALUES (?, ?, ?, ?)')
    .run(orderId, content, 'artist', createdAt)
}

describe('收入统计 (getRevenue)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-01: 月维度——有完成订单返回柱状图+汇总', () => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const completedAt = `${now.getFullYear()}-${month}-${day} 10:00:00`

    const o1 = seedOrder(artist.id, { order_no: 'T-001' })
    completeOrder(o1.id, completedAt, 50000)

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.period).toBe('month')
    expect(result.bars.length).toBeGreaterThanOrEqual(28)
    expect(result.summary.totalCents).toBe(50000)
    expect(result.summary.completedCount).toBe(1)
  })

  it('TC-DASH-02: 月维度——无完成订单返回全0', () => {
    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.totalCents).toBe(0)
    expect(result.summary.completedCount).toBe(0)
    expect(result.bars.every(b => b.cents === 0)).toBe(true)
  })

  it('TC-DASH-03: 年维度——按月聚合12个柱', () => {
    const now = new Date()
    const o1 = seedOrder(artist.id, { order_no: 'T-002' })
    completeOrder(o1.id, `${now.getFullYear()}-03-15 12:00:00`, 30000)

    const result = dashboard.getRevenue(artist.id, 'year')
    expect(result.period).toBe('year')
    expect(result.bars).toHaveLength(12)
    expect(result.bars[2].cents).toBe(30000) // 3月
    expect(result.summary.totalCents).toBe(30000)
  })

  it('TC-DASH-04: 季维度——按周聚合13个柱', () => {
    const now = new Date()
    const quarter = Math.floor(now.getMonth() / 3)
    const qMonth = quarter * 3 + 1
    const o1 = seedOrder(artist.id, { order_no: 'T-003' })
    completeOrder(o1.id, `${now.getFullYear()}-${String(qMonth).padStart(2, '0')}-05 08:00:00`, 20000)

    const result = dashboard.getRevenue(artist.id, 'quarter')
    expect(result.period).toBe('quarter')
    expect(result.bars).toHaveLength(13)
    expect(result.summary.totalCents).toBe(20000)
  })

  it('TC-DASH-05: 环比——有上期数据返回百分比', () => {
    const now = new Date()
    // 上月订单
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const o1 = seedOrder(artist.id, { order_no: 'T-004' })
    completeOrder(o1.id, `${prevYear}-${String(prevMonth).padStart(2, '0')}-15 10:00:00`, 40000)

    // 本月订单
    const curMonth = String(now.getMonth() + 1).padStart(2, '0')
    const o2 = seedOrder(artist.id, { order_no: 'T-005' })
    completeOrder(o2.id, `${now.getFullYear()}-${curMonth}-10 10:00:00`, 60000)

    const result = dashboard.getRevenue(artist.id, 'month')
    // 60000 vs 40000 → +50%
    expect(result.summary.changePercent).toBe(50)
  })

  it('TC-DASH-06: 环比——无上期数据返回null', () => {
    const now = new Date()
    const curMonth = String(now.getMonth() + 1).padStart(2, '0')
    const o1 = seedOrder(artist.id, { order_no: 'T-006' })
    completeOrder(o1.id, `${now.getFullYear()}-${curMonth}-10 10:00:00`, 10000)

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.changePercent).toBeNull()
  })

  it('TC-DASH-07: 金额回退链——无 final_price 用 total_price', () => {
    const now = new Date()
    const curMonth = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const o1 = seedOrder(artist.id, { order_no: 'T-007' })
    db.prepare("UPDATE orders SET status = 'done', completed_at = ?, final_price_cents = NULL, total_price_cents = 25000 WHERE id = ?")
      .run(`${now.getFullYear()}-${curMonth}-${day} 10:00:00`, o1.id)

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.totalCents).toBe(25000)
  })
})

describe('合并待办列表 (getTodoList)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-08: 空列表返回空数组', () => {
    const result = dashboard.getTodoList(artist.id)
    expect(result).toEqual([])
  })

  it('TC-DASH-09: 逾期订单排最前+标签逾期', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-010', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2020-01-01 00:00:00' WHERE id = ?").run(o1.id)

    seedOrder(artist.id, { order_no: 'T-011', status: 'pending' })

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].orderNo).toBe('T-010')
    expect(result[0].tag).toBe('逾期')
    expect(result[1].tag).toBe('新单')
  })

  it('TC-DASH-10: 今日截稿排在逾期之后', () => {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 12:00:00`

    const o1 = seedOrder(artist.id, { order_no: 'T-012', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2020-01-01 00:00:00' WHERE id = ?").run(o1.id)

    const o2 = seedOrder(artist.id, { order_no: 'T-013', status: 'wip' })
    db.prepare('UPDATE orders SET deadline = ? WHERE id = ?').run(todayStr, o2.id)

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].tag).toBe('逾期')
    expect(result[1].tag).toBe('截稿')
  })

  it('TC-DASH-11: pending 排在截稿之后', () => {
    seedOrder(artist.id, { order_no: 'T-014', status: 'pending' })
    seedOrder(artist.id, { order_no: 'T-015', status: 'revision' })

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].tag).toBe('新单')
    expect(result[1].tag).toBe('修改')
  })

  it('TC-DASH-12: done 不算终态，仍在列表中', () => {
    seedOrder(artist.id, { order_no: 'T-016', status: 'done' })

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('T-016')
    expect(result[0].tag).toBe('进行中')
  })

  it('TC-DASH-13: delivered/cancelled 不出现', () => {
    seedOrder(artist.id, { order_no: 'T-017', status: 'delivered' })
    seedOrder(artist.id, { order_no: 'T-018', status: 'cancelled' })

    const result = dashboard.getTodoList(artist.id)
    expect(result).toHaveLength(0)
  })

  it('TC-DASH-14: 有 deadline 的 confirmed/wip 按 deadline 升序', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-019', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2099-12-31 00:00:00' WHERE id = ?").run(o1.id)

    const o2 = seedOrder(artist.id, { order_no: 'T-020', status: 'confirmed' })
    db.prepare("UPDATE orders SET deadline = '2099-06-01 00:00:00' WHERE id = ?").run(o2.id)

    const result = dashboard.getTodoList(artist.id)
    expect(result[0].orderNo).toBe('T-020') // 更早的 deadline 排前
    expect(result[1].orderNo).toBe('T-019')
  })

  it('TC-DASH-15: 无 deadline 排最后', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-021', status: 'wip' })
    db.prepare("UPDATE orders SET deadline = '2099-12-31 00:00:00' WHERE id = ?").run(o1.id)

    seedOrder(artist.id, { order_no: 'T-022', status: 'wip' })
    // 无 deadline

    const result = dashboard.getTodoList(artist.id)
    expect(result[result.length - 1].orderNo).toBe('T-022')
  })
})

describe('活动流 (getActivity)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-DASH-16: 无备注返回空数组', () => {
    const result = dashboard.getActivity(artist.id)
    expect(result).toEqual([])
  })

  it('TC-DASH-17: 返回备注+订单号', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-030' })
    addNote(o1.id, '画师添加备注', '2026-08-01 10:00:00')

    const result = dashboard.getActivity(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('T-030')
    expect(result[0].content).toBe('画师添加备注')
    expect(result[0].createdAt).toBe('2026-08-01 10:00:00')
  })

  it('TC-DASH-18: 限制10条', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-031' })
    for (let i = 1; i <= 15; i++) {
      addNote(o1.id, `备注${i}`, `2026-08-01 ${String(i).padStart(2, '0')}:00:00`)
    }

    const result = dashboard.getActivity(artist.id)
    expect(result).toHaveLength(10)
    // 最新的排前面
    expect(result[0].content).toBe('备注15')
  })

  it('TC-DASH-19: 按 created_at DESC 排序', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-032' })
    addNote(o1.id, '第一条', '2026-08-01 08:00:00')
    addNote(o1.id, '第二条', '2026-08-01 12:00:00')
    addNote(o1.id, '第三条', '2026-08-01 10:00:00')

    const result = dashboard.getActivity(artist.id)
    expect(result[0].content).toBe('第二条')
    expect(result[1].content).toBe('第三条')
    expect(result[2].content).toBe('第一条')
  })

  it('TC-DASH-20: 跨订单备注混合排列', () => {
    const o1 = seedOrder(artist.id, { order_no: 'T-033' })
    const o2 = seedOrder(artist.id, { order_no: 'T-034' })
    addNote(o1.id, '订单1备注', '2026-08-01 09:00:00')
    addNote(o2.id, '订单2备注', '2026-08-01 11:00:00')

    const result = dashboard.getActivity(artist.id)
    expect(result).toHaveLength(2)
    expect(result[0].orderNo).toBe('T-034')
    expect(result[1].orderNo).toBe('T-033')
  })
})
