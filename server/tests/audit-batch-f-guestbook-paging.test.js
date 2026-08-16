import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'

// ============================================
// 审计批 F-2（P3-21）: 画师端留言列表分页
// GET /api/artist/messages 全量返回 → page/pageSize 分页
// 默认 20，pageSize clamp 1-100，返回 { items, total, page, pageSize }
// ============================================

describe('审计批 F-2 画师端留言分页', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '88302', subdomain: 'f2-gb' })
    for (let i = 0; i < 25; i++) {
      guestbookService.createMessage(artist.id, `用户${i}`, `留言${i}`)
    }
  })

  it('TC-F2-01: 服务层分页正确（total 全量、items 按页切片、created_at DESC）', () => {
    const p1 = guestbookService.getArtistMessages(artist.id, 1, 10)
    expect(p1.total).toBe(25)
    expect(p1.items).toHaveLength(10)
    expect(p1.page).toBe(1)
    expect(p1.pageSize).toBe(10)

    const p3 = guestbookService.getArtistMessages(artist.id, 3, 10)
    expect(p3.items).toHaveLength(5)
    // 倒序：最新一条（用户24）在第一页第一行
    expect(p1.items[0].nickname).toBe('用户24')
  })

  it('TC-F2-02: 越界页返回空 items（total 不变）', () => {
    const far = guestbookService.getArtistMessages(artist.id, 999, 10)
    expect(far.items).toHaveLength(0)
    expect(far.total).toBe(25)
  })

  it('TC-F2-03: 路由层默认参数（page=1，pageSize=20）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/messages',
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.items).toHaveLength(20)
      expect(body.total).toBe(25)
      expect(body.page).toBe(1)
      expect(body.pageSize).toBe(20)
    } finally {
      await app.close()
    }
  })

  it('TC-F2-04: 路由层 pageSize 钳制（1-100），非法值回退默认', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const headers = { Authorization: `Bearer ${token}` }

      const big = await app.inject({ method: 'GET', url: '/api/artist/messages?pageSize=500', headers })
      expect(big.json().pageSize).toBe(100)
      expect(big.json().items).toHaveLength(25)

      // 0 与非法值按公开端风格回退默认 20
      const zero = await app.inject({ method: 'GET', url: '/api/artist/messages?pageSize=0', headers })
      expect(zero.json().pageSize).toBe(20)
      // 负数：Math.max 下限钳到 1
      const negative = await app.inject({ method: 'GET', url: '/api/artist/messages?pageSize=-5', headers })
      expect(negative.json().pageSize).toBe(1)

      const garbage = await app.inject({ method: 'GET', url: '/api/artist/messages?pageSize=abc', headers })
      expect(garbage.json().pageSize).toBe(20)

      const pageGarbage = await app.inject({ method: 'GET', url: '/api/artist/messages?page=abc', headers })
      expect(pageGarbage.json().page).toBe(1)
    } finally {
      await app.close()
    }
  })

  it('TC-F2-05: 越界页路由返回空 items + 全量 total', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const res = await app.inject({
        method: 'GET',
        url: '/api/artist/messages?page=99&pageSize=20',
        headers: { Authorization: `Bearer ${token}` }
      })
      const body = res.json()
      expect(body.items).toHaveLength(0)
      expect(body.total).toBe(25)
    } finally {
      await app.close()
    }
  })

  it('TC-F2-06: 未登录仍 401', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/artist/messages' })
      expect(res.statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('TC-F2-07: 提交留言 language 写端校验与读端同口径（非法 400，合法可提交）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const base = `/api/public/artist/${artist.subdomain}/messages`
      const bad = await app.inject({
        method: 'POST',
        url: base,
        payload: { nickname: '甲', content: '测试留言', language: 'zh-CN_' }
      })
      expect(bad.statusCode).toBe(400)

      const ok = await app.inject({
        method: 'POST',
        url: base,
        payload: { nickname: '甲', content: '测试留言', language: 'en-US' }
      })
      expect(ok.statusCode).toBe(201)
      expect(ok.json().id).toBeDefined()
    } finally {
      await app.close()
    }
  })
})
