import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

function insertArtwork(artistId, overrides = {}) {
  const data = {
    image_path: `images/${artistId}/test-${Math.random().toString(36).slice(2)}.png`,
    sort_order: 1,
    is_cover: 0,
    cover_order: 0,
    ...overrides
  }
  const result = db.prepare(`
    INSERT INTO artworks (artist_id, image_path, title, sort_order, is_cover, cover_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(artistId, data.image_path, data.title || null, data.sort_order, data.is_cover, data.cover_order)
  return db.prepare('SELECT * FROM artworks WHERE id = ?').get(result.lastInsertRowid)
}

describe('作品分页 (Artwork Paging)', () => {
  let app
  let artist
  let token

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  describe('画师端 GET /api/artist/artworks/paged', () => {
    it('TC-PG-01: 25 张作品 → page1=20 hasMore=true → page2=5 hasMore=false, total=25', async () => {
      for (let i = 1; i <= 25; i++) insertArtwork(artist.id, { sort_order: i })

      const p1 = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged?page=1&pageSize=20',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(p1.statusCode).toBe(200)
      const b1 = p1.json()
      expect(b1.items).toHaveLength(20)
      expect(b1.total).toBe(25)
      expect(b1.hasMore).toBe(true)

      const p2 = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged?page=2&pageSize=20',
        headers: { Authorization: `Bearer ${token}` }
      })
      const b2 = p2.json()
      expect(b2.items).toHaveLength(5)
      expect(b2.hasMore).toBe(false)
    })

    it('TC-PG-02: 封面(is_cover=1)恒在 page1 顶部，即使 sort_order 靠后', async () => {
      // 10 张普通作品 + 1 张封面（sort_order 最大）
      for (let i = 1; i <= 10; i++) insertArtwork(artist.id, { sort_order: i })
      insertArtwork(artist.id, { sort_order: 999, is_cover: 1, cover_order: 1 })

      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged?page=1&pageSize=5',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const b = res.json()
      expect(b.items[0].is_cover).toBe(1)
    })

    it('TC-PG-03: 边界 page=0 回落 1；pageSize=999 clamp 50；pageSize=1 正常', async () => {
      for (let i = 1; i <= 55; i++) insertArtwork(artist.id, { sort_order: i })

      // page=0 → 当 1 处理
      const p0 = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged?page=0',
        headers: { Authorization: `Bearer ${token}` }
      })
      const b0 = p0.json()
      expect(b0.items).toHaveLength(20)

      // pageSize=999 → clamp 50
      const big = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged?page=1&pageSize=999',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(big.json().items).toHaveLength(50)

      // pageSize=1 → 每页 1 张
      const one = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged?page=1&pageSize=1',
        headers: { Authorization: `Bearer ${token}` }
      })
      const b1 = one.json()
      expect(b1.items).toHaveLength(1)
      expect(b1.total).toBe(55)
      expect(b1.hasMore).toBe(true)
    })

    it('TC-PG-04: 分页接口携带 size_tag_ids（作品管理回显）', async () => {
      insertArtwork(artist.id, { title: '作品A' })
      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/artworks/paged',
        headers: { Authorization: `Bearer ${token}` }
      })
      const b = res.json()
      expect(b.items[0]).toHaveProperty('size_tag_ids')
    })

    it('TC-PG-05: 未登录 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/artist/artworks/paged' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('公开端 GET /api/public/artworks/:artistId', () => {
    it('TC-PG-06: 未登录可访问，默认 10/页', async () => {
      for (let i = 1; i <= 25; i++) insertArtwork(artist.id, { sort_order: i })

      const res = await app.inject({ method: 'GET', url: `/api/public/artworks/${artist.id}` })
      expect(res.statusCode).toBe(200)
      const b = res.json()
      expect(b.items).toHaveLength(10)
      expect(b.total).toBe(25)
      expect(b.hasMore).toBe(true)
    })

    it('TC-PG-07: pageSize clamp 上限 30', async () => {
      for (let i = 1; i <= 35; i++) insertArtwork(artist.id, { sort_order: i })
      const res = await app.inject({
        method: 'GET',
        url: `/api/public/artworks/${artist.id}?pageSize=999`
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().items).toHaveLength(30)
    })

    it('TC-PG-08: hidden 画师 404', async () => {
      const hidden = seedArtist({ qq_number: '88888', subdomain: 'hidden-artist', status: 'hidden' })
      const res = await app.inject({ method: 'GET', url: `/api/public/artworks/${hidden.id}` })
      expect(res.statusCode).toBe(404)
    })

    it('TC-PG-09: 不存在的画师 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/public/artworks/99999' })
      expect(res.statusCode).toBe(404)
    })

    it('TC-PG-10: 非法 artistId 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/public/artworks/abc' })
      expect(res.statusCode).toBe(400)
    })

    it('TC-PG-11: 公开分页限流 30/分（31 次后 429）', async () => {
      const opts = { method: 'GET', url: `/api/public/artworks/${artist.id}`, remoteAddress: '203.0.113.77' }
      let last = null
      for (let i = 0; i < 30; i++) {
        last = await app.inject(opts)
      }
      expect(last.statusCode).toBe(200)
      const blocked = await app.inject(opts)
      expect(blocked.statusCode).toBe(429)
      expect(blocked.json().code).toBe('RATE_LIMITED')
    })
  })
})