import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'

/**
 * v0.25 路由层集成测试
 * 来源：五号审计报告 B3（4 个新功能缺路由层测试）+ B1（send-code 防枚举）
 * 全部使用 app.inject() 验证完整 HTTP 链路（鉴权 + 参数校验 + 序列化）
 */
describe('v0.25 路由层集成测试', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── B3-1: 收款 API 路由层 ───

  describe('B3-1: 收款 API (POST/GET /api/artist/orders/:id/payments)', () => {
    it('TC-ROUTE-01: POST 记录收款 → 200 + paidTotalCents 累加', async () => {
      const artist = seedArtist()
      const order = seedOrder(artist.id, { status: 'confirmed' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/payments`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { amountCents: 10000, note: '定金' }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.payment.amount_cents).toBe(10000)
      expect(body.paidTotalCents).toBe(10000)
    })

    it('TC-ROUTE-02: POST 无 token → 401', async () => {
      const artist = seedArtist()
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/payments`,
        payload: { amountCents: 5000 }
      })
      expect(res.statusCode).toBe(401)
    })

    it('TC-ROUTE-03: POST 非归属订单 → 404（requireOwnOrder 统一 404）', async () => {
      const artistA = seedArtist({ qq_number: '111', subdomain: 'aaa' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bbb' })
      const order = seedOrder(artistA.id)
      const tokenB = createSession(artistB.id, artistB.token_version)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/payments`,
        headers: { Authorization: `Bearer ${tokenB}` },
        payload: { amountCents: 5000 }
      })
      // 发现：requireOwnOrder 对非归属订单抛 ORDER_NOT_FOUND(404)，非 403
      expect(res.statusCode).toBe(404)
    })

    it('TC-ROUTE-04: GET 收款流水列表（含负数撤销记录）', async () => {
      const artist = seedArtist()
      const order = seedOrder(artist.id, { status: 'confirmed' })
      const token = createSession(artist.id, artist.token_version)

      // 记录两笔正数 + 一笔负数
      for (const [amount, note] of [[10000, '定金'], [20000, '中期'], [-5000, '退款']] as Array<[number, string]>) {
        await app.inject({
          method: 'POST',
          url: `/api/artist/orders/${order.id}/payments`,
          headers: { Authorization: `Bearer ${token}` },
          payload: { amountCents: amount, note }
        })
      }

      const res = await app.inject({
        method: 'GET',
        url: `/api/artist/orders/${order.id}/payments`,
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const payments = res.json().payments
      expect(payments).toHaveLength(3)
      expect(payments.some((p: { amount_cents: number }) => p.amount_cents === -5000)).toBe(true)
    })
  })

  // ─── B3-2: 留言路由层 ───

  describe('B3-2: 留言路由 (GET /api/artist/messages)', () => {
    it('TC-ROUTE-05: GET 返回全部留言（含 pending/approved/rejected）', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)

      guestbookService.createMessage(artist.id, '用户A', '待审核') // 制造一条未审核留言（副作用即目的）
      const m2 = guestbookService.createMessage(artist.id, '用户B', '已通过')!
      guestbookService.approveMessage(artist.id, m2.id)
      const m3 = guestbookService.createMessage(artist.id, '用户C', '被拒绝')!
      guestbookService.rejectMessage(artist.id, m3.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/messages',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const messages = res.json().items // F-2（P3-21）: 响应改为分页结构 { items, total, page, pageSize }
      expect(messages).toHaveLength(3)
      expect(messages.some((m: { status: string }) => m.status === 'pending')).toBe(true)
      expect(messages.some((m: { status: string }) => m.status === 'approved')).toBe(true)
      expect(messages.some((m: { status: string }) => m.status === 'rejected')).toBe(true)
    })

    it('TC-ROUTE-06: GET 无 token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/artist/messages' })
      expect(res.statusCode).toBe(401)
    })

    it('TC-ROUTE-07: GET 画师隔离——不返回他人留言', async () => {
      const artistA = seedArtist({ qq_number: '111', subdomain: 'aaa' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bbb' })
      const tokenA = createSession(artistA.id, artistA.token_version)

      guestbookService.createMessage(artistA.id, '用户', 'A的留言')
      guestbookService.createMessage(artistB.id, '用户', 'B的留言')

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/messages',
        headers: { Authorization: `Bearer ${tokenA}` }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().items).toHaveLength(1) // F-2（P3-21）: 分页结构
    })
  })

  // ─── B3-3: 仪表盘路由层 ───

  describe('B3-3: 仪表盘路由 (GET /api/artist/dashboard/*)', () => {
    it('TC-ROUTE-08: GET revenue → 200 + 结构校验（bars/summary/period）', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/dashboard/revenue?period=month',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('bars')
      expect(body).toHaveProperty('summary')
      expect(body).toHaveProperty('period')
    })

    it('TC-ROUTE-09: GET revenue 无 token → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/revenue' })
      expect(res.statusCode).toBe(401)
    })

    it('TC-ROUTE-10: GET todo → 200 + items 数组', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/dashboard/todo',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('items')
      expect(Array.isArray(body.items)).toBe(true)
    })
  })

  // ─── B3-4: 快捷按钮路由层 ───

  describe('B3-4: 快捷按钮路由 (PUT/GET profile quickActions)', () => {
    it('TC-ROUTE-11: PUT profile 含 quickActions → 200 + DB 持久化', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: { quickActions: ['order', 'queue'] }
      })
      expect(res.statusCode).toBe(200)
      const fresh = db.prepare('SELECT quick_actions FROM artists WHERE id = ?').get(artist.id) as { quick_actions: string | null }
      expect(fresh.quick_actions).toBe(JSON.stringify(['order', 'queue']))
    })

    it('TC-ROUTE-12: GET profile 返回 quick_actions 字段（DB 直设后可读）', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)

      // 绕过路由直接 DB 设置（模拟迁移 v26 后的状态）
      db.prepare('UPDATE artists SET quick_actions = ? WHERE id = ?')
        .run(JSON.stringify(['order', 'queue']), artist.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().quick_actions).toBe(JSON.stringify(['order', 'queue']))
    })
  })

  // ─── B1: 登录防枚举路由层（REQ-027：verify 替代旧 send-code） ───

  describe('B1: 登录防枚举', () => {
    it('TC-ROUTE-13: 不存在的 QQ 登录 → 401 且不泄露注册状态（与码错误同响应）', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { qqNumber: '99999', code: '123456' }
      })
      expect(res.statusCode).toBe(401)
      const body = res.json()
      expect(body.code).toBe('TOTP_INVALID')
      expect(body.error).not.toContain('注册')
    })

    it('TC-ROUTE-14: 已注册但未绑定 TOTP → 与码错误同码同文案（audit-a P3-11 防枚举）', async () => {
      // 会话门禁批：显式造未绑定态（seedArtist 默认已绑定）
      const artist = seedArtist({ qq_number: '88001', subdomain: 'bind-hint', totp_secret: null, totp_verified: 0 })
      expect(artist.id).toBeTruthy()
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { qqNumber: '88001', code: '123456' }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('TOTP_INVALID')
      expect(res.json().error).toBe('QQ号或动态口令错误')
    })
  })
})
