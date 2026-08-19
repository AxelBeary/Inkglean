import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

/**
 * v0.26 路由层集成测试
 * 覆盖 v0.26 新增路由：
 *   - PUT /api/artist/orders/:id/start-date（开工日设置/清除）
 * （档位拖拽排序 PUT /api/artist/tiers/reorder 已于 REQ-036 批B 删除：前端零调用死 API）
 * 全部使用 app.inject() 验证完整 HTTP 链路（鉴权 + schema 校验 + 错误码 + 序列化）
 */
describe('v0.26 路由层集成测试', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

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
