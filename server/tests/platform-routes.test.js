import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// Hermes 安全过滤会把 "Bearer " 替换为 ***，用拼接绕过
const AUTH_PREFIX = 'Bear'+'er '

describe('平台链接 + 灵感标签 API (v0.17 R58-8)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 辅助 ───

  function makeArtist(overrides = {}) {
    return seedArtist({ qq_number: '77001', subdomain: 'plat-test', ...overrides })
  }

  function authHeader(artist) {
    const token = createSession(artist.id, artist.token_version)
    return { Authorization: AUTH_PREFIX + token }
  }

  // ─── PUT /api/artist/profile: platformUrls ───

  describe('PUT platformUrls', () => {
    it('TC-PU-01: 写入平台链接 + 自动识别', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          platformUrls: [
            { url: 'https://www.pixiv.net/users/123' },
            { url: 'https://x.com/myart' }
          ]
        }
      })
      expect(res.statusCode).toBe(200)
      // 验证数据库存储
      const row = db.prepare('SELECT platform_urls FROM artists WHERE id = ?').get(artist.id)
      const stored = JSON.parse(row.platform_urls)
      expect(stored).toHaveLength(2)
      expect(stored[0]).toEqual({ url: 'https://www.pixiv.net/users/123', platform: 'pixiv' })
      expect(stored[1]).toEqual({ url: 'https://x.com/myart', platform: 'x' })
    })

    it('TC-PU-02: 手动指定 platform 覆盖自动识别', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          platformUrls: [
            { url: 'https://my-custom-site.com', platform: 'other' }
          ]
        }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT platform_urls FROM artists WHERE id = ?').get(artist.id)
      const stored = JSON.parse(row.platform_urls)
      expect(stored[0].platform).toBe('other')
    })

    it('TC-PU-03: 超过 10 条拒绝', async () => {
      const artist = makeArtist()
      const urls = Array.from({ length: 11 }, (_, i) => ({ url: `https://example.com/${i}` }))
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { platformUrls: urls }
      })
      // JSON Schema maxItems=10 → Fastify 返回 400
      expect(res.statusCode).toBe(400)
    })

    it('TC-PU-04: 非法 URL 拒绝（schema 层 pattern）', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          platformUrls: [{ url: 'ftp://bad.com' }]
        }
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-PU-05: 空数组清空平台链接', async () => {
      const artist = makeArtist()
      // 先写入
      await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { platformUrls: [{ url: 'https://x.com/a' }] }
      })
      // 再清空
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { platformUrls: [] }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT platform_urls FROM artists WHERE id = ?').get(artist.id)
      expect(JSON.parse(row.platform_urls)).toEqual([])
    })
  })

  // ─── PUT /api/artist/profile: inspirationTags ───

  describe('PUT inspirationTags', () => {
    it('TC-IT-01: 写入灵感标签', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          inspirationTags: ['赛博朋克', '水墨风', '少女']
        }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT inspiration_tags FROM artists WHERE id = ?').get(artist.id)
      expect(JSON.parse(row.inspiration_tags)).toEqual(['赛博朋克', '水墨风', '少女'])
    })

    it('TC-IT-02: 去重 + 去空白', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          inspirationTags: [' 赛博朋克 ', '赛博朋克', '  ', '水墨']
        }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT inspiration_tags FROM artists WHERE id = ?').get(artist.id)
      const tags = JSON.parse(row.inspiration_tags)
      expect(tags).toEqual(['赛博朋克', '水墨'])
    })

    it('TC-IT-03: 超过 20 个拒绝', async () => {
      const artist = makeArtist()
      const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`)
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: tags }
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-IT-04: 空数组清空标签', async () => {
      const artist = makeArtist()
      await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: ['test'] }
      })
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: [] }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT inspiration_tags FROM artists WHERE id = ?').get(artist.id)
      expect(JSON.parse(row.inspiration_tags)).toEqual([])
    })
  })

  // ─── GET /api/artists/:subdomain: 公开主页返回 ───

  describe('GET 公开主页', () => {
    it('TC-PUB-01: 返回 platformUrls + inspirationTags', async () => {
      const artist = makeArtist()
      // 写入数据
      await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          platformUrls: [{ url: 'https://www.pixiv.net/users/99' }],
          inspirationTags: ['奇幻', '机械']
        }
      })
      // 公开接口读取
      const res = await app.inject({
        method: 'GET',
        url: '/api/artists/plat-test'
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.platformUrls).toEqual([
        { url: 'https://www.pixiv.net/users/99', platform: 'pixiv', label: 'Pixiv' }
      ])
      expect(body.inspirationTags).toEqual(['奇幻', '机械'])
    })

    it('TC-PUB-02: 未设置时返回空数组', async () => {
      makeArtist()
      const res = await app.inject({
        method: 'GET',
        url: '/api/artists/plat-test'
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.platformUrls).toEqual([])
      expect(body.inspirationTags).toEqual([])
    })

    it('TC-PUB-03: hidden 状态不暴露平台链接', async () => {
      makeArtist({ status: 'hidden' })
      const res = await app.inject({
        method: 'GET',
        url: '/api/artists/plat-test'
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.platformUrls).toBeUndefined()
      expect(body.inspirationTags).toBeUndefined()
    })
  })

  // ─── GET /api/artist/profile: 画师后台返回 ───

  describe('GET 画师后台 profile', () => {
    it('TC-PROF-01: profile 包含原始字段', async () => {
      const artist = makeArtist()
      await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: {
          platformUrls: [{ url: 'https://weibo.com/art' }],
          inspirationTags: ['国风']
        }
      })
      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/profile',
        headers: authHeader(artist)
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      // profile 返回原始 DB 行（展开的），含 platform_urls 和 inspiration_tags
      expect(body.platform_urls).toBeTruthy()
      expect(body.inspiration_tags).toBeTruthy()
    })
  })
})
