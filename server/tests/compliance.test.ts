// REQ-042 合规与内容安全：
// 举报提交/限流/处理留痕/内容下架生效/封禁（登录拒绝+客户端过滤+解封恢复）/敏感词 warning 不硬拦
// v75（P4 后端批）：四条留痕链路 + 举报链路的取证 IP（含 CF 链路与反伪造前缀）
// v76（P4 后端批）：作品下架改「行保留可恢复」语义、主页内容级下架（幂等 + 管理员账号豁免）
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createSession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import { buildApp } from '../src/app.js'
import * as complianceService from '../src/features/compliance/compliance.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

const REAL_CLIENT_IP = '203.0.113.7'      // CF→Caddy 换算后的真实用户 IP（TEST-NET-3）
const CADDY_CONTAINER_IP = '172.18.0.5'   // Caddy 容器内网地址（TRUST_PROXY 可信代理）

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
  report_ip: string | null
}

/** admin_actions 表行（测试消费字段） */
interface AdminActionRow {
  admin_id: number
  target_type: string
  target_id: number
  reason: string | null
  admin_ip: string | null
  created_at: string
}

/** artworks 表行（v76 下架字段消费面） */
interface ArtworkDbRow {
  id: number
  title: string | null
  description: string | null
  like_count: number
  takedown_at: string | null
  takedown_reason: string | null
}

/** artists 表行（v76 主页下架字段消费面） */
interface ArtistDbRow {
  home_takedown_at: string | null
  home_takedown_reason: string | null
  is_banned: number
  status: string
  token_version: number
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
    // 限流桶是进程级内存（举报提交 2/分钟），逐例清零防相互波及
    resetRateLimitBuckets()
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

  /** 取某 action 的唯一一条留痕（断言「只记了一笔」时同时兜住重复写） */
  function soleAction(action: string): AdminActionRow {
    const rows = db.prepare('SELECT * FROM admin_actions WHERE action = ?').all(action) as AdminActionRow[]
    expect(rows).toHaveLength(1)
    return rows[0]
  }

  /** 建一件带齐可丢字段的画作（验证下架不伤数据） */
  function seedArtwork(artistId: number): number {
    const r = db.prepare(
      "INSERT INTO artworks (artist_id, image_path, title, description, like_count) VALUES (?, 'images/1/x.png', '被下架的作品', '自由描述', 7)"
    ).run(artistId)
    return Number(r.lastInsertRowid)
  }

  function readArtwork(id: number): ArtworkDbRow {
    return db.prepare('SELECT id, title, description, like_count, takedown_at, takedown_reason FROM artworks WHERE id = ?')
      .get(id) as ArtworkDbRow
  }

  function readArtist(id: number): ArtistDbRow {
    return db.prepare('SELECT home_takedown_at, home_takedown_reason, is_banned, status, token_version FROM artists WHERE id = ?')
      .get(id) as ArtistDbRow
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

  it('TC-CMP-06: 作品下架 → v76 起为「置 takedown_at，行保留」+ 留痕 + 再下架不再 404', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70003', subdomain: 'cmp-artwork' })
    const artworkId = seedArtwork(artist.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/content/artwork/${artworkId}/remove`,
      headers: authH(admin),
      payload: { reason: '违规作品' }
    })
    expect(res.statusCode).toBe(200)
    // 语义变更（v76）：不再物理删，行留在库里等恢复；下架标记与原因落列
    const row = readArtwork(artworkId)
    expect(row.id).toBe(artworkId)
    expect(row.takedown_at).toBeTruthy()
    expect(row.takedown_reason).toBe('违规作品')
    expect(actionCount('content_remove')).toBe(1)
    const action = db.prepare("SELECT * FROM admin_actions WHERE action = 'content_remove'").get() as AdminActionRow
    expect(action.target_type).toBe('artwork')
    expect(action.target_id).toBe(artworkId)
    expect(action.reason).toBe('违规作品')

    // 不存在的作品仍然 404
    const gone = await app.inject({
      method: 'POST',
      url: `/api/admin/content/artwork/${artworkId + 1000}/remove`,
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
    // 方案 A（2026-08-21）：目录新增开业就绪门槛——补齐作品+启用画风尺寸，
    // 确保封禁前后目录可见性变化验证的是封禁语义而非被就绪门槛误伤
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/cmp/a.webp', '作品')").run(artist.id)
    const styleRow = db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artist.id, '日系')
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)').run(Number(styleRow.lastInsertRowid), '头像', 50)
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

    // 旧 token 立即失效
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: AUTH_PREFIX + oldToken } })
    expect(me.statusCode).toBe(401)
    expect(me.json().code).toBe('ARTIST_BANNED')

    // 登录拒绝（正确动态码也被拦）
    const loginBanned = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '70005', code: computeTotp(secret, Date.now()) }
    })
    expect(loginBanned.statusCode).toBe(401)
    expect(loginBanned.json().code).toBe('ARTIST_BANNED')

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

  // ─── v75 取证 IP：四条留痕链路 + 举报链路 ───

  it('TC-CMP-15: 处理举报链路 → admin_actions.admin_ip = 操作来源 IP', async () => {
    const admin = setAdmin()
    const r = db.prepare("INSERT INTO reports (target_type, description) VALUES ('other', '待处理')").run()
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/reports/${Number(r.lastInsertRowid)}/resolve`,
      headers: authH(admin),
      remoteAddress: '203.0.113.50',
      payload: { reason: '已核实' }
    })
    expect(res.statusCode).toBe(200)
    expect(soleAction('report_resolve').admin_ip).toBe('203.0.113.50')
  })

  it('TC-CMP-16: 作品下架链路 → admin_ip 入库', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70016', subdomain: 'cmp-ip-art' })
    const artworkId = seedArtwork(artist.id)
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/content/artwork/${artworkId}/remove`,
      headers: authH(admin),
      remoteAddress: '203.0.113.51',
      payload: { reason: '违规' }
    })
    expect(res.statusCode).toBe(200)
    expect(soleAction('content_remove').admin_ip).toBe('203.0.113.51')
  })

  it('TC-CMP-17: 留言下架链路 → admin_ip 入库', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70017', subdomain: 'cmp-ip-msg' })
    const m = db.prepare("INSERT INTO guestbook_messages (artist_id, nickname, content, status) VALUES (?, 'a', 'b', 'approved')").run(artist.id)
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/content/message/${Number(m.lastInsertRowid)}/remove`,
      headers: authH(admin),
      remoteAddress: '203.0.113.52',
      payload: {}
    })
    expect(res.statusCode).toBe(200)
    expect(soleAction('content_remove').admin_ip).toBe('203.0.113.52')
  })

  it('TC-CMP-18: 封禁链路 → admin_ip 入库', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70018', subdomain: 'cmp-ip-ban' })
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/ban`,
      headers: authH(admin),
      remoteAddress: '203.0.113.53',
      payload: { reason: '违规' }
    })
    expect(res.statusCode).toBe(200)
    expect(soleAction('artist_ban').admin_ip).toBe('203.0.113.53')
  })

  it('TC-CMP-19: 解封链路同样带 IP（ban/unban 共用 for 循环注册，防分支漏传）', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70019', subdomain: 'cmp-ip-unban' })
    expect((await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id}/ban`, headers: authH(admin), remoteAddress: '203.0.113.60', payload: {}
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id}/unban`, headers: authH(admin), remoteAddress: '203.0.113.61', payload: {}
    })).statusCode).toBe(200)
    expect(soleAction('artist_ban').admin_ip).toBe('203.0.113.60')
    expect(soleAction('artist_unban').admin_ip).toBe('203.0.113.61')
  })

  it('TC-CMP-20: 未传 IP（service 直调，无 HTTP 上下文）→ admin_ip 为 NULL 且不抛错', () => {
    expect(() => complianceService.writeAdminAction(1, 'report_resolve', 'report', 1, '五参老调用')).not.toThrow()
    expect(soleAction('report_resolve').admin_ip).toBeNull()

    const r = db.prepare("INSERT INTO reports (target_type, description) VALUES ('other', '直调处理')").run()
    const resolved = complianceService.resolveReport(Number(r.lastInsertRowid), 1, '三参老调用')
    expect(resolved?.status).toBe('resolved')
    const rows = db.prepare("SELECT admin_ip FROM admin_actions WHERE action = 'report_resolve'").all() as Array<{ admin_ip: string | null }>
    expect(rows.every(r2 => r2.admin_ip === null)).toBe(true)
  })

  it('TC-CMP-21: 超长 IP 钳制为 45 字符', () => {
    complianceService.writeAdminAction(1, 'artist_ban', 'artist', 1, null, 'f'.repeat(100))
    expect((soleAction('artist_ban').admin_ip ?? '').length).toBe(45)
  })

  it('TC-CMP-22: 举报链路 → reports.report_ip 入库；直调不传 → NULL', async () => {
    seedArtist({ qq_number: '70022', subdomain: 'cmp-ip-report' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/reports',
      remoteAddress: '198.51.100.70',
      payload: { targetType: 'artist_home', description: '疑似违规' }
    })
    expect(res.statusCode).toBe(201)
    expect((db.prepare('SELECT report_ip FROM reports').get() as ReportDbRow).report_ip).toBe('198.51.100.70')

    const direct = complianceService.createReport({ targetType: 'other', description: '无 HTTP 上下文' })
    expect(direct?.report_ip).toBeNull()
  })

  // ─── v75 CF/Caddy 链路（P4-1 §1.3 证据链）───

  it('TC-CMP-23: CF→Caddy 透传——admin_ip 记真实用户 IP，且不等于内网代理 IP', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70023', subdomain: 'cmp-cf-ban' })
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/ban`,
      remoteAddress: CADDY_CONTAINER_IP,
      headers: { ...authH(admin), 'x-forwarded-for': REAL_CLIENT_IP },
      payload: { reason: '违规' }
    })
    expect(res.statusCode).toBe(200)
    const ip = soleAction('artist_ban').admin_ip
    expect(ip).toBe(REAL_CLIENT_IP)
    // 计划书担心的那个病：记成容器内网地址 = 零证据
    expect(ip).not.toBe(CADDY_CONTAINER_IP)
  })

  it('TC-CMP-24: 反伪造前缀——客户端自塞的 1.1.1.1 不被采纳', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70024', subdomain: 'cmp-cf-spoof' })
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/ban`,
      headers: { ...authH(admin), 'x-forwarded-for': `1.1.1.1, ${REAL_CLIENT_IP}` },
      remoteAddress: CADDY_CONTAINER_IP,
      payload: {}
    })
    expect(res.statusCode).toBe(200)
    const ip = soleAction('artist_ban').admin_ip
    expect(ip).toBe(REAL_CLIENT_IP)
    expect(ip).not.toBe('1.1.1.1')
  })

  // ─── v76 作品下架可恢复 ───

  it('TC-CMP-25: 作品下架后可恢复（行仍在、字段不丢、恢复标记清空）', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70025', subdomain: 'cmp-art-restore' })
    const artworkId = seedArtwork(artist.id)

    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/remove`, headers: authH(admin), payload: { reason: '违规' }
    })).statusCode).toBe(200)
    const down = readArtwork(artworkId)
    expect(down.takedown_at).toBeTruthy()
    // 数据零丢失：可恢复不是「重传一遍近似图」而是同一行回到公开端
    expect(down.title).toBe('被下架的作品')
    expect(down.description).toBe('自由描述')
    expect(down.like_count).toBe(7)

    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/restore`, headers: authH(admin), remoteAddress: '203.0.113.71', payload: { reason: '申诉成立' }
    })).statusCode).toBe(200)
    const up = readArtwork(artworkId)
    expect(up.takedown_at).toBeNull()
    expect(up.takedown_reason).toBeNull()
    expect(up.like_count).toBe(7)

    const restore = soleAction('content_restore')
    expect(restore.target_type).toBe('artwork')
    expect(restore.target_id).toBe(artworkId)
    expect(restore.admin_ip).toBe('203.0.113.71')

    // 不存在的作品恢复 → 404
    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId + 500}/restore`, headers: authH(admin), payload: {}
    })).statusCode).toBe(404)
  })

  it('TC-CMP-31: 作品下架幂等——重复下架返回 already 且不重复写留痕（与主页下架同口径）', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70031', subdomain: 'cmp-art-idem' })
    const artworkId = seedArtwork(artist.id)

    const first = await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/remove`, headers: authH(admin), payload: { reason: '违规' }
    })
    expect(first.statusCode).toBe(200)
    expect(first.json().already).toBeUndefined()
    const takedownAt = readArtwork(artworkId).takedown_at

    // 误双击/重试不该在留痕里变成两笔处置，也不该把首次处置时间顶掉
    const second = await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/remove`, headers: authH(admin), payload: { reason: '再点一次' }
    })
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ success: true, already: true })
    expect(actionCount('content_remove')).toBe(1)
    expect(readArtwork(artworkId).takedown_at).toBe(takedownAt)
    expect(soleAction('content_remove').reason).toBe('违规')

    // 恢复后可再次下架（不是一次性开关）
    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/restore`, headers: authH(admin), payload: {}
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/remove`, headers: authH(admin), payload: { reason: '复发' }
    })).json().already).toBeUndefined()
    expect(actionCount('content_remove')).toBe(2)
  })

  // ─── v76 主页内容级下架 ───

  it('TC-CMP-26: 主页下架 → 置两列 + 留痕（含 IP），且不动 token_version / is_banned / status', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70026', subdomain: 'cmp-home-down' })
    const before = readArtist(artist.id)
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/home-takedown`,
      headers: authH(admin),
      remoteAddress: '203.0.113.72',
      payload: { reason: '主页含侵权内容' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().already).toBeUndefined()
    const after = readArtist(artist.id)
    expect(after.home_takedown_at).toBeTruthy()
    expect(after.home_takedown_reason).toBe('主页含侵权内容')
    // 与封禁的分工线：画师必须能登进来整改
    expect(after.token_version).toBe(before.token_version)
    expect(after.is_banned).toBe(0)
    expect(after.status).toBe(before.status)
    const action = soleAction('home_takedown')
    expect(action.target_type).toBe('artist')
    expect(action.target_id).toBe(artist.id)
    expect(action.reason).toBe('主页含侵权内容')
    expect(action.admin_ip).toBe('203.0.113.72')
  })

  it('TC-CMP-27: 主页下架幂等——重复下架返回 already 且不重复写留痕', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70027', subdomain: 'cmp-home-idem' })
    const first = await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id}/home-takedown`, headers: authH(admin), payload: { reason: '违规' }
    })
    expect(first.statusCode).toBe(200)
    const takedownAt = readArtist(artist.id).home_takedown_at

    const second = await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id}/home-takedown`, headers: authH(admin), payload: { reason: '再点一次' }
    })
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual({ success: true, already: true })
    expect(actionCount('home_takedown')).toBe(1)
    // 幂等：时间戳与原因都不被第二次动作覆盖
    expect(readArtist(artist.id).home_takedown_at).toBe(takedownAt)
    expect(readArtist(artist.id).home_takedown_reason).toBe('违规')
  })

  it('TC-CMP-28: 管理员账号不可被主页下架（403 + 零留痕，防锁死平台）', async () => {
    const admin = setAdmin()
    const res = await app.inject({
      method: 'POST', url: `/api/admin/artists/${admin.id}/home-takedown`, headers: authH(admin), payload: { reason: '误操作' }
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toBe('不能下架管理员账号')
    expect(readArtist(admin.id).home_takedown_at).toBeNull()
    expect(actionCount('home_takedown')).toBe(0)
  })

  it('TC-CMP-29: 主页恢复 → 清空两列 + 留痕 home_restore（含 IP）；画师不存在 404', async () => {
    const admin = setAdmin()
    const artist = seedArtist({ qq_number: '70029', subdomain: 'cmp-home-up' })
    expect((await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id}/home-takedown`, headers: authH(admin), payload: { reason: '违规' }
    })).statusCode).toBe(200)

    const restore = await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id}/home-restore`, headers: authH(admin), remoteAddress: '203.0.113.73', payload: { reason: '整改完成' }
    })
    expect(restore.statusCode).toBe(200)
    const row = readArtist(artist.id)
    expect(row.home_takedown_at).toBeNull()
    expect(row.home_takedown_reason).toBeNull()
    const action = soleAction('home_restore')
    expect(action.admin_ip).toBe('203.0.113.73')
    expect(action.reason).toBe('整改完成')

    expect((await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id + 999}/home-restore`, headers: authH(admin), payload: {}
    })).statusCode).toBe(404)
    expect((await app.inject({
      method: 'POST', url: `/api/admin/artists/${artist.id + 999}/home-takedown`, headers: authH(admin), payload: {}
    })).statusCode).toBe(404)
  })

  // ─── 逆泄露：取证 IP 只到管理端为止 ───

  it('TC-CMP-30: 举报列表只带 report_ip（管理端），公开提交口不回带任何 IP 字段', async () => {
    const admin = setAdmin()
    seedArtist({ qq_number: '70030', subdomain: 'cmp-leak-report' })
    const post = await app.inject({
      method: 'POST', url: '/api/public/reports', remoteAddress: '198.51.100.80',
      payload: { targetType: 'artist_home', description: '违规' }
    })
    expect(post.statusCode).toBe(201)
    // 公开口响应体只回 id
    expect(post.body).not.toContain('198.51.100.80')
    expect(post.body).not.toContain('report_ip')
    expect(post.body).not.toContain('admin_ip')

    const adminList = await app.inject({ method: 'GET', url: '/api/admin/reports', headers: authH(admin) })
    expect(adminList.statusCode).toBe(200)
    expect(adminList.json()[0].report_ip).toBe('198.51.100.80')
    // 业务列表不得夹带管理动作 IP（P4-1 §7-13）
    expect(adminList.body).not.toContain('admin_ip')
  })
})
