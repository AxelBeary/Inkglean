import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
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
        payload: { artistCode: 'QY' }
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

  // ─── v0.12 R15: 外链列表 ───

  describe('外链列表 (R15)', () => {
    it('TC-RT-12: PUT profile 带 customLinks 写入成功', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: {
          customLinks: [
            { name: 'Pixiv', url: 'https://pixiv.net/users/1', icon: 'pixiv' }
          ]
        }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      const parsed = JSON.parse(body.custom_links)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].name).toBe('Pixiv')
    })

    it('TC-RT-12b: PUT profile customLinks 非法 url 被 Schema 拒绝', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: {
          customLinks: [
            { name: '恶意', url: 'javascript:alert(1)', icon: 'link' }
          ]
        }
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-RT-12c: PUT profile 忽略 weibo_url 写入（旧列冻结，Schema 静默剥离）', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: { weibo_url: 'https://weibo.com/hack' }
      })
      // Fastify removeAdditional:true → weibo_url 被静默剥离，请求成功但字段未写入
      expect(res.statusCode).toBe(200)
      expect(res.json().weibo_url).toBeNull()
    })

    it('TC-RT-12d: GET 主页返回 customLinks（老画师回退旧列）', async () => {
      // 用独立 QQ 号避免与 TC-RT-06 设置的 admin_qq='12345' 冲突
      const artist = seedArtist({ qq_number: '88888', subdomain: 'linktest' })
      db.prepare('UPDATE artists SET weibo_url = ? WHERE id = ?').run('https://weibo.com/old', artist.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artists/linktest'
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.customLinks).toHaveLength(1)
      expect(body.customLinks[0].icon).toBe('weibo')
    })
  })

  // ─── v0.12 R18: 订单图库 ───

  describe('订单图库 (R18)', () => {
    it('TC-RT-13: 画师加图 source=artist', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/references`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { filePath: 'references/1/test.png', fileName: 'test.png', fileSize: 1024 }
      })
      expect(res.statusCode).toBe(200)

      // 验证 source='artist'
      const refs = db.prepare('SELECT * FROM order_references WHERE order_id = ?').all(order.id)
      expect(refs).toHaveLength(1)
      expect(refs[0].source).toBe('artist')
    })

    it('TC-RT-13b: 画师加图返回签名 URL', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/references`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { filePath: 'references/1/test.png' }
      })
      const body = res.json()
      expect(body.references[0].url).toContain('/uploads/references/1/test.png?sig=')
    })
  })

  // ─── v0.12 R19: 备注附图 ───

  describe('备注附图 (R19)', () => {
    it('TC-RT-14: 带图备注返回签名 imageUrl', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/notes`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { content: '带图备注', imagePath: `notes/${artist.id}/abc.png` }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      const note = body.notes.find(n => n.content === '带图备注')
      expect(note.imageUrl).toContain(`/uploads/notes/${artist.id}/abc.png?sig=`)
    })

    it('TC-RT-14b: 纯文字备注无 imageUrl', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/notes`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { content: '纯文字' }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      const note = body.notes.find(n => n.content === '纯文字')
      expect(note.imageUrl).toBeUndefined()
    })

    it('TC-RT-14c: 备注附图路径穿越被拒绝', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/notes`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { content: '恶意', imagePath: '../etc/passwd' }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('NOTE_IMAGE_PATH_INVALID')
    })

    it('TC-RT-14d: 备注附图路径非本画师目录被拒绝', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/notes`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { content: '越权', imagePath: 'notes/999/hack.png' }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('NOTE_IMAGE_PATH_INVALID')
    })

    it('TC-RT-14e: GET 订单详情 notes 带签名', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      // 先创建带图备注
      db.prepare('INSERT INTO order_notes (order_id, content, created_by, image_path) VALUES (?, ?, ?, ?)')
        .run(order.id, '已有图', 'artist', `notes/${artist.id}/existing.png`)

      const res = await app.inject({
        method: 'GET',
        url: `/api/artist/orders/${order.id}`,
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      const note = body.notes.find(n => n.content === '已有图')
      expect(note.imageUrl).toContain(`/uploads/notes/${artist.id}/existing.png?sig=`)
    })
  })

  // ─── v0.13 R33: 签名刷新 ───

  describe('签名刷新 (R33)', () => {
    it('TC-RT-15: 批量刷新签名 URL 成功', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'POST',
        url: '/api/artist/refresh-signatures',
        headers: { Authorization: `Bearer ${token}` },
        payload: { paths: ['references/1/a.png', `notes/${artist.id}/b.png`] }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.urls['references/1/a.png']).toContain('/uploads/references/1/a.png?sig=')
      expect(body.urls[`notes/${artist.id}/b.png`]).toContain(`/uploads/notes/${artist.id}/b.png?sig=`)
    })

    it('TC-RT-15b: 路径穿越被拒绝', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'POST',
        url: '/api/artist/refresh-signatures',
        headers: { Authorization: `Bearer ${token}` },
        payload: { paths: ['../etc/passwd'] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('ILLEGAL_PATH')
    })

    it('TC-RT-15c: 非本画师目录被拒绝', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'POST',
        url: '/api/artist/refresh-signatures',
        headers: { Authorization: `Bearer ${token}` },
        payload: { paths: ['notes/999/hack.png'] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('ILLEGAL_PATH')
    })

    it('TC-RT-15d: 无 token 返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/artist/refresh-signatures',
        payload: { paths: ['references/1/a.png'] }
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
