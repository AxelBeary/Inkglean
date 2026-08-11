import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/** 在测试 uploads 目录造一个真实参考图文件（P2-12 存在性校验需要） */
function createReferenceFile(relPath) {
  const abs = join(process.env.UPLOAD_DIR, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'fake-image')
  return relPath
}

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
      // REQ-041：管理后台路由需 step-up 升级会话
      const token = createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() })

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
    it('TC-RT-08: 登录接口限流生效（10次/5分钟）', async () => {
      // 独立 QQ 号避免与 TC-RT-06 设置的 admin_qq='12345' 冲突
      seedArtist({ qq_number: '77001', subdomain: 'rt-limit' })

      // 连续请求 11 次（限流阈值是 10）— 业务结果无关，限流独立判断
      const responses = []
      for (let i = 0; i < 11; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/verify',
          payload: { qqNumber: '77001', code: '000000' }
        })
        responses.push(res.statusCode)
      }

      // 前 10 次应该是 401（业务拒绝），第 11 次应该是 429（限流）
      expect(responses.slice(0, 10)).toEqual(Array(10).fill(401))
      expect(responses[10]).toBe(429)
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

    it('TC-RT-20: 重置工作流被活跃订单拦截 — 消息已插值 {count}（Bug#reset-count-placeholder）', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      seedArtistStages(artist.id)
      seedOrder(artist.id, { status: 'wip' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'POST',
        url: '/api/artist/workflow/reset',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.code).toBe('STAGES_RESET_BLOCKED')
      // 占位符必须被 detail.count 插值，不允许裸 {count} 直出
      expect(body.error).not.toContain('{count}')
      expect(body.error).toContain('1')
      expect(body.detail).toEqual({ count: 1 })
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

  // ─── v0.12 R15 → REQ-022 F2: 外链列表（新结构 [{platformId, url}]） ───

  describe('外链列表 (R15/F2)', () => {
    it('TC-RT-12: PUT profile 带 customLinks 写入成功（新结构）', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: 'Bear' + `er ${token}` },
        payload: {
          customLinks: [
            { url: 'https://pixiv.net/users/1' }
          ]
        }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      const parsed = JSON.parse(body.custom_links)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].url).toBe('https://pixiv.net/users/1')
      // 无平台表数据时 platformId 为 null（归「其他」）
      expect(parsed[0].platformId).toBeNull()
    })

    it('TC-RT-12b: PUT profile customLinks 非法 url 被 service 层拒绝（400 LINK_URL_INVALID）', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: 'Bear' + `er ${token}` },
        payload: {
          customLinks: [
            { url: 'javascript:alert(1)' }
          ]
        }
      })
      // schema 无 pattern 约束（裸链需放行），由 service 层 normalizeLinkUrl 拒绝
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('LINK_URL_INVALID')
    })

    it('TC-RT-12c: PUT profile 忽略 weibo_url 写入（旧列冻结，Schema 静默剥离）', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: 'Bear' + `er ${token}` },
        payload: { weibo_url: 'https://weibo.com/hack' }
      })
      // Fastify removeAdditional:true → weibo_url 被静默剥离，请求成功但字段未写入
      expect(res.statusCode).toBe(200)
      // 安全加固批 F1：写路径回显走 DTO，遗留列 weibo_url 从响应整体剔除（不再是 null 而是不存在）
      expect('weibo_url' in res.json()).toBe(false)
      // 原意保留：数据库列未被写入
      const row = db.prepare('SELECT weibo_url FROM artists WHERE id = ?').get(artist.id)
      expect(row.weibo_url).toBeNull()
    })

    it('TC-RT-12d: GET 主页 customLinks 不回退旧列（REQ-022 F2 拍板删除回退）', async () => {
      // 用独立 QQ 号避免与 TC-RT-06 设置的 admin_qq='12345' 冲突
      const artist = seedArtist({ qq_number: '88888', subdomain: 'linktest' })
      db.prepare('UPDATE artists SET weibo_url = ? WHERE id = ?').run('https://weibo.com/old', artist.id)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artists/linktest'
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      // 旧列残留值不再回退为链接；weiboUrl/bilibiliUrl 字段已从响应移除
      expect(body.customLinks).toEqual([])
      expect(body).not.toHaveProperty('weiboUrl')
      expect(body).not.toHaveProperty('bilibiliUrl')
    })
  })

  // ─── v0.12 R18: 订单图库 ───

  describe('订单图库 (R18)', () => {
    it('TC-RT-13: 画师加图 source=artist', async () => {
      const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)
      createReferenceFile('references/1/test.png')

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
      createReferenceFile('references/1/test.png')

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
      // P2-#20: references/ 路径需归属校验，补建订单+参考图记录
      const order = seedOrder(artist.id)
      db.prepare('INSERT INTO order_references (order_id, file_path, original_name, file_size, source) VALUES (?, ?, ?, ?, ?)')
        .run(order.id, 'references/1/a.png', 'a.png', 100, 'artist')

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

  // ─── UI-8: hidden 状态 ───

  describe('hidden 状态 (UI-8)', () => {
    it('TC-RT-16: hidden 画师主页只返回最小信息', async () => {
      // 用独立 QQ 号避免与 TC-RT-06 设置的 admin_qq='12345' 冲突
      const artist = seedArtist({ qq_number: '77777', subdomain: 'hidden-test' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({ method: 'GET', url: '/api/artists/hidden-test' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('hidden')
      expect(body.name).toBe('测试画师')
      expect(body.bio).toBeUndefined()
      expect(body.tiers).toBeUndefined()
      expect(body.artworks).toBeUndefined()
      expect(body.rules).toBeUndefined()
    })

    it('TC-RT-16b: hidden 画师拒绝客户下单（audit-a P2-7 统一 404 不泄露存在性）', async () => {
      const artist = seedArtist({ qq_number: '77778', subdomain: 'hidden-order' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: '/api/orders',
        payload: { subdomain: 'hidden-order', clientQq: '123456', agreeRules: true }
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('ARTIST_NOT_FOUND')
    })

    it('TC-RT-16c: 画师本人可设置 hidden 状态', async () => {
      const artist = seedArtist({ qq_number: '77779', subdomain: 'hidden-set' })
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` },
        payload: { status: 'hidden' }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('hidden')
    })

    it('TC-RT-16d: hidden 画师后台接口不受影响', async () => {
      const artist = seedArtist({ qq_number: '77780', subdomain: 'hidden-admin' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)
      const token = createSession(artist.id, artist.token_version)

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('hidden')
    })

    // P1-1 审计修复：hidden 画师不出现在公开接口
    it('TC-RT-16e: hidden 画师不出现在 /api/artists 列表', async () => {
      seedArtist({ qq_number: '77781', subdomain: 'hidden-list' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE qq_number = '77781'").run()
      seedArtist({ qq_number: '77782', subdomain: 'visible-list' })

      const res = await app.inject({ method: 'GET', url: '/api/artists' })
      expect(res.statusCode).toBe(200)
      const list = res.json()
      expect(list.some(a => a.subdomain === 'hidden-list')).toBe(false)
      expect(list.some(a => a.subdomain === 'visible-list')).toBe(true)
    })

    it('TC-RT-16f: hidden 画师公开流程返回 404', async () => {
      const artist = seedArtist({ qq_number: '77783', subdomain: 'hidden-wf' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({ method: 'GET', url: '/api/artists/hidden-wf/workflow' })
      expect(res.statusCode).toBe(404)
    })

    it('TC-RT-16g: hidden 画师公开报价返回 404', async () => {
      const artist = seedArtist({ qq_number: '77784', subdomain: 'hidden-price' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({ method: 'GET', url: '/api/public/pricing/hidden-price' })
      expect(res.statusCode).toBe(404)
    })

    // BUG-3 审计修复：公开算价/折扣码验证/点赞的 hidden 过滤

    it('TC-RT-21: hidden 画师公开算价返回 404（BUG-3）', async () => {
      const artist = seedArtist({ qq_number: '77785', subdomain: 'hidden-calc' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: '/api/public/calculate-style-price',
        payload: { subdomain: 'hidden-calc', styleSizeId: 1 }
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('ARTIST_NOT_FOUND')
    })

    it('TC-RT-22: hidden 画师折扣码验证返回 404（BUG-3）', async () => {
      const artist = seedArtist({ qq_number: '77786', subdomain: 'hidden-disc' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: '/api/public/validate-discount',
        payload: { subdomain: 'hidden-disc', code: 'TEST10' }
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('ARTIST_NOT_FOUND')
    })

    it('TC-RT-23: hidden 画师作品点赞/取消返回 404（BUG-3）', async () => {
      const artist = seedArtist({ qq_number: '77787', subdomain: 'hidden-like' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)
      const artworkId = Number(db.prepare(
        'INSERT INTO artworks (artist_id, image_path, title, sort_order, like_count) VALUES (?, ?, ?, ?, ?)'
      ).run(artist.id, `images/${artist.id}/hidden-work.png`, '测试作品', 1, 5).lastInsertRowid)

      const likeRes = await app.inject({ method: 'POST', url: `/api/public/artworks/${artworkId}/like` })
      expect(likeRes.statusCode).toBe(404)

      const unlikeRes = await app.inject({ method: 'DELETE', url: `/api/public/artworks/${artworkId}/like` })
      expect(unlikeRes.statusCode).toBe(404)

      // 点赞数未被改动
      const row = db.prepare('SELECT like_count FROM artworks WHERE id = ?').get(artworkId)
      expect(row.like_count).toBe(5)
    })

    it('TC-RT-28: hidden 画师画风算价返回 404（BUG-3 遗留）', async () => {
      const artist = seedArtist({ qq_number: '77788', subdomain: 'hidden-style-calc' })
      db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)

      const res = await app.inject({
        method: 'POST',
        url: '/api/public/calculate-style-price',
        payload: { subdomain: 'hidden-style-calc', styleSizeId: 1 }
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('ARTIST_NOT_FOUND')
    })
  })

  // ─── v0.14: 启用流程跟踪 ───

  describe('启用流程跟踪 (track-on)', () => {
    it('TC-RT-17: 正常启用返回 200 + stageInfo', async () => {
      const artist = seedArtist({ qq_number: '77801', subdomain: 'track-test' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id) // current_stage_id=null
      seedArtistStages(artist.id)

      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/track-on`,
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.currentStageId).not.toBeNull()
      expect(body.currentStageName).toBe('定稿')
      expect(body.stageProgress).toEqual({ current: 1, total: 7 })
      expect(body.status).toBe('pending') // seedOrder 默认 pending，不变
    })

    it('TC-RT-17b: 已有跟踪返回 409', async () => {
      const artist = seedArtist({ qq_number: '77802', subdomain: 'track-409' })
      const token = createSession(artist.id, artist.token_version)
      seedArtistStages(artist.id)
      const order = seedOrder(artist.id)
      // 手动设 current_stage_id 模拟已有跟踪
      const firstStage = db.prepare(
        'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
      ).get(artist.id)
      db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(firstStage.id, order.id)

      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/track-on`,
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('TRACK_ALREADY_ON')
    })

    it('TC-RT-17c: 无工作流模板返回 400', async () => {
      const artist = seedArtist({ qq_number: '77803', subdomain: 'track-400' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id) // 无工作流

      const res = await app.inject({
        method: 'PUT',
        url: `/api/artist/orders/${order.id}/track-on`,
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('NO_WORKFLOW_TEMPLATE')
    })

    it('TC-RT-17d: 无 token 返回 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/orders/1/track-on'
      })
      expect(res.statusCode).toBe(401)
    })
  })
  // ─── v0.15 R46: 备注删除路由 ───

  describe('备注删除 (R46 DELETE notes)', () => {
    it('TC-RT-18: 正常删除备注返回 200', async () => {
      const artist = seedArtist({ qq_number: '77810', subdomain: 'note-del' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, '画师备注', 'artist')").run(order.id)
      const note = db.prepare('SELECT id FROM order_notes WHERE order_id = ?').get(order.id)

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/artist/orders/${order.id}/notes/${note.id}`,
        headers: { Authorization: `${'Bearer '}${token}` }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().notes).toHaveLength(0)
    })

    it('TC-RT-18b: 删除系统备注返回 403', async () => {
      const artist = seedArtist({ qq_number: '77811', subdomain: 'note-sys' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, '系统记录', 'system')").run(order.id)
      const note = db.prepare('SELECT id FROM order_notes WHERE order_id = ?').get(order.id)

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/artist/orders/${order.id}/notes/${note.id}`,
        headers: { Authorization: `${'Bearer '}${token}` }
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().code).toBe('SYSTEM_NOTE_PROTECTED')
    })

    it('TC-RT-18c: 非本画师订单返回 404', async () => {
      const artistA = seedArtist({ qq_number: '77812', subdomain: 'note-a' })
      const artistB = seedArtist({ qq_number: '77813', subdomain: 'note-b' })
      const tokenA = createSession(artistA.id, artistA.token_version)
      const orderB = seedOrder(artistB.id)
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, 'B的备注', 'artist')").run(orderB.id)
      const note = db.prepare('SELECT id FROM order_notes WHERE order_id = ?').get(orderB.id)

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/artist/orders/${orderB.id}/notes/${note.id}`,
        headers: { Authorization: `${'Bearer '}${tokenA}` }
      })
      expect(res.statusCode).toBe(404)
    })

    it('TC-RT-18d: 删除不存在的备注返回 404', async () => {
      const artist = seedArtist({ qq_number: '77814', subdomain: 'note-404' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id)

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/artist/orders/${order.id}/notes/99999`,
        headers: { Authorization: `${'Bearer '}${token}` }
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('NOTE_NOT_FOUND')
    })
  })
  // ─── 补充：note-image 上传测试（五号审计） ───

  describe('备注附图上传 (note-image)', () => {
    /** 构造 multipart/form-data 请求体 */
    function multipartBody(filename, contentType, content) {
      const boundary = '----TestBoundary' + Date.now()
      const parts = [
        '--' + boundary,
        'Content-Disposition: form-data; name="file"; filename="' + filename + '"',
        'Content-Type: ' + contentType,
        '',
        content,
        '--' + boundary + '--'
      ]
      return {
        boundary,
        body: parts.join('\r\n')
      }
    }

    it('TC-RT-19: note-image 正常上传返回签名 URL', async () => {
      const artist = seedArtist({ qq_number: '77820', subdomain: 'note-img' })
      const token = createSession(artist.id, artist.token_version)

      const { boundary, body } = multipartBody('test.png', 'image/png', 'fake-png-data')
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/note-image',
        headers: {
          Authorization: `${'Bearer '}${token}`,
          'content-type': 'multipart/form-data; boundary=' + boundary
        },
        payload: body
      })
      expect(res.statusCode).toBe(200)
      const json = res.json()
      expect(json.filePath).toContain('notes/' + artist.id + '/')
      expect(json.url).toContain('/uploads/notes/' + artist.id + '/')
      expect(json.url).toContain('?sig=')
      expect(json.mimeType).toBe('image/png')
    })

    it('TC-RT-19b: note-image 拒绝非图片格式', async () => {
      const artist = seedArtist({ qq_number: '77821', subdomain: 'note-bad' })
      const token = createSession(artist.id, artist.token_version)

      const { boundary, body } = multipartBody('evil.html', 'text/html', '<script>alert(1)</script>')
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/note-image',
        headers: {
          Authorization: `${'Bearer '}${token}`,
          'content-type': 'multipart/form-data; boundary=' + boundary
        },
        payload: body
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-RT-19c: note-image 无 token 返回 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/upload/note-image'
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ─── 方案 B: 无文件交付（修复工作流订单最后节点交付卡死） ───

  describe('无文件交付 (deliver-no-file)', () => {
    it('TC-RT-24: done 订单无文件交付成功 → delivered', async () => {
      const artist = seedArtist({ qq_number: '77830', subdomain: 'nofile-del' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id, { status: 'done' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/deliver-no-file`,
        headers: { Authorization: 'Bearer ' + token }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('delivered')
      expect(res.json().statusChanged).toBe(true)

      // 系统备注留痕
      const note = db.prepare("SELECT content FROM order_notes WHERE order_id = ? AND created_by = 'system'").get(order.id)
      expect(note.content).toContain('无需交付文件')
    })

    it('TC-RT-25: pending 订单无文件交付被拒（统一状态机断言 INVALID_TRANSITION）', async () => {
      const artist = seedArtist({ qq_number: '77831', subdomain: 'nofile-pend' })
      const token = createSession(artist.id, artist.token_version)
      const order = seedOrder(artist.id, { status: 'pending' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/deliver-no-file`,
        headers: { Authorization: 'Bearer ' + token }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('INVALID_TRANSITION')
    })

    it('TC-RT-26: 无 token 返回 401', async () => {
      const artist = seedArtist({ qq_number: '77832', subdomain: 'nofile-auth' })
      const order = seedOrder(artist.id, { status: 'done' })
      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/deliver-no-file`
      })
      expect(res.statusCode).toBe(401)
    })

    it('TC-RT-27: 越权——其他画师不能交付他人订单', async () => {
      const owner = seedArtist({ qq_number: '77833', subdomain: 'nofile-owner' })
      const other = seedArtist({ qq_number: '77834', subdomain: 'nofile-other' })
      const token = createSession(other.id, other.token_version)
      const order = seedOrder(owner.id, { status: 'done' })

      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/deliver-no-file`,
        headers: { Authorization: 'Bearer ' + token }
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
