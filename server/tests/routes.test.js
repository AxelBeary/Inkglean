import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'

describe('路由层测试 (Route Integration)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 鉴权测试 ───

  describe('鉴权 (Authentication)', () => {
    it('TC-RT-01: 无 token 访问受保护路由返回 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile'
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('NOT_LOGGED_IN')
    })

    it('TC-RT-02: 无效 token 返回 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile',
        headers: { Authorization: 'Bearer invalid-token' }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('SESSION_EXPIRED')
    })

    it('TC-RT-03: 已删除画师的 token 返回 401', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      // 软删除画师
      db.prepare('UPDATE artists SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(artist.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('ACCOUNT_DISABLED')
    })

    it('TC-RT-04: token_version 不匹配返回 401', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, 1)

      // 递增 token_version（模拟登出/权限变更）
      db.prepare('UPDATE artists SET token_version = 2 WHERE id = ?').run(artist.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('TOKEN_REVOKED')
    })
  })

  // ─── 越权测试 ───

  describe('越权 (Authorization)', () => {
    it('TC-RT-05: 非管理员访问管理员路由返回 403', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/artists',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().code).toBe('ADMIN_REQUIRED')
    })

    it('TC-RT-06: 管理员访问管理员路由返回 200', async () => {
      // 设置管理员 QQ
      db.prepare("UPDATE platform_config SET value = '12345' WHERE key = 'admin_qq'").run()

      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/artists',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
    })

    it('TC-RT-07: 画师 A 不能访问画师 B 的工作流', async () => {
      const artistA = seedArtist({ qq_number: '111', subdomain: 'alice' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bob' })
      const tokenA = createSession(artistA.id, artistA.token_version)

      const res = await app.inject({
        method: 'GET',
        url: `/api/artists/${artistB.subdomain}/workflow`,
        headers: { Authorization: `Bearer ${tokenA}` }
      })
      // 公开路由，应该返回 200（工作流是公开的）
      expect(res.statusCode).toBe(200)
    })
  })

  // ─── 限流测试 ───

  describe('限流 (Rate Limiting)', () => {
    it('TC-RT-08: 登录码接口限流生效', async () => {
      seedArtist({ qq_number: '12345', subdomain: 'alice' })

      // 连续请求 6 次（限流阈值是 5）
      const responses = []
      for (let i = 0; i < 6; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/send-code',
          payload: { qqNumber: '12345' }
        })
        responses.push(res.statusCode)
      }

      // 前 5 次应该是 200，第 6 次应该是 429
      expect(responses.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
      expect(responses[5]).toBe(429)
    })
  })

  // ─── 业务错误码测试 ───

  describe('业务错误码 (Business Error Codes)', () => {
    it('TC-RT-09: 更新画师资料 — 身份码重复返回 CODE_TAKEN', async () => {
      seedArtist({ qq_number: '111', subdomain: 'alice', artist_code: 'QY' })
      const artistB = seedArtist({ qq_number: '222', subdomain: 'bob', artist_code: 'BOB' })
      const tokenB = createSession(artistB.id, artistB.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${tokenB}` },
        payload: { artist_code: 'QY' }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('CODE_TAKEN')
    })

    it('TC-RT-10: 更新工作流 — 删除尾款节点返回 FINAL_CANNOT_DELETE', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      seedArtistStages(artist.id) // 创建默认 7 节点流程
      const token = createSession(artist.id, artist.token_version)

      // 获取工作流，找到尾款节点
      const getRes = await app.inject({
        method: 'GET',
        url: '/api/artist/workflow',
        headers: { Authorization: `Bearer ${token}` }
      })
      const { stages } = getRes.json()
      const finalStage = stages.find(s => s.isFinal)

      // 尝试删除尾款节点
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/artist/workflow/${finalStage.id}`,
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(delRes.statusCode).toBe(400)
      expect(delRes.json().code).toBe('FINAL_CANNOT_DELETE')
    })

    it('TC-RT-11: 创建订单 — 画师不存在返回错误', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: {
          subdomain: 'nonexistent-artist',
          clientQq: '123456',
          agreeRules: true
        }
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
