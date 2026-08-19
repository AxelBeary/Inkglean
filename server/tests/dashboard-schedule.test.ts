import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { toSqliteDate } from '../src/utils/date.js'
import * as dashboard from '../src/features/artist/dashboard.service.js'

// ============================================
// 近 7 日排期条（GET /api/artist/dashboard/schedule）
// 窗口 = [本地今日-1 天, 本地今日+6 天]
// ============================================

/** getSchedule 返回条目断言视图 */
interface ScheduleBar {
  id: number
  orderNo: string
  clientName: string | null
  status: string
  startDate: string | null
  deadline: string | null
  stageName: string | null
  styleName: string | null
  sizeName: string | null
}

/** 相对今天偏移 days 天的本地日历日字符串（YYYY-MM-DD，start_date 存储口径） */
function localDateStr(days: number): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 相对今天偏移 days 天的本地 12:00 → UTC SQLite 串（deadline 存储口径） */
function localNoonUtc(days: number): string {
  const now = new Date()
  return toSqliteDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0))
}

/** 直接写排期字段（start_date/deadline 由 seedOrder 之外的 UPDATE 设定，与现有测试同模式） */
function setDates(order: SeededOrder, { startDate = null, deadline = null }: { startDate?: string | null; deadline?: string | null } = {}): void {
  db.prepare('UPDATE orders SET start_date = ?, deadline = ? WHERE id = ?')
    .run(startDate, deadline, order.id)
}

describe('近 7 日排期 (getSchedule)', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-SCHED-01: 无数据返回空数组', () => {
    expect(dashboard.getSchedule(artist.id)).toEqual([])
  })

  it('TC-SCHED-02: 窗口内 start_date 入选并返回契约形状', () => {
    const o = seedOrder(artist.id, { order_no: 'SCH-001', status: 'wip', client_name: '客户A' })
    setDates(o, { startDate: localDateStr(0) })

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: o.id,
      orderNo: 'SCH-001',
      clientName: '客户A',
      status: 'wip',
      startDate: localDateStr(0),
      deadline: null,
      stageName: null,
      styleName: null,
      sizeName: null
    })
  })

  it('TC-SCHED-03: 窗口内 deadline 入选（start_date 为空）', () => {
    const o = seedOrder(artist.id, { order_no: 'SCH-002', status: 'wip' })
    setDates(o, { deadline: localNoonUtc(3) })

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('SCH-002')
    expect(result[0].startDate).toBeNull()
  })

  it('TC-SCHED-04: 完全在窗外（过去/未来）不入选', () => {
    const past = seedOrder(artist.id, { order_no: 'SCH-003', status: 'wip' })
    setDates(past, { startDate: localDateStr(-10), deadline: localNoonUtc(-9) })
    const future = seedOrder(artist.id, { order_no: 'SCH-004', status: 'wip' })
    setDates(future, { startDate: localDateStr(7), deadline: localNoonUtc(8) })

    expect(dashboard.getSchedule(artist.id)).toEqual([])
  })

  it('TC-SCHED-05: 跨窗边界（start 在窗前、deadline 在窗内）入选', () => {
    const o = seedOrder(artist.id, { order_no: 'SCH-005', status: 'wip' })
    setDates(o, { startDate: localDateStr(-10), deadline: localNoonUtc(6) })

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('SCH-005')
  })

  it('TC-SCHED-06: delivered/cancelled 排除', () => {
    const delivered = seedOrder(artist.id, { order_no: 'SCH-006', status: 'delivered' })
    setDates(delivered, { startDate: localDateStr(0) })
    const cancelled = seedOrder(artist.id, { order_no: 'SCH-007', status: 'cancelled' })
    setDates(cancelled, { deadline: localNoonUtc(1) })

    expect(dashboard.getSchedule(artist.id)).toEqual([])
  })

  it('TC-SCHED-07: stageName 来自订单当前工作流节点', () => {
    const o = seedOrder(artist.id, { order_no: 'SCH-008', status: 'wip' })
    setDates(o, { startDate: localDateStr(1) })
    const stage = db.prepare(
      'INSERT INTO artist_workflow_stages (artist_id, name, sort_order) VALUES (?, ?, ?)'
    ).run(artist.id, '线稿', 1)
    db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(stage.lastInsertRowid, o.id)

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    expect(result[0].stageName).toBe('线稿')
  })

  it('TC-SCHED-08: 按 startDate（空则 deadline）升序', () => {
    const late = seedOrder(artist.id, { order_no: 'SCH-009', status: 'wip' })
    setDates(late, { startDate: localDateStr(5) })
    const early = seedOrder(artist.id, { order_no: 'SCH-010', status: 'wip' })
    setDates(early, { startDate: localDateStr(0) })
    const deadlineOnly = seedOrder(artist.id, { order_no: 'SCH-011', status: 'wip' })
    setDates(deadlineOnly, { deadline: localNoonUtc(2) })

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    expect(result.map(r => r.orderNo)).toEqual(['SCH-010', 'SCH-011', 'SCH-009'])
  })

  it('TC-SCHED-09: 只返回本画师订单', () => {
    const other = seedArtist({ qq_number: '88888', subdomain: 'bob' })
    const mine = seedOrder(artist.id, { order_no: 'SCH-012', status: 'wip' })
    setDates(mine, { startDate: localDateStr(0) })
    const theirs = seedOrder(other.id, { order_no: 'SCH-013', status: 'wip' })
    setDates(theirs, { startDate: localDateStr(0) })

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    expect(result).toHaveLength(1)
    expect(result[0].orderNo).toBe('SCH-012')
  })

  it('TC-SCHED-12: 画风/尺寸名随 style_size_id 下发；无关联时为 null（E1 补全，清扫批）', () => {
    const style = db.prepare(
      'INSERT INTO art_styles (artist_id, name, sort_order) VALUES (?, ?, ?)'
    ).run(artist.id, '日系', 1)
    const size = db.prepare(
      'INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)'
    ).run(style.lastInsertRowid, '头像', 5000, 1)

    const withStyle = seedOrder(artist.id, { order_no: 'SCH-014', status: 'wip' })
    setDates(withStyle, { startDate: localDateStr(0) })
    db.prepare('UPDATE orders SET style_size_id = ? WHERE id = ?').run(size.lastInsertRowid, withStyle.id)
    const plain = seedOrder(artist.id, { order_no: 'SCH-015', status: 'wip' })
    setDates(plain, { startDate: localDateStr(1) })

    const result = dashboard.getSchedule(artist.id) as ScheduleBar[]
    const styled = result.find(r => r.orderNo === 'SCH-014') as ScheduleBar
    const bare = result.find(r => r.orderNo === 'SCH-015') as ScheduleBar
    expect(styled.styleName).toBe('日系')
    expect(styled.sizeName).toBe('头像')
    expect(bare.styleName).toBeNull()
    expect(bare.sizeName).toBeNull()
  })
})

describe('近 7 日排期接口（路由层）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function token(artist: ArtistRow): string {
    return createSession(artist.id, artist.token_version)
  }

  it('TC-SCHED-10: 未登录返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/schedule' })
    expect(res.statusCode).toBe(401)
  })

  it('TC-SCHED-11: 登录后返回 { bars: [...] } 契约', async () => {
    const artist = seedArtist()
    const o = seedOrder(artist.id, { order_no: 'SCH-020', status: 'wip' })
    setDates(o, { startDate: localDateStr(0) })

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/dashboard/schedule',
      headers: { Authorization: `Bearer ${token(artist)}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      bars: [{
        id: o.id,
        orderNo: 'SCH-020',
        clientName: null,
        status: 'wip',
        startDate: localDateStr(0),
        deadline: null,
        stageName: null,
        styleName: null,
        sizeName: null
      }]
    })
  })
})
