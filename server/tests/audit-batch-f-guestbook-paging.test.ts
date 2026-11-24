import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'

// ============================================
// 审计批 F-2（P3-21）: 画师端留言列表分页
// GET /api/artist/messages 全量返回 → page/pageSize 分页
// 默认 20，pageSize clamp 1-100，返回 { items, total, page, pageSize }
// ============================================

describe('审计批 F-2 画师端留言分页', () => {
  let artist: ArtistRow

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

  // ─── 尾巴批 pr-review-upstream-20261123（F0182/F0205 根治）：可选 status 过滤 ───
  // 前端角标原先全量翻页只为止于计数；现在单请求带 status 取 total。

  it('TC-TAIL-01: 服务层可选 status 过滤——COUNT 与列表同口径', () => {
    // 25 条 pending 基础上过审 3 条、婉拒 2 条 → pending 20 / approved 3 / rejected 2
    const seeded = guestbookService.getArtistMessages(artist.id, 1, 25)
    for (const m of seeded.items.slice(0, 3)) guestbookService.approveMessage(artist.id, m.id)
    for (const m of seeded.items.slice(3, 5)) guestbookService.rejectMessage(artist.id, m.id)

    const pending = guestbookService.getArtistMessages(artist.id, 1, 10, 'pending')
    expect(pending.total).toBe(20)
    expect(pending.items).toHaveLength(10)
    expect(pending.items.every(m => m.status === 'pending')).toBe(true)

    const approved = guestbookService.getArtistMessages(artist.id, 1, 100, 'approved')
    expect(approved.total).toBe(3)
    expect(approved.items.every(m => m.status === 'approved')).toBe(true)

    const rejected = guestbookService.getArtistMessages(artist.id, 1, 100, 'rejected')
    expect(rejected.total).toBe(2)

    // 不传 status 口径不变（全量 25，默认行为零回归）
    expect(guestbookService.getArtistMessages(artist.id).total).toBe(25)
  })

  it('TC-RV-TAIL-01: 服务层 status 枚举校验（防御纵深）——非法值按不过滤处理', () => {
    // 先过审 1 条，让「过滤 pending」与「不过滤」有可观察差异（beforeEach 后 25 条全 pending）
    const seeded = guestbookService.getArtistMessages(artist.id, 1, 25)
    guestbookService.approveMessage(artist.id, seeded.items[0].id)

    // 非法枚举（含注入形态、大小写不符、空串）一律按 undefined：全量 25、含 approved
    for (const bad of ['bogus', "pending' OR '1'='1", 'PENDING', '']) {
      const res = guestbookService.getArtistMessages(artist.id, 1, 100, bad)
      expect(res.total).toBe(25)
      expect(res.items.some(m => m.status === 'approved')).toBe(true)
    }
  })

  it('TC-TAIL-02: 路由层 status 枚举白名单——合法过滤、非法值忽略回全量', async () => {
    // 先过审 1 条，让两条路径有可观察差异（approved 只在全量出现；本用例 beforeEach 后 25 条全 pending）
    const seeded = guestbookService.getArtistMessages(artist.id, 1, 25)
    guestbookService.approveMessage(artist.id, seeded.items[0].id)

    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const token = createSession(artist.id, artist.token_version)
      const headers = { Authorization: `Bearer ${token}` }

      // 角标消费姿势：status=pending + pageSize=1 → 单行 + 精确 total
      const pending = await app.inject({ method: 'GET', url: '/api/artist/messages?status=pending&pageSize=1', headers })
      expect(pending.statusCode).toBe(200)
      expect(pending.json().total).toBe(24)
      expect(pending.json().items).toHaveLength(1)
      expect(pending.json().items[0].status).toBe('pending')

      // 非法枚举不报错、不过滤（与 /api/admin/messages 白名单惯例一致）
      const garbage = await app.inject({ method: 'GET', url: '/api/artist/messages?status=bogus', headers })
      expect(garbage.statusCode).toBe(200)
      expect(garbage.json().total).toBe(25)
      expect(garbage.json().items).toHaveLength(20)
      expect(garbage.json().items.some((m: { status: string }) => m.status === 'approved')).toBe(true)
    } finally {
      await app.close()
    }
  })
})
