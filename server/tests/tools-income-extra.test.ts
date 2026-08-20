import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow, type SeededOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// oimimo 吸纳补遗（820 worktree 批）：收入分布两聚合端点
// GET /api/artist/tools/income-by-style / GET /api/artist/tools/top-clients
// ============================================

describe('income-by-style / top-clients 收入分布聚合端点', () => {
  let app: FastifyInstance, artist: ArtistRow, token: string

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist()
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function toSqliteUtc(d: Date): string {
    return d.toISOString().slice(0, 19).replace('T', ' ')
  }

  /** 相对当月的本地中午 12 点（任意时区下本地日期不跨月） */
  function localNoon(offset: number, day = 15): Date {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + offset, day, 12, 0, 0)
  }

  /** 建画风+尺寸，返回 size id */
  function addStyleWithSize(artistId: number, styleName: string, sizeName: string): number {
    const styleRow = db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artistId, styleName)
    const sizeRow = db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, 100)')
      .run(Number(styleRow.lastInsertRowid), sizeName)
    return Number(sizeRow.lastInsertRowid)
  }

  function addPayment(order: SeededOrder, amountCents: number, createdAtUtc: string): void {
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)')
      .run(order.id, amountCents, createdAtUtc, 'artist')
  }

  function seedStyledOrder(artistId: number, sizeId: number, clientQq: string, clientName: string | null): SeededOrder {
    const o = seedOrder(artistId, { order_no: `IX-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, client_qq: clientQq, client_name: clientName })
    db.prepare('UPDATE orders SET style_size_id = ? WHERE id = ?').run(sizeId, o.id)
    return o
  }

  async function getByStyle(url = '/api/artist/tools/income-by-style') {
    return app.inject({ method: 'GET', url, headers: { Authorization: `Bearer ${token}` } })
  }

  async function getTopClients(url = '/api/artist/tools/top-clients') {
    return app.inject({ method: 'GET', url, headers: { Authorization: `Bearer ${token}` } })
  }

  interface StyleRow { styleName: string; cents: number }
  interface ClientRow { clientQq: string; clientName: string | null; totalCents: number; orderCount: number }

  it('TC-IX-01: 画风分布——按画风聚合降序，无画风订单落空串桶，画师隔离', async () => {
    const sizeAvatar = addStyleWithSize(artist.id, '头像', '大头')
    const sizeIllust = addStyleWithSize(artist.id, '立绘', '全身')
    addPayment(seedStyledOrder(artist.id, sizeAvatar, '10001', '客A'), 10000, toSqliteUtc(localNoon(0)))
    addPayment(seedStyledOrder(artist.id, sizeAvatar, '10002', '客B'), 5000, toSqliteUtc(localNoon(0)))
    addPayment(seedStyledOrder(artist.id, sizeIllust, '10001', '客A'), 20000, toSqliteUtc(localNoon(0)))
    // 无画风订单（手动录单场景：seedOrder 默认不带 style_size_id）
    const manual = seedOrder(artist.id, { order_no: `IX-M-${Date.now()}`, client_qq: '10003', client_name: '客C' })
    addPayment(manual, 3000, toSqliteUtc(localNoon(0)))
    // 别家画师的收款不得进本表
    const other = seedArtist({ qq_number: '20002', subdomain: 'other-ix', name: '别家' })
    const otherSize = addStyleWithSize(other.id, '别家画风', '尺寸')
    addPayment(seedStyledOrder(other.id, otherSize, '10001', '客A'), 99999, toSqliteUtc(localNoon(0)))

    const res = await getByStyle()
    expect(res.statusCode).toBe(200)
    const styles = res.json().styles as StyleRow[]
    expect(styles).toEqual([
      { styleName: '立绘', cents: 20000 },
      { styleName: '头像', cents: 15000 },
      { styleName: '', cents: 3000 }
    ])
  })

  it('TC-IX-02: 无收款 → 空数组；months 越界被拒', async () => {
    expect((await getByStyle()).json().styles).toEqual([])
    expect((await getByStyle('/api/artist/tools/income-by-style?months=99')).statusCode).toBe(400)
  })

  it('TC-IX-03: 客户排名——同客户多单合并（金额+单数），降序，limit 截断', async () => {
    const sizeId = addStyleWithSize(artist.id, '头像', '大头')
    addPayment(seedStyledOrder(artist.id, sizeId, '10001', '大客户'), 10000, toSqliteUtc(localNoon(0)))
    addPayment(seedStyledOrder(artist.id, sizeId, '10001', '大客户'), 8000, toSqliteUtc(localNoon(0, 16)))
    addPayment(seedStyledOrder(artist.id, sizeId, '10002', '小客户'), 5000, toSqliteUtc(localNoon(0)))
    addPayment(seedStyledOrder(artist.id, sizeId, '10003', null), 4000, toSqliteUtc(localNoon(0)))
    addPayment(seedStyledOrder(artist.id, sizeId, '10004', '丁'), 3000, toSqliteUtc(localNoon(0)))

    const res = await getTopClients('/api/artist/tools/top-clients?limit=3')
    expect(res.statusCode).toBe(200)
    const clients = res.json().clients as ClientRow[]
    expect(clients).toHaveLength(3)
    expect(clients[0]).toEqual({ clientQq: '10001', clientName: '大客户', totalCents: 18000, orderCount: 2 })
    expect(clients[1].clientQq).toBe('10002')
    expect(clients[2].clientName).toBeNull() // 未填昵称 → null，前端回落 QQ
  })

  it('TC-IX-04: 排名画师隔离 + limit 越界被拒', async () => {
    const other = seedArtist({ qq_number: '20003', subdomain: 'other-ix2', name: '别家2' })
    const otherSize = addStyleWithSize(other.id, '画风', '尺寸')
    addPayment(seedStyledOrder(other.id, otherSize, '10001', '客'), 99999, toSqliteUtc(localNoon(0)))
    expect((await getTopClients()).json().clients).toEqual([])

    expect((await getTopClients('/api/artist/tools/top-clients?limit=2')).statusCode).toBe(400)
    expect((await getTopClients('/api/artist/tools/top-clients?limit=21')).statusCode).toBe(400)
  })
})
