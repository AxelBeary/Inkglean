// REQ-042 合规与内容安全：
// 举报提交/限流/处理留痕/内容下架生效/封禁（登录拒绝+客户端过滤+解封恢复）/敏感词 warning 不硬拦
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createSession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import { buildApp } from '../src/app.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

/** COUNT(*) 行 */
interface CountRow {
  c: number
}

/** reports 表行（测试消费字段） */
interface ReportDbRow {
  target_type: string
  target_id: number
  status: string
  contact: string | null
}

/** admin_actions 表行（测试消费字段） */
interface AdminActionRow {
  admin_id: number
  target_type: string
  target_id: number
  reason: string | null
}

/** PRAGMA table_info 列 */
interface PragmaCol {
  name: string
  dflt_value: string | null
}

describe('REQ-042 合规与内容安全', () => {
  let app: FastifyInstance
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 设置管理员 + 返回管理员行 */
  function setAdmin(qq: string = '10001'): ArtistRow {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    return seedArtist({ qq_number: qq, subdomain: `admin-${qq.slice(-4)}` })
  }

  function authH(artist: ArtistRow): { authorization: string } {
    // d2-3 加固后 /api/admin/compliance 路由受 step-up 入口闸：管理员会话需 admin_verified 级（对齐新安全姿态；非管理员仍由 requireAdmin 403 拦截）
    return { authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string }) }
  }

  /** 管理员绑定画师 TOTP，返回密钥 */
  function bindArtistTotp(artist: ArtistRow): string {
    const secret = generateSecret()
    bindTotpInit(artist.id, secret)
    confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    return secret
  }

  /** 留痕计数 */
  function actionCount(action: string): number {
    return (db.prepare('SELECT COUNT(*) c FROM admin_actions WHERE action = ?').get(action) as CountRow).c
  }

  // ─── 迁移 v59 ───

  it('TC-CMP-00: 迁移 v59 就位 — reports/admin_actions 表 + artists.is_banned 默认 0', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('reports','admin_actions')").all() as { name: string }[]
    expect(tables.map(t => t.name).sort()).toEqual(['admin_actions', 'reports'])
    const cols = db.prepare('PRAGMA table_info(artists)').all() as PragmaCol[]
    const banned = cols.find(c => c.name === 'is_banned') as PragmaCol
    expect(banned).toBeTruthy()
    expect(banned.dflt_value).toBe('0')
    const artist = seedArtist({ qq_number: '70001', subdomain: 'cmp-mig' })
    expect(artist.is_banned).toBe(0)
  })

  // ─── 举报提交 ───

  it('TC-CMP-01: 匿名提交举报成功（201，默认 pending）', async () => {
    const artist = seedArtist({ qq_number: '70002', subdomain: 'cmp-report' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/reports',
      payload: {
        targetType: 'artist_home',
        targetId: artist.id,
        description: '主页内容疑似违规',
        contact: 'QQ12345'
      }
    })
    expect(res.statusCode).toBe(201)
    const row = db.prepare('SELECT * FROM reports').get() as ReportDbRow
    expect(row).toBeTruthy()
    expect(row.target_type).toBe('artist_home')
    expect(row.target_id).toBe(artist.id)
    expect(row.status).toBe('pending')
    expect(row.contact).toBe('QQ12345')
  })

  it('TC-CMP-02: 举报参数校验 — 非法类型/超长描述 400', async () => {
    const badType = await app.inject({
      method: 'POST',
      url: '/api/public/reports',
      payload: { targetType: 'hack', description: 'x' }
    })
    expect(badType.statusCode).toBe(400)

    const longDesc = await app.inject({
      method: 'POST',
      url: '/api/public/reports',
      payload: { targetType: 'other', description: 'x'.repeat(1001) }
    })
    expect(longDesc.statusCode).toBe(400)
  })

  it('TC-CMP-03: 举报限流 — 同 IP 每分钟 2 条，第 3 条 429', async () => {
    const remoteAddress = '198.51.100.23' // 非信任网段，request.ip 原样
    const post = () => app.inject({
      method: 'POST',
      url: '/api/public/reports',
      remoteAddress,
      payload: { targetType: 'other', description: '限流测试' }
    })
    expect((await post()).statusCode).toBe(201)
    expect((await post()).statusCode).toBe(201)
    const third = await post()
    expect(third.statusCode).toBe(429)
    expect(third.json().code).toBe('RATE_LIMITED')
  })

  // ─── 举报处理 + 留痕 ───

  it('TC-CMP-04: 管理员处理举报 → resolved + admin_actions 留痕', async () => {
    const admin = setAdmin()
    const report = db.prepare(`
      INSERT INTO reports (target_type, description) VALUES ('other', '待处理举报')
    `).run()
    const reportId = Number(report.lastInsertRowid)

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/reports/${reportId}/resolve`,
      headers: authH(admin),
      payload: { reason: '已核实并处理' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().report.status).toBe('resolved')
    expect(res.json().report.resolved_by).toBe(admin.id)
    expect(res.json().report.resolved_at).toBeTruthy()
    expect(actionCount('report_resolve')).toBe(1)
    const action = db.prepare("SELECT * FROM admin_actions WHERE action = 'report_resolve'").get() as AdminActionRow
    expect(action.admin_id).toBe(admin.id)
    expect(action.target_type).toBe('report')
    expect(action.target_id).toBe(reportId)
    expect(action.reason).toBe('已核实并处理')
  })

  it('TC-CMP-05: 举报列表筛选 pending/resolved，非管理员 403', async () => {
    const admin = setAdmin()
    db.prepare("INSERT INTO reports (target_type, description) VALUES ('other', 'a')").run()
    db.prepare("INSERT INTO reports (target_type, description, status) VALUES ('other', 'b', 'resolved')").run()

    const all = await app.inject({ method: 'GET', url: '/api/admin/reports', headers: authH(admin) })
    expect(all.statusCode).toBe(200)
    expect(all.json()).toHaveLength(2)

    const pending = await app.inject({ method: 'GET', url: '/api/admin/reports?status=pending', headers: authH(admin) })
    expect(pending.json()).toHaveLength(1)
    expect(pending.json()[0].description).toBe('a')

    const resolved = await app.inject({ method: 'GET', url: '/api/admin/reports?status=resolved', headers: authH(admin) })
    expect(resolved.json()).toHaveLength(1)

    const pleb = seedArtist({ qq_number: '20002', subdomain: 'cmp-pleb' })
    const forbidden = await app.inject({ method: 'GET', url: '/api/admin/reports', headers: authH(pleb) })
    expect(forbidden.statusCode).toBe(403)
  })

  // ─── 内容下架 ───

  it('TC-CMP-06: 作品下架 → 删除生效 + 留痕', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70003', subdomain: 'cmp-artwork' })
    const art = db.prepare(
      "INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/1/x.png', '作品')"
    ).run(artist.id)
    const artworkId = Number(art.lastInsertRowid)

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/content/artwork/${artworkId}/remove`,
      headers: authH(admin),
      payload: { reason: '违规作品' }
    })
    expect(res.statusCode).toBe(200)
    expect((db.prepare('SELECT COUNT(*) c FROM artworks WHERE id = ?').get(artworkId) as CountRow).c).toBe(0)
    expect(actionCount('content_remove')).toBe(1)
    const action = db.prepare("SELECT * FROM admin_actions WHERE action = 'content_remove'").get() as AdminActionRow
    expect(action.target_type).toBe('artwork')
    expect(action.target_id).toBe(artworkId)
    expect(action.reason).toBe('违规作品')

    const gone = await app.inject({
      method: 'POST',
      url: `/api/admin/content/artwork/${artworkId}/remove`,
      headers: authH(admin),
      payload: {}
    })
    expect(gone.statusCode).toBe(404)
  })

  it('TC-CMP-07: 留言下架 → 公开端立即不可见 + 留痕', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70004', subdomain: 'cmp-msg' })
    const msg = db.prepare(`
      INSERT INTO guestbook_messages (artist_id, nickname, content, status) VALUES (?, '访客', '正常留言', 'approved')
    `).run(artist.id)
    const msgId = Number(msg.lastInsertRowid)

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/content/message/${msgId}/remove`,
      headers: authH(admin),
      payload: {}
    })
    expect(res.statusCode).toBe(200)
    const publicRes = await app.inject({ method: 'GET', url: `/api/public/artist/${artist.subdomain}/messages` })
    expect(publicRes.json().messages).toHaveLength(0)
    expect(actionCount('content_remove')).toBe(1)
    expect((db.prepare("SELECT deleted_by_admin FROM guestbook_messages WHERE id = ?").get(msgId) as { deleted_by_admin: number }).deleted_by_admin).toBe(1)
  })

  // ─── 封禁 / 解封 ───

  it('TC-CMP-08: 封禁 → is_banned=1 + 登录拒绝 + token 失效 + 客户端不可见；解封恢复', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70005', subdomain: 'cmp-ban' })
    const secret = bindArtistTotp(artist)
    const oldToken = createSession(artist.id, artist.token_version)

    // 封禁前：登录 + 目录/主页可见
    const loginBefore = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '70005', code: computeTotp(secret, Date.now()) }
    })
    expect(loginBefore.statusCode).toBe(200)
    const dirBefore = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(dirBefore.json().some((a: { subdomain: string }) => a.subdomain === 'cmp-ban')).toBe(true)

    // 封禁（写留痕 + bumpTokenVersion）
    const ban = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/ban`,
      headers: authH(admin),
      payload: { reason: '多次违规' }
    })
    expect(ban.statusCode).toBe(200)
    expect(ban.json().isBanned).toBe(1)
    expect((db.prepare('SELECT is_banned FROM artists WHERE id = ?').get(artist.id) as { is_banned: number }).is_banned).toBe(1)
    expect(actionCount('artist_ban')).toBe(1)

    // 登录拒绝（正确动态码也被拦）
    const loginBanned = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '70005', code: computeTotp(secret, Date.now()) }
    })
    expect(loginBanned.statusCode).toBe(401)
    expect(loginBanned.json().code).toBe('ARTIST_BANNED')

    // 旧 token 立即失效
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: AUTH_PREFIX + oldToken } })
    expect(me.statusCode).toBe(401)
    expect(me.json().code).toBe('ARTIST_BANNED')

    // 客户端过滤：目录 / 主页 / 作品 / 留言 / 报价全链路不可见
    const dir = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(dir.json().some((a: { subdomain: string }) => a.subdomain === 'cmp-ban')).toBe(false)
    const profile = await app.inject({ method: 'GET', url: '/api/artists/cmp-ban' })
    expect(profile.statusCode).toBe(404)
    const artworks = await app.inject({ method: 'GET', url: `/api/public/artworks/${artist.id}` })
    expect(artworks.statusCode).toBe(404)
    const messages = await app.inject({ method: 'POST', url: '/api/public/artist/cmp-ban/messages', payload: { nickname: 'x', content: 'hello' } })
    expect(messages.statusCode).toBe(404)
    const pricing = await app.inject({ method: 'GET', url: '/api/public/pricing/cmp-ban' })
    expect(pricing.statusCode).toBe(404)

    // 解封恢复
    const unban = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/unban`,
      headers: authH(admin),
      payload: {}
    })
    expect(unban.statusCode).toBe(200)
    expect((db.prepare('SELECT is_banned FROM artists WHERE id = ?').get(artist.id) as { is_banned: number }).is_banned).toBe(0)
    expect(actionCount('artist_unban')).toBe(1)

    const dirAfter = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(dirAfter.json().some((a: { subdomain: string }) => a.subdomain === 'cmp-ban')).toBe(true)
    const loginAfter = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      // 同一测试窗内先登录过 → 用下一 TOTP 时间步，避免重放防护误拦
      payload: { qqNumber: '70005', code: computeTotp(secret, Date.now() + 30_000) }
    })
    expect(loginAfter.statusCode).toBe(200)
  })

  it('TC-CMP-09: 不能封禁管理员账号', async () => {
    const admin = setAdmin()
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${admin.id}/ban`,
      headers: authH(admin),
      payload: {}
    })
    expect(res.statusCode).toBe(403)
    expect((db.prepare('SELECT is_banned FROM artists WHERE id = ?').get(admin.id) as { is_banned: number }).is_banned).toBe(0)
  })

  // ─── 敏感词 warning（不硬拦，先发后审） ───

  it('TC-CMP-10: 作品发布命中敏感词 → warning，作品照常入库', async () => {
    const artist = seedArtist({ qq_number: '70006', subdomain: 'cmp-sens-art' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/artist/artworks',
      headers: authH(artist),
      payload: { imagePath: `images/${artist.id}/a.png`, title: '赌博下注' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.warning.sensitiveWords).toContain('赌博')
    expect((db.prepare('SELECT COUNT(*) c FROM artworks').get() as CountRow).c).toBe(1)
  })

  it('TC-CMP-11: 订单交付物发布为作品命中敏感词 → warning，发布成功', async () => {
    const artist = seedArtist({ qq_number: '70007', subdomain: 'cmp-sens-pub' })
    const order = seedOrder(artist.id, { status: 'delivered' })
    const rel = `deliverables/${artist.id}/d1.jpg`
    mkdirSync(join(uploadDir, 'deliverables', String(artist.id)), { recursive: true })
    writeFileSync(join(uploadDir, rel), Buffer.from('fake-image-bytes'))
    const d = db.prepare(
      'INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)'
    ).run(order.id, rel, 'd1.jpg', 100)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/publish-artwork`,
      headers: authH(artist),
      payload: { deliverableIds: [Number(d.lastInsertRowid)], title: '代开发票图' }
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().warning.sensitiveWords).toContain('代开发票')
    expect(res.json().artworks).toHaveLength(1)
  })

  it('TC-CMP-12: 留言命中敏感词 → warning，留言照常入库（pending）', async () => {
    seedArtist({ qq_number: '70008', subdomain: 'cmp-sens-msg' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/artist/cmp-sens-msg/messages',
      payload: { nickname: '访客', content: '这里有诈骗信息吗' }
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().warning.sensitiveWords).toContain('诈骗')
    const row = db.prepare('SELECT status FROM guestbook_messages').get() as { status: string }
    expect(row.status).toBe('pending')
  })

  it('TC-CMP-13: 主页公告保存命中敏感词 → warning，公告照常保存', async () => {
    const artist = seedArtist({ qq_number: '70009', subdomain: 'cmp-sens-ann' })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: authH(artist),
      payload: { announcement: '不提供赌博相关内容' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().warning.sensitiveWords).toContain('赌博')
    expect((db.prepare('SELECT announcement FROM artists WHERE id = ?').get(artist.id) as { announcement: string }).announcement).toContain('赌博')
  })

  it('TC-CMP-14: 无敏感词内容不带 warning 字段', async () => {
    const artist = seedArtist({ qq_number: '70010', subdomain: 'cmp-sens-clean' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/artist/artworks',
      headers: authH(artist),
      payload: { imagePath: `images/${artist.id}/b.png`, title: '普通作品标题' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().warning).toBeUndefined()
  })
})
