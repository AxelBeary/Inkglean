import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as artistService from '../src/features/artist/artist.service.js'

/**
 * v0.26 路由层集成测试
 * 覆盖 v0.26 新增两个路由：
 *   - PUT /api/artist/tiers/reorder（档位拖拽排序）
 *   - PUT /api/artist/orders/:id/start-date（开工日设置/清除）
 * 全部使用 app.inject() 验证完整 HTTP 链路（鉴权 + schema 校验 + 错误码 + 序列化）
 */
describe('v0.26 路由层集成测试', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  // ─── PUT /api/artist/tiers/reorder ───

  describe('档位排序 (PUT /api/artist/tiers/reorder)', () => {
    it('TC-RI-01: 正常排序 → 200 + 返回新顺序', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)
      const t1 = artistService.createTier(artist.id, { name: '头像', price: 50 })
      const t2 = artistService.createTier(artist.id, { name: '半身', price: 100 })
      const t3 = artistService.createTier(artist.id, { name: '全身', price: 200 })

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/tiers/reorder',
        headers: { Authorization: `Bearer ${token}` },
        payload: { ids: [t3.id, t2.id, t1.id] }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveLength(3)
      expect(body[0].id).toBe(t3.id)
      expect(body[1].id).toBe(t2.id)
      expect(body[2].id).toBe(t1.id)
      // sort_order 从 1 开始递增
      expect(body[0].sort_order).toBe(1)
      expect(body[1].sort_order).toBe(2)
      expect(body[2].sort_order).toBe(3)
    })

    it('TC-RI-02: 未登录 → 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/tiers/reorder',
        payload: { ids: [1, 2] }
      })
      expect(res.statusCode).toBe(401)
    })

    it('TC-RI-03: ids 长度不匹配 → 400 + REORDER_LENGTH', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)
      artistService.createTier(artist.id, { name: 'A', price: 10 })
      artistService.createTier(artist.id, { name: 'B', price: 20 })

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/tiers/reorder',
        headers: { Authorization: `Bearer ${token}` },
        payload: { ids: [1] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('REORDER_LENGTH')
    })

    it('TC-RI-04: 含他人档位 ID → 400 + REORDER_INVALID', async () => {
      const artistA = seedArtist({ qq_number: '111', subdomain: 'aaa' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bbb' })
      const tokenA = createSession(artistA.id, artistA.token_version)
      const t1 = artistService.createTier(artistA.id, { name: 'A', price: 10 })
      artistService.createTier(artistA.id, { name: 'B', price: 20 })
      const tOther = artistService.createTier(artistB.id, { name: 'X', price: 99 })

      // 长度匹配（2 个），但含他人 ID
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/tiers/reorder',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: { ids: [t1.id, tOther.id] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('REORDER_INVALID')
    })

    it('TC-RI-05: 重复 ID → 400 + REORDER_DUPLICATE', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)
      const t1 = artistService.createTier(artist.id, { name: 'A', price: 10 })
      artistService.createTier(artist.id, { name: 'B', price: 20 })

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/tiers/reorder',
        headers: { Authorization: `Bearer ${token}` },
        payload: { ids: [t1.id, t1.id] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('REORDER_DUPLICATE')
    })

    it('TC-RI-06: body 含多余字段 → 200（Fastify 默认剥离额外字段）', async () => {
      const artist = seedArtist()
      const token = createSession(artist.id, artist.token_version)
      const t1 = artistService.createTier(artist.id, { name: 'A', price: 10 })

      // Fastify ajv 默认 removeAdditional: true，多余字段被静默剥离而非拒绝
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/tiers/reorder',
        headers: { Authorization: `Bearer ${token}` },
        payload: { ids: [t1.id], hack: 'injected' }
      })
      expect(res.statusCode).toBe(200)
      // 排序正常生效，多余字段未影响业务逻辑
      expect(res.json()).toHaveLength(1)
      expect(res.json()[0].id).toBe(t1.id)
    })
  })

  // ─── PUT /api/artist/orders/:id/start-date ───

  describe('开工日 (PUT /api/artist/orders/:id/start-date)', () => {
    it('TC-RI-07: 正常设置 → 200 + start_date 持久化', async () => {
      const artist = seedArtist()
      const order = seedOrder(artist.id, { status: 'confirmed' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/start-date`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { startDate: '2026-08-15' }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      // updateStartDate 返回 getOrder 原始行（snake_case）
      expect(body.start_date).toBe('2026-08-15')
    })

    it('TC-RI-08: 清除（null）→ 200 + start_date 为 null', async () => {
      const artist = seedArtist()
      const order = seedOrder(artist.id, { status: 'confirmed' })
      const token = createSession(artist.id, artist.token_version)

      // 先设置
      await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/start-date`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { startDate: '2026-08-15' }
      })
      // 再清除
      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/start-date`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { startDate: null }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().start_date).toBeNull()
    })

    it('TC-RI-09: 非法日期格式 → 400', async () => {
      const artist = seedArtist()
      const order = seedOrder(artist.id, { status: 'confirmed' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/start-date`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { startDate: '2026/08/15' }
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-RI-10: 他人订单 → 404（requireOwnOrder 统一 404）', async () => {
      const artistA = seedArtist({ qq_number: '111', subdomain: 'aaa' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bbb' })
      const order = seedOrder(artistA.id, { status: 'confirmed' })
      const tokenB = createSession(artistB.id, artistB.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/start-date`,
        headers: { Authorization: `Bearer ${tokenB}` },
        payload: { startDate: '2026-08-15' }
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
