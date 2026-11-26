import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'
import { buildApp } from '../src/app.js'

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber: string) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

describe('REQ-022 F5: GET /api/admin/messages 筛选参数', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow
  let otherArtist: ArtistRow

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
    admin = setAdmin('10001')
    artist = seedArtist({ qq_number: '88040', subdomain: 'gbf-a', name: '画师甲' })
    otherArtist = seedArtist({ qq_number: '88041', subdomain: 'gbf-b', name: '画师乙' })
    // 造数：artist 两条（approved+已回复 / pending 未回复），otherArtist 一条 rejected
    const m1 = guestbookService.createMessage(artist.id, '甲客', '好画')!
    guestbookService.approveMessage(artist.id, m1.id)
    guestbookService.replyMessage(artist.id, m1.id, '多谢')
    guestbookService.createMessage(artist.id, '乙客', '排队中')
    const m3 = guestbookService.createMessage(otherArtist.id, '丙客', '广告')!
    guestbookService.rejectMessage(otherArtist.id, m3.id)
  })

  function get(url: string) {
    return app.inject({
      method: 'GET',
      url,
      // REQ-041：管理后台路由需 step-up 升级会话
      headers: { Authorization: `Bearer ${createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
    })
  }

  it('TC-GBF-01: 无参数返回全部三条', async () => {
    const res = await get('/api/admin/messages')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(3)
  })

  it('TC-GBF-02: artistId 过滤只返回该画师留言', async () => {
    const res = await get(`/api/admin/messages?artistId=${artist.id}`)
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(2)
    expect(list.every((m: { artist_id: number }) => m.artist_id === artist.id)).toBe(true)
  })

  it('TC-GBF-03: 合法 status 过滤', async () => {
    const res = await get('/api/admin/messages?status=approved')
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].nickname).toBe('甲客')
  })

  it('TC-GBF-04: 非法 status 忽略（与全站惯例一致，返回全部）', async () => {
    const res = await get('/api/admin/messages?status=hacked')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(3)
  })

  it('TC-GBF-05: replied=1 只返回已回复 / replied=0 只返回未回复', async () => {
    const yes = await get('/api/admin/messages?replied=1')
    expect(yes.statusCode).toBe(200)
    const yesList = yes.json()
    expect(yesList).toHaveLength(1)
    expect(yesList[0].artist_reply).toBe('多谢')

    const no = await get('/api/admin/messages?replied=0')
    expect(no.json()).toHaveLength(2)
  })

  it('TC-GBF-06: 非数字 artistId 忽略（返回全部）', async () => {
    const res = await get('/api/admin/messages?artistId=abc')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(3)
  })

  it('TC-GBF-07: 组合参数 artistId + status + replied', async () => {
    const res = await get(`/api/admin/messages?artistId=${artist.id}&status=approved&replied=1`)
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].nickname).toBe('甲客')
  })

  it('TC-GBF-08: 非管理员访问返回 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/messages',
      headers: { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
    })
    expect(res.statusCode).toBe(403)
  })

  it('TC-GBF-09: 强制删除后刷新列表不再回显（0817 用户报障口径，接口层回归）', async () => {
    const head = { Authorization: `Bearer ${createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
    const before = await get('/api/admin/messages')
    const target = before.json().find((m: { nickname: string }) => m.nickname === '乙客')
    expect(target).toBeDefined()

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/messages/${target.id}`, headers: head })
    expect(del.statusCode).toBe(200)

    // 刷新（重新 GET）：被删条目不再出现，其余两条保留
    const after = await get('/api/admin/messages')
    const list = after.json()
    expect(list).toHaveLength(2)
    expect(list.some((m: { id: number }) => m.id === target.id)).toBe(false)
  })

  // ─── B7-F0283：服务端行数上限（管理端仪表盘只取最近一屏） ───

  it('TC-GBF-B7-01: ?limit=2 只返回最近 2 条（created_at 倒序口径不变）', async () => {
    // 造数同秒写入会让 created_at 并列、倒序断言碰运气——先错开三条的时间戳（表存 SQLite CURRENT_TIMESTAMP 格式）
    db.prepare("UPDATE guestbook_messages SET created_at = datetime('now', '-3 minute') WHERE nickname = '甲客'").run()
    db.prepare("UPDATE guestbook_messages SET created_at = datetime('now', '-2 minute') WHERE nickname = '乙客'").run()
    db.prepare("UPDATE guestbook_messages SET created_at = datetime('now', '-1 minute') WHERE nickname = '丙客'").run()

    const res = await get('/api/admin/messages?limit=2')
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(2)
    // 倒序：最新在前（丙客最新、乙客次之；limit 截断掉最旧的甲客）
    expect(list[0].nickname).toBe('丙客')
    expect(list[1].nickname).toBe('乙客')
  })

  it('TC-GBF-B7-02: limit 与筛选叠加（artistId + limit）', async () => {
    const res = await get(`/api/admin/messages?artistId=${artist.id}&limit=1`)
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].artist_id).toBe(artist.id)
  })

  it('TC-GBF-B7-03: 非法 limit 忽略（abc/-1/0），超大值钳到 1000 不报错', async () => {
    for (const q of ['limit=abc', 'limit=-1', 'limit=0']) {
      const res = await get(`/api/admin/messages?${q}`)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(3) // 忽略 = 全量（既有语义）
    }
    // 超上限不 500：钳制后照常返回
    const big = await get('/api/admin/messages?limit=99999')
    expect(big.statusCode).toBe(200)
    expect(big.json()).toHaveLength(3)
  })
})
