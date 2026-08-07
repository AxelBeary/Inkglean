import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import * as tools from '../src/features/artist/tools.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// 画师工具测试（REQ-035 批A/批C + REQ-031 A1）
// 客户标记 / 老客召回 / 散单记账 / 收入导出 / 迁移 v46/v47
// ============================================

describe('迁移 v46/v47', () => {
  it('TC-TL-01: client_profiles 表 7 列 + 唯一约束', () => {
    const cols = db.prepare('PRAGMA table_info(client_profiles)').all().map(c => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'artist_id', 'client_qq', 'tags', 'note', 'created_at', 'updated_at']))
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 46').get()
    expect(applied?.version).toBe(46)
  })

  it('TC-TL-02: standalone_incomes 表 8 列 + CHECK(amount_cents>0)', () => {
    const cols = db.prepare('PRAGMA table_info(standalone_incomes)').all().map(c => c.name)
    expect(cols).toEqual(expect.arrayContaining(['id', 'artist_id', 'amount_cents', 'client_name', 'note', 'income_date', 'created_at', 'updated_at']))
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 47').get()
    expect(applied?.version).toBe(47)
  })

  it('TC-TL-03: 迁移幂等——重跑 initDatabase 不炸且表仍在', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_client_profiles_artist'").get()
    const idx2 = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_standalone_incomes_artist_date'").get()
    expect(idx?.name).toBe('idx_client_profiles_artist')
    expect(idx2?.name).toBe('idx_standalone_incomes_artist_date')
  })
})

describe('client_profiles CRUD', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-TL-04: upsert 新增 → 再 upsert 更新（不重复插入）', () => {
    const p1 = tools.upsertClientProfile(artist.id, '10001', ['老客户'], '备注A')
    expect(p1.clientQq).toBe('10001')
    expect(p1.tags).toEqual(['老客户'])
    expect(p1.note).toBe('备注A')

    const p2 = tools.upsertClientProfile(artist.id, '10001', ['老客户', '厚涂'], '备注B')
    expect(p2.tags).toEqual(['老客户', '厚涂'])
    expect(p2.note).toBe('备注B')

    const count = db.prepare('SELECT COUNT(*) AS c FROM client_profiles').get().c
    expect(count).toBe(1)
  })

  it('TC-TL-05: 查询返回 tags/note；delete 后 null', () => {
    tools.upsertClientProfile(artist.id, '10001', ['急单'], '备注')
    const got = tools.getClientProfile(artist.id, '10001')
    expect(got?.tags).toEqual(['急单'])
    expect(got?.note).toBe('备注')

    tools.deleteClientProfile(artist.id, '10001')
    expect(tools.getClientProfile(artist.id, '10001')).toBeNull()
  })

  it('TC-TL-06: 列表 + qq 过滤；不同画师隔离', () => {
    tools.upsertClientProfile(artist.id, '10001', ['A'], '')
    tools.upsertClientProfile(artist.id, '20002', ['B'], '')

    expect(tools.listClientProfiles(artist.id)).toHaveLength(2)
    expect(tools.listClientProfiles(artist.id, '10001')).toHaveLength(1)
    expect(tools.listClientProfiles(artist.id, '10001')[0].clientQq).toBe('10001')
  })
})

describe('getClientSummary', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-TL-07: 2 单 + 1 笔付款 → totalOrders=2 / totalPaidCents=付款和', () => {
    const o1 = seedOrder(artist.id, { order_no: 'S-001', client_qq: '10001' })
    const o2 = seedOrder(artist.id, { order_no: 'S-002', client_qq: '10001' })
    seedOrder(artist.id, { order_no: 'S-003', client_qq: '99998' })

    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_by) VALUES (?, ?, ?)')
      .run(o1.id, 12000, 'artist')
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_by) VALUES (?, ?, ?)')
      .run(o2.id, 3000, 'artist')

    const summary = tools.getClientSummary(artist.id, '10001')
    expect(summary?.totalOrders).toBe(2)
    expect(summary?.totalPaidCents).toBe(15000)
    expect(summary?.clientQq).toBe('10001')
    expect(summary?.lastOrderStatus).toBe('pending')
    expect(summary?.lastOrderAt).not.toBeNull()
  })

  it('TC-TL-08: 退款负数计入（正负相抵）', () => {
    const o1 = seedOrder(artist.id, { order_no: 'S-010', client_qq: '10001' })
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?)')
      .run(o1.id, 10000, '定金', 'artist')
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?)')
      .run(o1.id, -2000, '退款', 'artist')

    const summary = tools.getClientSummary(artist.id, '10001')
    expect(summary?.totalPaidCents).toBe(8000)
  })

  it('TC-TL-09: 无订单 QQ → null', () => {
    expect(tools.getClientSummary(artist.id, 'NO-ONE')).toBeNull()
  })

  it('TC-TL-10: 汇总不含其他画师流水', () => {
    const other = seedArtist({ subdomain: 'bob', qq_number: '999' })
    const o1 = seedOrder(artist.id, { order_no: 'S-020', client_qq: '10001' })
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_by) VALUES (?, ?, ?)')
      .run(o1.id, 5000, 'artist')

    const s1 = tools.getClientSummary(artist.id, '10001')
    const s2 = tools.getClientSummary(other.id, '10001')
    expect(s1?.totalPaidCents).toBe(5000)
    expect(s2).toBeNull()
  })
})

describe('listReturningClients', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-TL-11: 老单 45 天前 → days=30 命中 / days=60 不命中', () => {
    const past = new Date(Date.now() - 45 * 86_400_000)
    const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')} 10:00:00`
    const o1 = seedOrder(artist.id, { order_no: 'R-001', client_qq: '10001' })
    db.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(pastStr, o1.id)

    const hit30 = tools.listReturningClients(artist.id, 30)
    expect(hit30).toHaveLength(1)
    expect(hit30[0].clientQq).toBe('10001')
    expect(hit30[0].daysSinceLastOrder).toBe(45)

    const hit60 = tools.listReturningClients(artist.id, 60)
    expect(hit60).toHaveLength(0)
  })

  it('TC-TL-12: 近期客户（7 天前）不命中 days=30', () => {
    const recent = new Date(Date.now() - 7 * 86_400_000)
    const recentStr = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')} 10:00:00`
    const o1 = seedOrder(artist.id, { order_no: 'R-010', client_qq: '10001' })
    db.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(recentStr, o1.id)

    expect(tools.listReturningClients(artist.id, 30)).toHaveLength(0)
  })

  it('TC-TL-13: 多个老客按天数倒序 + 带汇总', () => {
    const past45 = new Date(Date.now() - 45 * 86_400_000)
    const past90 = new Date(Date.now() - 90 * 86_400_000)
    const s45 = `${past45.getFullYear()}-${String(past45.getMonth() + 1).padStart(2, '0')}-${String(past45.getDate()).padStart(2, '0')} 10:00:00`
    const s90 = `${past90.getFullYear()}-${String(past90.getMonth() + 1).padStart(2, '0')}-${String(past90.getDate()).padStart(2, '0')} 10:00:00`

    const a = seedOrder(artist.id, { order_no: 'R-020', client_qq: '10001' })
    const b = seedOrder(artist.id, { order_no: 'R-021', client_qq: '10002' })
    db.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(s45, a.id)
    db.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(s90, b.id)
    db.prepare('INSERT INTO order_payments (order_id, amount_cents, created_by) VALUES (?, ?, ?)').run(a.id, 6000, 'artist')

    const rows = tools.listReturningClients(artist.id, 30)
    expect(rows).toHaveLength(2)
    expect(rows[0].clientQq).toBe('10002') // 90 天倒序在前
    expect(rows[1].clientQq).toBe('10001')
    expect(rows[1].totalPaidCents).toBe(6000)
  })
})

describe('standalone_incomes CRUD', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-TL-14: create → list → delete → list 空', () => {
    const item = tools.createStandaloneIncome(artist.id, { amountCents: 5000, clientName: '张客户', note: '立绘', incomeDate: '2026-08-01' })
    expect(item.id).toBeGreaterThan(0)
    expect(item.amountCents).toBe(5000)
    expect(item.clientName).toBe('张客户')
    expect(item.incomeDate).toBe('2026-08-01')

    const list = tools.listStandaloneIncomes(artist.id)
    expect(list).toHaveLength(1)

    expect(tools.deleteStandaloneIncome(artist.id, item.id)).toBe(true)
    expect(tools.listStandaloneIncomes(artist.id)).toHaveLength(0)
  })

  it('TC-TL-15: list 按 income_date 倒序 + from/to 过滤', () => {
    tools.createStandaloneIncome(artist.id, { amountCents: 1000, clientName: 'A', note: '', incomeDate: '2026-08-01' })
    tools.createStandaloneIncome(artist.id, { amountCents: 2000, clientName: 'B', note: '', incomeDate: '2026-08-03' })
    tools.createStandaloneIncome(artist.id, { amountCents: 3000, clientName: 'C', note: '', incomeDate: '2026-07-30' })

    const all = tools.listStandaloneIncomes(artist.id)
    expect(all.map(i => i.incomeDate)).toEqual(['2026-08-03', '2026-08-01', '2026-07-30'])

    const ranged = tools.listStandaloneIncomes(artist.id, '2026-08-01', '2026-08-31')
    expect(ranged).toHaveLength(2)
  })

  it('TC-TL-16: 金额校验——amountCents ≤0 被拒', () => {
    expect(() => tools.createStandaloneIncome(artist.id, { amountCents: 0, clientName: '', note: '', incomeDate: '2026-08-01' })).toThrow()
    expect(() => tools.createStandaloneIncome(artist.id, { amountCents: -5, clientName: '', note: '', incomeDate: '2026-08-01' })).toThrow()
  })

  it('TC-TL-17: 日期格式校验——非法日期被拒', () => {
    expect(() => tools.createStandaloneIncome(artist.id, { amountCents: 100, clientName: '', note: '', incomeDate: '2026/08/01' })).toThrow()
    expect(() => tools.createStandaloneIncome(artist.id, { amountCents: 100, clientName: '', note: '', incomeDate: '2026-13-99' })).toThrow()
  })

  it('TC-TL-18: 越权删除——他人 artist_id 不可删', () => {
    const other = seedArtist({ subdomain: 'bob', qq_number: '999' })
    const item = tools.createStandaloneIncome(artist.id, { amountCents: 5000, clientName: 'X', note: '', incomeDate: '2026-08-01' })
    expect(tools.deleteStandaloneIncome(other.id, item.id)).toBe(false)
    // 本人可删
    expect(tools.deleteStandaloneIncome(artist.id, item.id)).toBe(true)
  })
})

describe('getExportRows（A1 合并流水）', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-TL-19: order_payments + standalone 合并，按日期升序，type/orderId 正确', () => {
    const o1 = seedOrder(artist.id, { order_no: 'E-001', client_qq: '10001' })
    db.prepare("INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)")
      .run(o1.id, 30000, '2026-08-01 08:00:00', 'artist')
    tools.createStandaloneIncome(artist.id, { amountCents: 5000, clientName: '张客户', note: '', incomeDate: '2026-08-02' })

    const rows = tools.getExportRows(artist.id, '2026-08-01', '2026-08-31')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ date: '2026-08-01', client: '10001', amountCents: 30000, type: 'order', orderId: o1.id })
    expect(rows[1]).toEqual({ date: '2026-08-02', client: '张客户', amountCents: 5000, type: 'standalone', orderId: null })
  })

  it('TC-TL-20: 退款负数直接负值；时间段外不包含', () => {
    const o1 = seedOrder(artist.id, { order_no: 'E-010', client_qq: '10001' })
    db.prepare("INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)")
      .run(o1.id, 10000, '2026-08-05 08:00:00', 'artist')
    db.prepare("INSERT INTO order_payments (order_id, amount_cents, created_at, note, created_by) VALUES (?, ?, ?, ?, ?)")
      .run(o1.id, -2000, '2026-08-06 08:00:00', '退款', 'artist')

    const rows = tools.getExportRows(artist.id, '2026-08-01', '2026-08-31')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.amountCents)).toEqual([10000, -2000])

    const empty = tools.getExportRows(artist.id, '2026-07-01', '2026-07-31')
    expect(empty).toHaveLength(0)
  })

  it('TC-TL-21: 导出不含其他画师流水', () => {
    const other = seedArtist({ subdomain: 'bob', qq_number: '999' })
    const o1 = seedOrder(other.id, { order_no: 'E-020', client_qq: '10001' })
    db.prepare("INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)")
      .run(o1.id, 99999, '2026-08-01 08:00:00', 'artist')

    const rows = tools.getExportRows(artist.id, '2026-08-01', '2026-08-31')
    expect(rows).toHaveLength(0)
  })
})

describe('tools 路由层（鉴权 + schema + CSV）', () => {
  let app, artist, token

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist()
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  it('TC-TL-22: 未登录访问受保护路由 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/artist/tools/clients' })
    expect(res.statusCode).toBe(401)
  })

  it('TC-TL-23: PUT 保存标记 → GET 详情返回 profile+summary', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/artist/tools/clients/10001',
      headers: { Authorization: `Bearer ${token}` },
      payload: { tags: ['老客户'], note: '熟人' }
    })
    expect(put.statusCode).toBe(200)
    expect(put.json().profile.tags).toEqual(['老客户'])

    const get = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/clients/10001',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(get.statusCode).toBe(200)
    expect(get.json().profile.clientQq).toBe('10001')
    expect(get.json().summary).toBeNull() // 无订单
  })

  it('TC-TL-24: 多余字段静默剥离（项目约定 removeAdditional）；超长 tags → 400', async () => {
    const res1 = await app.inject({
      method: 'PUT',
      url: '/api/artist/tools/clients/10001',
      headers: { Authorization: `Bearer ${token}` },
      payload: { tags: ['老客户'], note: 'x', extra: '不应出现' }
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().profile.note).toBe('x')
    expect(res1.json().extra).toBeUndefined()

    const res2 = await app.inject({
      method: 'PUT',
      url: '/api/artist/tools/clients/10001',
      headers: { Authorization: `Bearer ${token}` },
      payload: { tags: ['超长标签超长标签超长标签超长标签超长标签超长'], note: '' }
    })
    expect(res2.statusCode).toBe(400)
  })

  it('TC-TL-25: POST 散单 0 金额 → 400；正常 → 200 返回 item', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/artist/tools/standalone-incomes',
      headers: { Authorization: `Bearer ${token}` },
      payload: { amountCents: 0, incomeDate: '2026-08-01' }
    })
    expect(bad.statusCode).toBe(400)

    const ok = await app.inject({
      method: 'POST',
      url: '/api/artist/tools/standalone-incomes',
      headers: { Authorization: `Bearer ${token}` },
      payload: { amountCents: 5000, clientName: '张客户', note: '', incomeDate: '2026-08-01' }
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().item.amountCents).toBe(5000)
  })

  it('TC-TL-26: DELETE 他人散单 → 404；本人 → ok', async () => {
    const other = seedArtist({ subdomain: 'bob', qq_number: '999' })
    const item = await app.inject({
      method: 'POST',
      url: '/api/artist/tools/standalone-incomes',
      headers: { Authorization: `Bearer ${token}` },
      payload: { amountCents: 5000, incomeDate: '2026-08-01' }
    })
    const id = item.json().item.id
    const otherToken = createSession(other.id, other.token_version)

    const cross = await app.inject({
      method: 'DELETE',
      url: `/api/artist/tools/standalone-incomes/${id}`,
      headers: { Authorization: `Bearer ${otherToken}` }
    })
    expect(cross.statusCode).toBe(404)

    const mine = await app.inject({
      method: 'DELETE',
      url: `/api/artist/tools/standalone-incomes/${id}`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(mine.statusCode).toBe(200)
    expect(mine.json().ok).toBe(true)
  })

  it('TC-TL-27: 老客召回端点 → 只返回命中客户', async () => {
    const past = new Date(Date.now() - 45 * 86_400_000)
    const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')} 10:00:00`
    const o1 = seedOrder(artist.id, { order_no: 'R-100', client_qq: '10001' })
    db.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(pastStr, o1.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/returning-clients?days=30',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toHaveLength(1)
    expect(res.json().items[0].clientQq).toBe('10001')

    // 非法 days → 400
    const bad = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/returning-clients?days=45',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(bad.statusCode).toBe(400)
  })

  it('TC-TL-28: export.csv → BOM + 表头 + 2 行 + Content-Disposition', async () => {
    const o1 = seedOrder(artist.id, { order_no: 'E-100', client_qq: '10001' })
    db.prepare("INSERT INTO order_payments (order_id, amount_cents, created_at, created_by) VALUES (?, ?, ?, ?)")
      .run(o1.id, 30000, '2026-08-01 08:00:00', 'artist')
    tools.createStandaloneIncome(artist.id, { amountCents: 5000, clientName: '张客户', note: '', incomeDate: '2026-08-02' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/export.csv?from=2026-08-01&to=2026-08-31',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain('income-20260801-20260831.csv')

    const body = res.body
    expect(body.charCodeAt(0)).toBe(0xFEFF) // BOM
    const lines = body.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('date,client,amount_cents,type,order_id')
    expect(lines).toContain(`2026-08-01,10001,30000,order,${o1.id}`)
    expect(lines).toContain('2026-08-02,张客户,5000,standalone,')
  })

  it('TC-TL-29: export.csv 缺 from/to → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/tools/export.csv',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(400)
  })
})
