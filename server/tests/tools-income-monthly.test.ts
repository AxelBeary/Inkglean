import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// 月度收入趋势端点 GET /api/artist/tools/income-monthly?months=
// oimimo 吸纳批四：与 income-summary 同源同口径，按本地月归属连续输出
// ============================================

describe('income-monthly 月度收入趋势端点', () => {
  let app: FastifyInstance, artist: ArtistRow, token: string

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist()
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** Date → SQLite UTC datetime（order_payments.created_at 存 UTC） */
  function toSqliteUtc(d: Date): string {
    return d.toISOString().slice(0, 19).replace('T', ' ')
  }

  /** 相对当月的月份键（offset=0 当月，-1 上月…） */
  function monthKey(offset: number): string {
    const now = new Date()
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  /** 某月本地中午 12 点（任意时区下本地日期不跨月，与既有收入测试同口径） */
  function localNoon(offset: number, day = 15): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + offset, day, 12, 0, 0)
  }

  function addOrderPayment(artistId: number, amountCents: number, createdAtUtc: string): SeededOrder {
    const o = seedOrder(artistId, { order_no: `IM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, client_qq: '10001' })
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)')
      .run(o.id, amountCents, createdAtUtc, 'artist')
    return o
  }

  function addStandalone(artistId: number, amountCents: number, incomeDate: string): void {
    db.prepare('INSERT INTO standalone_incomes (artist_id, amount_cents, client_name, note, income_date) VALUES (?, ?, ?, ?, ?)')
      .run(artistId, amountCents, '散单客户', '', incomeDate)
  }

  async function getMonthly(url = '/api/artist/tools/income-monthly') {
    return app.inject({ method: 'GET', url, headers: { Authorization: `Bearer ${token}` } })
  }

  interface MonthRow { month: string; orderCents: number; standaloneCents: number; totalCents: number }

  it('TC-IM-01: 无数据 → 默认 12 个月连续补 0', async () => {
    const res = await getMonthly()
    expect(res.statusCode).toBe(200)
    const months = res.json().months as MonthRow[]
    expect(months).toHaveLength(12)
    expect(months[11].month).toBe(monthKey(0)) // 最后一行 = 当月
    expect(months.every(m => m.totalCents === 0)).toBe(true)
    // 连续性：相邻月份键递增（跨年自然衔接）
    for (let i = 1; i < months.length; i++) {
      expect(months[i].month > months[i - 1].month).toBe(true)
    }
  })

  it('TC-IM-02: 订单收款（含退款负数）+ 散单按到账月归属', async () => {
    addOrderPayment(artist.id, 10000, toSqliteUtc(localNoon(0)))
    addOrderPayment(artist.id, -2000, toSqliteUtc(localNoon(0, 16)))
    addOrderPayment(artist.id, 6000, toSqliteUtc(localNoon(-1)))
    addStandalone(artist.id, 5000, `${monthKey(0)}-10`)

    const months = (await getMonthly()).json().months as MonthRow[]
    const cur = months.find(m => m.month === monthKey(0))!
    const prev = months.find(m => m.month === monthKey(-1))!
    expect(cur.orderCents).toBe(8000) // 10000 - 2000
    expect(cur.standaloneCents).toBe(5000)
    expect(cur.totalCents).toBe(13000)
    expect(prev.orderCents).toBe(6000)
    expect(prev.totalCents).toBe(6000)
  })

  it('TC-IM-03: 画师隔离——他人收款不进本表', async () => {
    const other = seedArtist({ qq_number: '20002', subdomain: 'other-im', name: '别家' })
    addOrderPayment(other.id, 99999, toSqliteUtc(localNoon(0)))
    addStandalone(other.id, 88888, `${monthKey(0)}-10`)

    const months = (await getMonthly()).json().months as MonthRow[]
    expect(months.every(m => m.totalCents === 0)).toBe(true)
  })

  it('TC-IM-04: months 参数生效且越界被拒', async () => {
    const three = (await getMonthly('/api/artist/tools/income-monthly?months=3')).json().months as MonthRow[]
    expect(three).toHaveLength(3)

    const bad = await getMonthly('/api/artist/tools/income-monthly?months=25')
    expect(bad.statusCode).toBe(400)
  })

  it('TC-IM-05: 窗口外（13 个月前）的收款不进表', async () => {
    addOrderPayment(artist.id, 10000, toSqliteUtc(localNoon(-13)))
    const months = (await getMonthly()).json().months as MonthRow[]
    expect(months.every(m => m.totalCents === 0)).toBe(true)
  })
})
