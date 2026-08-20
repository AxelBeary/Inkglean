// 自定义首页批二：可选板块数据源端点测试（收入概览 + 截稿倒计时）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { cleanDb, seedArtist, seedOrder, db, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { toSqliteDate } from '../src/utils/date.js'

describe('可选板块数据源（自定义首页批二）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
  })
  afterEach(async () => { await app.close() })

  function authed(): { artist: ArtistRow; headers: { authorization: string } } {
    const artist = seedArtist({ qq_number: '888', subdomain: 'dash-widgets' })
    const token = createSession(artist.id, artist.token_version)
    return { artist, headers: { authorization: 'Bearer ' + token } }
  }

  /** 本地今日 + n 天中午的 UTC 存储串（deadline DATETIME 口径） */
  function dayOffset(n: number): string {
    const d = new Date()
    d.setDate(d.getDate() + n)
    d.setHours(12, 0, 0, 0)
    return toSqliteDate(d)
  }

  it('TC-DW-01 收入概览空态：全 0 不落 null', async () => {
    const { headers } = authed()
    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/income-overview', headers })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ monthReceivedCents: 0, yearReceivedCents: 0, pendingCents: 0, pendingCount: 0 })
  })

  it('TC-DW-02 待收尾款：进行中订单未收部分合计；无价单不计；已交付不计', async () => {
    const { artist, headers } = authed()
    // A：进行中，总价 100 元已收 40 → 待收 60
    const a = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 10000, paid_total_cents = 4000 WHERE id = ?').run(a.id)
    // B：进行中无价 → 不计
    seedOrder(artist.id)
    // C：已交付且未收齐 → 不计（终态不在倒计时/待收口径）
    const c = seedOrder(artist.id, { status: 'delivered' })
    db.prepare('UPDATE orders SET total_price_cents = 5000, paid_total_cents = 1000 WHERE id = ?').run(c.id)
    // D：进行中，终价优先于总价（终价 80 已收 80 → 待收 0 不计入条数）
    const d = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 10000, final_price_cents = 8000, paid_total_cents = 8000 WHERE id = ?').run(d.id)

    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/income-overview', headers })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.pendingCents).toBe(6000)
    expect(body.pendingCount).toBe(1)
    expect(body.monthReceivedCents).toBe(0) // 无收款流水
  })

  it('TC-DW-03 截稿倒计时：窗口内（含已逾期）按截稿日升序，窗外丢弃，daysLeft 按本地日界', async () => {
    const { artist, headers } = authed()
    const far = seedOrder(artist.id)     // d+20：窗外
    const soon = seedOrder(artist.id)    // d+2：窗内
    const overdue = seedOrder(artist.id) // d-1：已逾期，更要盯
    db.prepare('UPDATE orders SET deadline = ?, client_name = ? WHERE id = ?').run(dayOffset(20), '远单', far.id)
    db.prepare('UPDATE orders SET deadline = ?, client_name = ? WHERE id = ?').run(dayOffset(2), '近单', soon.id)
    db.prepare('UPDATE orders SET deadline = ?, client_name = ? WHERE id = ?').run(dayOffset(-1), '逾期单', overdue.id)

    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/deadline-soon', headers })
    expect(res.statusCode).toBe(200)
    const items = res.json().items as Array<{ orderNo: string; clientName: string; daysLeft: number }>
    expect(items.map(i => i.clientName)).toEqual(['逾期单', '近单'])
    expect(items[0].daysLeft).toBe(-1)
    expect(items[1].daysLeft).toBe(2)
  })

  it('TC-DW-04 参数钳制：days/limit 越界被 schema 拒 400；合法自定义生效', async () => {
    const { artist, headers } = authed()
    const o = seedOrder(artist.id)
    db.prepare('UPDATE orders SET deadline = ? WHERE id = ?').run(dayOffset(40), o.id)

    expect((await app.inject({ method: 'GET', url: '/api/artist/dashboard/deadline-soon?days=0', headers })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/artist/dashboard/deadline-soon?limit=99', headers })).statusCode).toBe(400)

    const wide = await app.inject({ method: 'GET', url: '/api/artist/dashboard/deadline-soon?days=60&limit=1', headers })
    expect(wide.statusCode).toBe(200)
    expect(wide.json().items).toHaveLength(1)
  })

  it('TC-DW-05 未登录访问两端点 → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/artist/dashboard/income-overview' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/artist/dashboard/deadline-soon' })).statusCode).toBe(401)
  })
})
