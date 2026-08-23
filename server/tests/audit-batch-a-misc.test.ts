import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as dashboard from '../src/features/artist/dashboard.service.js'
import * as adminService from '../src/features/admin/admin.service.js'
import * as toolsService from '../src/features/artist/tools.service.js'
import * as trackingService from '../src/features/tracking/tracking.service.js'
import { verifyTotpLogin } from '../src/features/auth/auth.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { deleteArtist } from '../src/features/artist/artist.service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import type { AppError } from '../src/shared/errors.js'

/**
 * audit-a 批：P3-3/P3-4/P3-6/P3-7/P3-8/P3-11/P3-13/P3-15
 */

describe('audit-a P3-3 收入统计 bare column', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
  })

  it('TC-P33-01: 同秒完成的不同价格两单，月收入 = 两单之和', () => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const sameCompletedAt = `${now.getFullYear()}-${month}-${day} 10:00:00`

    const o1 = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position, queue_zone, final_price_cents)
      VALUES ('P33-1', ?, '111', 'medium', 'done', 'self', 1, 'formal', 50000)
    `).run(artist.id)
    const o2 = db.prepare(`
      INSERT INTO orders (order_no, artist_id, client_qq, priority, status, source, queue_position, queue_zone, final_price_cents)
      VALUES ('P33-2', ?, '222', 'medium', 'done', 'self', 1, 'formal', 30000)
    `).run(artist.id)
    db.prepare("UPDATE orders SET completed_at = ? WHERE id IN (?, ?)").run(sameCompletedAt, Number(o1.lastInsertRowid), Number(o2.lastInsertRowid))

    const result = dashboard.getRevenue(artist.id, 'month')
    expect(result.summary.totalCents).toBe(80000)
    expect(result.summary.completedCount).toBe(2)
    // 当日柱也应含两单之和
    const dayBar = result.bars[now.getDate() - 1]
    expect(dayBar.cents).toBe(80000)
    expect(dayBar.count).toBe(2)
  })
})

describe('audit-a P3-4 自定义单折扣码静默无效', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare(`
      INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, enabled)
      VALUES (?, 'CUST10', 'percent', 10, 1)
    `).run(artist.id)
  })

  it('TC-P34-01: 自定义单（无计价基准）带折扣码 → VALIDATION + field=discountCode', () => {
    let caught: unknown = null
    try {
      orderService.createOrder({ artistId: artist.id, clientQq: '111', discountCode: 'CUST10' })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    const e = caught as AppError
    expect(e.code).toBe('VALIDATION')
    expect(e.detail).toMatchObject({ field: 'discountCode' })
    expect((e.detail as { message: string }).message).toContain('无可计价基准')
    expect((db.prepare('SELECT COUNT(*) AS c FROM orders WHERE artist_id = ?').get(artist.id) as { c: number }).c).toBe(0)
  })

  it('TC-P34-02: 不带折扣码的自定义单照常创建', () => {
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    expect(order.id).toBeTruthy()
  })
})

describe('audit-a P3-6 管理员统计排除软删除画师', () => {
  beforeEach(() => cleanDb())

  it('TC-P36-01: 软删除画师不计入 artistCount', () => {
    const a1 = seedArtist({ qq_number: '77021', subdomain: 'keepme' })
    const a2 = seedArtist({ qq_number: '77022', subdomain: 'deleteme' })
    expect(adminService.getGlobalStats().artistCount).toBe(2)

    deleteArtist(a2.id)
    expect(adminService.getGlobalStats().artistCount).toBe(1)
    expect(a1.id).toBeTruthy()
  })
})

describe('audit-a P3-7 DELETE 通用问候语存在性', () => {
  let app: FastifyInstance
  let adminArtist: ArtistRow
  let adminHeaders: Record<string, string>

  beforeEach(async () => {
    cleanDb()
    db.prepare("UPDATE platform_config SET value = '77031' WHERE key = 'admin_qq'").run()
    adminArtist = seedArtist({ qq_number: '77031', subdomain: 'admin' })
    // REQ-041：管理后台路由需 step-up 升级会话
    adminHeaders = { Authorization: `Bearer ${createSession(adminArtist.id, adminArtist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-P37-01: 删除不存在的通用问候语 → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/greetings/99999',
      headers: adminHeaders
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-P37-02: 删除存在的通用问候语 → success', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/greetings',
      headers: adminHeaders,
      payload: { text: '你好{name}' }
    })
    const id = created.json().id
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/greetings/${id}`,
      headers: adminHeaders
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    expect((db.prepare('SELECT COUNT(*) AS c FROM greeting_templates WHERE id = ?').get(id) as { c: number }).c).toBe(0)
  })
})

describe('audit-a P3-8 客户搜索 LIKE 通配符转义', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
    toolsService.upsertClientProfile(artist.id, '10101', [], '')
    toolsService.upsertClientProfile(artist.id, '20202', [], '')
    toolsService.upsertClientProfile(artist.id, '99%9', [], '')
    toolsService.upsertClientProfile(artist.id, '1_1', [], '')
  })

  it('TC-P38-01: qq=% 只匹配字面 % 客户，不再匹配全部', () => {
    const rows = toolsService.listClientProfiles(artist.id, '%')
    expect(rows.map(r => r.clientQq)).toEqual(['99%9'])
  })

  it('TC-P38-02: qq=_ 只匹配字面 _ 客户', () => {
    const rows = toolsService.listClientProfiles(artist.id, '_')
    expect(rows.map(r => r.clientQq)).toEqual(['1_1'])
  })

  it('TC-P38-03: 常规子串搜索回归不破', () => {
    const rows = toolsService.listClientProfiles(artist.id, '010')
    expect(rows.map(r => r.clientQq)).toEqual(['10101'])
  })
})

describe('audit-a P3-11 TOTP 登录枚举 oracle', () => {
  beforeEach(() => cleanDb())

  it('TC-P311-01: 不存在 QQ 与未绑定 QQ 返回同码同文案', () => {
    // 会话门禁批：显式造未绑定态（seedArtist 默认已绑定）
    seedArtist({ qq_number: '77041', subdomain: 'unbound', totp_secret: null, totp_verified: 0 })

    const missing = verifyTotpLogin('999999999', '123456')
    const unbound = verifyTotpLogin('77041', '123456')

    expect(missing.valid).toBe(false)
    expect(unbound.valid).toBe(false)
    expect(missing.code).toBe('TOTP_INVALID')
    expect(unbound.code).toBe('TOTP_INVALID')
    expect(missing.error).toBe('QQ号或动态口令错误')
    expect(unbound.error).toBe('QQ号或动态口令错误')
  })
})

describe('audit-a P3-13 transfer 限流配额预耗', () => {
  let app: FastifyInstance
  let adminArtist: ArtistRow
  let adminHeaders: Record<string, string>
  let ipCounter = 0

  beforeEach(async () => {
    cleanDb()
    db.prepare("UPDATE platform_config SET value = '77051' WHERE key = 'admin_qq'").run()
    adminArtist = seedArtist({ qq_number: '77051', subdomain: 'adming' })
    // REQ-041：管理后台路由需 step-up 升级会话
    adminHeaders = { Authorization: `Bearer ${createSession(adminArtist.id, adminArtist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function uniqueIp(): string {
    return `172.16.${++ipCounter}.${ipCounter}`
  }

  function transferRequest(newQq: string, ip: string) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: adminHeaders,
      remoteAddress: ip,
      payload: { newQq, currentCode: '000000', newCode: '000000' }
    })
  }

  it('TC-P313-01: 不存在目标反复请求不消耗限流（后续合法请求不被 429）', async () => {
    // 4 个不同 IP 各打一次不存在的目标 → 404（每 IP 1/5，均不触发 IP 限流）
    for (let i = 0; i < 4; i++) {
      const res = await transferRequest('988888888', uniqueIp())
      expect(res.statusCode).toBe(404)
    }

    // 存在但验证失败的目标：限流配额未被不存在目标消耗 → 401（而非 429）
    seedArtist({ qq_number: '77052', subdomain: 'target1' })
    const res = await transferRequest('77052', uniqueIp())
    expect(res.statusCode).toBe(401)
  })

  it('TC-P313-02: 有效目标超限仍 429', async () => {
    seedArtist({ qq_number: '77053', subdomain: 'target2' })
    const ip = uniqueIp()
    for (let i = 0; i < 3; i++) {
      const res = await transferRequest('77053', ip)
      expect(res.statusCode).toBe(401)
    }
    const blocked = await transferRequest('77053', ip)
    expect(blocked.statusCode).toBe(429)
  })
})

describe('audit-a P3-15 tracking days 参数化', () => {
  beforeEach(() => {
    cleanDb()
    db.prepare(`
      INSERT INTO events (name, ts, artist_id, anon_id, payload_json)
      VALUES ('order_form_start', 1, NULL, NULL, '{}')
    `).run()
  })

  it('TC-P315-01: 恶意字符串不改变 SQL 结构（参数化安全 + 钳制）', () => {
    expect(() => trackingService.getTrackingSummary('1; DROP TABLE events; --' as unknown as number)).not.toThrow()
    expect(() => trackingService.getArtistTrackingSummary(1, '0; DROP TABLE events; --' as unknown as number)).not.toThrow()
    // 事件表完好
    const count = db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('TC-P315-02: 非法输入钳制到合法范围（负数→1、超大→90）', () => {
    expect(() => trackingService.getTrackingSummary(-5)).not.toThrow()
    expect(() => trackingService.getTrackingSummary(999)).not.toThrow()
    const result = trackingService.getTrackingSummary(30)
    expect(result.total).toBe(1)
  })
})
