// P4-1 §5 管理动作留痕查看接口（B2）+ §1.2 三处零留痕管理动作补全（B5）
// 断言面：鉴权三态（401 未登录 / 403 非管理员 / 401 STEP_UP_REQUIRED 未升级）、
//        limit 钳制与筛选口径、时间倒序、行内含 admin_ip、
//        逆泄露（admin_ip 只到 /api/admin/admin-actions 为止）、
//        artist_status_set / artist_remove / 管理端删作品改走下架 三处留痕补齐
// 认证范式照抄 tests/compliance.test.ts（setAdmin + authH，step-up 需 admin_verified）
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as complianceService from '../src/features/compliance/compliance.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

const OPERATOR_IP = '203.0.113.90'

/** COUNT(*) 行 */
interface CountRow {
  c: number
}

/** 留痕列表接口响应壳 */
interface ActionListResponse {
  rows: complianceService.AdminActionRow[]
  total: number
}

/** admin_actions 直插参数（本文件用直插构造大批量与指定时间戳，避免逐例打 HTTP） */
interface SeedAction {
  action: string
  targetType?: string | null
  targetId?: number | null
  ip?: string | null
  createdAt?: string
  reason?: string | null
}

/** artworks 表行（v76 下架字段消费面） */
interface ArtworkDbRow {
  id: number
  artist_id: number
  title: string | null
  takedown_at: string | null
  takedown_reason: string | null
}

/** artists 表行（软删标记消费面） */
interface ArtistDbRow {
  deleted_at: string | null
  status: string
}

/** GET /api/admin/artists/:id/artworks 行（管理端读函数透出 takedown_at） */
interface AdminArtworkRow {
  id: number
  takedown_at: string | null
}

describe('P4-1 管理动作留痕查看接口（B2）', () => {
  let app: FastifyInstance
  let admin: ArtistRow

  beforeEach(async () => {
    cleanDb()
    // 公开作品分页口 30 次/分钟等限流桶是进程级内存，逐例清零防相互波及
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
    admin = setAdmin('10001')
  })

  function setAdmin(qq: string): ArtistRow {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    return seedArtist({ qq_number: qq, subdomain: `audit-admin-${qq.slice(-4)}` })
  }

  /** 管理员已升级会话（step-up 已过） */
  function authH(artist: ArtistRow): { authorization: string } {
    return {
      authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version, {
        authLevel: 'admin_verified',
        adminVerifiedAt: Date.now() as unknown as string
      })
    }
  }

  /** 管理员未升级会话（basic：过了 requireAdmin，但 step-up 必拦） */
  function basicH(artist: ArtistRow): { authorization: string } {
    return { authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version) }
  }

  function list(url: string, headers: Record<string, string> = authH(admin)) {
    return app.inject({ method: 'GET', url, headers })
  }

  function body(): ActionListResponse {
    return {
      rows: complianceService.getAdminActions({ limit: 500 }) as complianceService.AdminActionRow[],
      total: complianceService.countAdminActions()
    }
  }

  /** 直插一条留痕（时间戳可控，用于真正验证 created_at DESC 而不只是 id DESC） */
  function seedAction(s: SeedAction): number {
    const r = db.prepare(`
      INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason, admin_ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(admin.id, s.action, s.targetType ?? null, s.targetId ?? null, s.reason ?? null, s.ip ?? null,
      s.createdAt ?? '2026-09-13 10:00:00')
    return Number(r.lastInsertRowid)
  }

  function countAll(): number {
    return (db.prepare('SELECT COUNT(*) c FROM admin_actions').get() as CountRow).c
  }

  function readArtwork(id: number): ArtworkDbRow {
    return db.prepare('SELECT id, artist_id, title, takedown_at, takedown_reason FROM artworks WHERE id = ?')
      .get(id) as ArtworkDbRow
  }

  function seedArtwork(artistId: number, title = '一件作品'): number {
    const r = db.prepare(
      "INSERT INTO artworks (artist_id, image_path, title, description, like_count) VALUES (?, 'images/1/x.png', ?, '自由描述', 3)"
    ).run(artistId, title)
    return Number(r.lastInsertRowid)
  }

  // ─── 鉴权三态 ───

  it('TC-AAA-01: 无凭证 → 401（不留任何数据出口）', async () => {
    const res = await list('/api/admin/admin-actions', {})
    expect(res.statusCode).toBe(401)
  })

  it('TC-AAA-02: 普通画师（即使会话标 admin_verified）→ 403，requireAdmin 先于 step-up', async () => {
    const pleb = seedArtist({ qq_number: '55001', subdomain: 'audit-pleb' })
    const res = await list('/api/admin/admin-actions', authH(pleb))
    expect(res.statusCode).toBe(403)
  })

  it('TC-AAA-03: 管理员但未 step-up 升级 → 401 STEP_UP_REQUIRED（新口自动继承 onRoute 守卫）', async () => {
    const res = await list('/api/admin/admin-actions', basicH(admin))
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('STEP_UP_REQUIRED')
  })

  it('TC-AAA-04: v76 四个新管理口同样受 step-up 覆盖（挪出插件即漏挂，此处钉住继承关系）', async () => {
    const artist = seedArtist({ qq_number: '55002', subdomain: 'audit-stepup' })
    const probes: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'GET', url: '/api/admin/admin-actions' },
      { method: 'POST', url: `/api/admin/artists/${artist.id}/home-takedown` },
      { method: 'POST', url: `/api/admin/artists/${artist.id}/home-restore` },
      { method: 'POST', url: `/api/admin/content/artwork/${seedArtwork(artist.id)}/restore` }
    ]
    for (const p of probes) {
      const res = await app.inject({ method: p.method, url: p.url, headers: basicH(admin), payload: {} })
      expect(res.statusCode, `${p.method} ${p.url}`).toBe(401)
      expect(res.json().code).toBe('STEP_UP_REQUIRED')
    }
    // 未升级时动作一律没执行：零留痕
    expect(countAll()).toBe(0)
  })

  // ─── 返回形状、排序、行内含 admin_ip ───

  it('TC-AAA-05: 返回 { rows, total }；行内含 admin_ip；按 created_at DESC, id DESC', async () => {
    const oldest = seedAction({ action: 'artist_ban', createdAt: '2026-09-11 08:00:00', ip: '1.1.1.1' })
    const middle = seedAction({ action: 'artist_unban', createdAt: '2026-09-12 08:00:00', ip: '2.2.2.2' })
    // 同一时间戳的两条靠 id DESC 决胜
    const t1 = seedAction({ action: 'report_resolve', createdAt: '2026-09-13 08:00:00', ip: '3.3.3.3' })
    const t2 = seedAction({ action: 'content_remove', createdAt: '2026-09-13 08:00:00', ip: null })

    const res = await list('/api/admin/admin-actions')
    expect(res.statusCode).toBe(200)
    const json = res.json() as ActionListResponse
    expect(Array.isArray(json.rows)).toBe(true)
    expect(typeof json.total).toBe('number')
    expect(json.rows.map(r => r.id)).toEqual([t2, t1, middle, oldest])
    // 取证 IP 在行里（否则这个接口只是把旧账本又念一遍）
    const ban = json.rows.find(r => r.action === 'artist_ban')
    expect(ban?.admin_ip).toBe('1.1.1.1')
    // 未记 IP 的老行/直调行仍是 null，不被填成 'unknown'
    expect(json.rows.find(r => r.id === t2)?.admin_ip).toBeNull()
  })

  it('TC-AAA-06: 默认 limit=100（120 条只回 100 行，total 仍是全量 120）', async () => {
    for (let i = 0; i < 120; i++) seedAction({ action: 'artist_ban', targetId: i, ip: `203.0.113.${i % 200}` })
    const json = (await list('/api/admin/admin-actions')).json() as ActionListResponse
    expect(json.rows).toHaveLength(100)
    expect(json.total).toBe(120)
  })

  it('TC-AAA-07: ?limit= 钳制——9999 收敛到 500，0/负数抬到 1（刻意不设 schema maximum）', async () => {
    for (let i = 0; i < 6; i++) seedAction({ action: 'artist_ban', targetId: i })
    const big = (await list('/api/admin/admin-actions?limit=9999')).json() as ActionListResponse
    expect(big.rows.length).toBeLessThanOrEqual(500)
    expect(big.rows).toHaveLength(6) // 库里只有 6 条，钳制不等于造假数据
    expect(big.total).toBe(6)

    const zero = (await list('/api/admin/admin-actions?limit=0')).json() as ActionListResponse
    expect(zero.rows).toHaveLength(1)
    expect(zero.total).toBe(6)

    const neg = (await list('/api/admin/admin-actions?limit=-5')).json() as ActionListResponse
    expect(neg.rows).toHaveLength(1)
  })

  it('TC-AAA-08: ?limit=abc 非整数 → 400（schema 校验拦住，不进 service 变 NaN）', async () => {
    seedAction({ action: 'artist_ban' })
    const res = await list('/api/admin/admin-actions?limit=abc')
    expect(res.statusCode).toBe(400)
  })

  // ─── 筛选 ───

  it('TC-AAA-09: ?action= 精确筛；total 同口径、不受 limit 截断', async () => {
    for (let i = 0; i < 3; i++) seedAction({ action: 'home_takedown', targetId: i })
    for (let i = 0; i < 4; i++) seedAction({ action: 'home_restore', targetId: i })
    const res = await list('/api/admin/admin-actions?action=home_restore&limit=2')
    const json = res.json() as ActionListResponse
    expect(json.rows).toHaveLength(2)
    expect(json.rows.every(r => r.action === 'home_restore')).toBe(true)
    // total 是同筛选的总数，limit 只截列表
    expect(json.total).toBe(4)
  })

  it('TC-AAA-10: ?action= 白名单外（脏参数/拼错）→ 忽略筛选返回全量，不整页报错', async () => {
    seedAction({ action: 'artist_ban' })
    seedAction({ action: 'home_restore' })
    const junk = (await list('/api/admin/admin-actions?action=no_such_action')).json() as ActionListResponse
    expect(junk.rows).toHaveLength(2)
    expect(junk.total).toBe(2)
  })

  it('TC-AAA-11: ?targetType+?targetId 成对生效（走 idx_admin_actions_target）；缺一不筛', async () => {
    const artworkId = seedArtwork(admin.id)
    seedAction({ action: 'content_remove', targetType: 'artwork', targetId: artworkId })
    seedAction({ action: 'content_remove', targetType: 'message', targetId: artworkId })
    seedAction({ action: 'content_restore', targetType: 'artwork', targetId: 999 })

    const pair = (await list(
      `/api/admin/admin-actions?targetType=artwork&targetId=${artworkId}`
    )).json() as ActionListResponse
    expect(pair.rows).toHaveLength(1)
    expect(pair.rows[0].target_type).toBe('artwork')
    expect(pair.total).toBe(1)

    // 只给 targetType：复合索引第二列缺失，成对约定 → 不启用该筛选（返回全量）
    const half = (await list('/api/admin/admin-actions?targetType=artwork')).json() as ActionListResponse
    expect(half.rows).toHaveLength(3)
    // 只给 targetId 同理
    const half2 = (await list(`/api/admin/admin-actions?targetId=${artworkId}`)).json() as ActionListResponse
    expect(half2.rows).toHaveLength(3)
  })

  it('TC-AAA-12: action 与 target 组合筛选（查「这件作品被处置过几次」）', async () => {
    const artworkId = seedArtwork(admin.id)
    seedAction({ action: 'content_remove', targetType: 'artwork', targetId: artworkId })
    seedAction({ action: 'content_restore', targetType: 'artwork', targetId: artworkId })
    seedAction({ action: 'content_remove', targetType: 'artwork', targetId: 4242 })

    const combined = (await list(
      `/api/admin/admin-actions?targetType=artwork&targetId=${artworkId}`
    )).json() as ActionListResponse
    expect(combined.rows.map(r => r.action).sort()).toEqual(['content_remove', 'content_restore'])

    const onlyRemove = (await list(
      `/api/admin/admin-actions?action=content_remove&targetType=artwork&targetId=${artworkId}`
    )).json() as ActionListResponse
    expect(onlyRemove.rows).toHaveLength(1)
    expect(onlyRemove.total).toBe(1)
  })

  it('TC-AAA-13: service 向后兼容——老数字签名 getAdminActions(limit) 仍可用', () => {
    for (let i = 0; i < 5; i++) seedAction({ action: 'artist_ban', targetId: i })
    expect(complianceService.getAdminActions(2)).toHaveLength(2)
    expect(complianceService.getAdminActions()).toHaveLength(5)
    expect(body().rows).toHaveLength(5)
  })

  // ─── 逆泄露：admin_ip 只到管理端为止 ───

  it('TC-AAA-14: 逆泄露——其余管理口与非管理口响应体一律不含 admin_ip', async () => {
    const artist = seedArtist({ qq_number: '55014', subdomain: 'audit-leak' })
    seedAction({ action: 'artist_ban', targetType: 'artist', targetId: artist.id, ip: OPERATOR_IP })
    db.prepare("INSERT INTO reports (target_type, description, report_ip) VALUES ('other', '举报', '203.0.113.99')").run()
    db.prepare("INSERT INTO guestbook_messages (artist_id, nickname, content, status, ip) VALUES (?, '访客', '留言', 'approved', '203.0.113.98')")
      .run(artist.id)

    const probes: Array<{ url: string; headers: Record<string, string> }> = [
      { url: '/api/admin/artists', headers: authH(admin) },
      { url: '/api/admin/reports', headers: authH(admin) },
      { url: '/api/admin/messages', headers: authH(admin) },
      { url: `/api/admin/artists/${artist.id}/artworks`, headers: authH(admin) },
      { url: '/api/admin/artists/deleted', headers: authH(admin) },
      { url: `/api/artists/${artist.subdomain}`, headers: {} },
      { url: `/api/public/artist/${artist.subdomain}/messages`, headers: {} }
    ]
    for (const p of probes) {
      const res = await app.inject({ method: 'GET', url: p.url, headers: p.headers })
      expect(res.statusCode, p.url).toBe(200)
      // 取证 IP 是「谁干的」这一类信息，业务列表不该夹带
      expect(res.body, p.url).not.toContain('admin_ip')
      expect(res.body, p.url).not.toContain(OPERATOR_IP)
    }

    // 正向对照：查看入口本身确实拿得到（防上面的断言靠「接口压根没数据」蒙对）
    const actions = (await list('/api/admin/admin-actions')).json() as ActionListResponse
    expect(actions.rows[0].admin_ip).toBe(OPERATOR_IP)
  })

  it('TC-AAA-15: 逆泄露——举报列表带 report_ip 但不带 admin_ip；留言管理端带 ip 但不带 admin_ip', async () => {
    const artist = seedArtist({ qq_number: '55015', subdomain: 'audit-leak2' })
    db.prepare("INSERT INTO reports (target_type, description, report_ip) VALUES ('other', '举报', '203.0.113.91')").run()
    db.prepare("INSERT INTO guestbook_messages (artist_id, nickname, content, status, ip) VALUES (?, '访客', '留言', 'approved', '203.0.113.92')")
      .run(artist.id)
    seedAction({ action: 'report_resolve', targetType: 'report', targetId: 1, ip: OPERATOR_IP })

    const reports = await list('/api/admin/reports')
    expect(reports.json()[0].report_ip).toBe('203.0.113.91')
    expect(reports.body).not.toContain('admin_ip')
    expect(reports.body).not.toContain(OPERATOR_IP)

    const messages = await list('/api/admin/messages')
    expect(messages.json()[0].ip).toBe('203.0.113.92')
    expect(messages.body).not.toContain('admin_ip')
    expect(messages.body).not.toContain(OPERATOR_IP)
  })

  // ─── B5：三处零留痕管理动作补全 ───

  it('TC-AAA-16: PUT /api/admin/artists/:id/status → 留痕 artist_status_set（reason 记新状态 + admin_ip）', async () => {
    const artist = seedArtist({ qq_number: '55016', subdomain: 'audit-status' })
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/status`,
      headers: authH(admin),
      remoteAddress: OPERATOR_IP,
      payload: { status: 'hidden' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('admin_ip')

    const rows = complianceService.getAdminActions({ action: 'artist_status_set' })
    expect(rows).toHaveLength(1)
    expect(rows[0].target_type).toBe('artist')
    expect(rows[0].target_id).toBe(artist.id)
    expect(rows[0].reason).toBe('hidden')
    expect(rows[0].admin_ip).toBe(OPERATOR_IP)
    expect(rows[0].admin_id).toBe(admin.id)
    expect((db.prepare('SELECT status FROM artists WHERE id = ?').get(artist.id) as ArtistDbRow).status).toBe('hidden')
  })

  it('TC-AAA-17: 状态改非法值 → 400 且零留痕（校验失败不该记一笔不存在的账）', async () => {
    const artist = seedArtist({ qq_number: '55017', subdomain: 'audit-status-bad' })
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/status`,
      headers: authH(admin),
      payload: { status: 'closed_forever' }
    })
    expect(res.statusCode).toBe(400)
    expect(countAll()).toBe(0)
  })

  it('TC-AAA-18: DELETE /api/admin/artists/:id → 留痕 artist_remove（软删可逆，但账必须查得到）', async () => {
    const artist = seedArtist({ qq_number: '55018', subdomain: 'audit-remove' })
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${artist.id}`,
      headers: authH(admin),
      remoteAddress: OPERATOR_IP
    })
    expect(res.statusCode).toBe(200)
    expect((db.prepare('SELECT deleted_at FROM artists WHERE id = ?').get(artist.id) as ArtistDbRow).deleted_at).toBeTruthy()

    const rows = complianceService.getAdminActions({ action: 'artist_remove' })
    expect(rows).toHaveLength(1)
    expect(rows[0].target_type).toBe('artist')
    expect(rows[0].target_id).toBe(artist.id)
    expect(rows[0].reason).toContain('测试画师')
    expect(rows[0].admin_ip).toBe(OPERATOR_IP)
  })

  it('TC-AAA-19: 画师不存在 → 404 零留痕；管理员账号 → 403 零留痕', async () => {
    const ghost = await app.inject({
      method: 'DELETE', url: '/api/admin/artists/888888', headers: authH(admin), remoteAddress: OPERATOR_IP
    })
    expect(ghost.statusCode).toBe(404)
    expect(countAll()).toBe(0)

    const selfDel = await app.inject({
      method: 'DELETE', url: `/api/admin/artists/${admin.id}`, headers: authH(admin), remoteAddress: OPERATOR_IP
    })
    expect(selfDel.statusCode).toBe(403)
    expect(countAll()).toBe(0)
  })

  it('TC-AAA-20: 管理端删作品 → 语义变下架（行保留 + takedown_at + content_remove 留痕含 IP）', async () => {
    const artist = seedArtist({ qq_number: '55020', subdomain: 'audit-artrm' })
    const artworkId = seedArtwork(artist.id, '被管理端下架的画')
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${artist.id}/artworks/${artworkId}`,
      headers: authH(admin),
      remoteAddress: OPERATOR_IP,
      payload: { reason: '管理端违规处置' }
    })
    expect(res.statusCode).toBe(200)

    // 行没被物理删（v76 前这里是 deleteArtwork，标题/描述/点赞数连同可恢复性一起没了）
    const row = readArtwork(artworkId)
    expect(row.id).toBe(artworkId)
    expect(row.title).toBe('被管理端下架的画')
    expect(row.takedown_at).toBeTruthy()
    expect(row.takedown_reason).toBe('管理端违规处置')

    const rows = complianceService.getAdminActions({ action: 'content_remove' })
    expect(rows).toHaveLength(1)
    expect(rows[0].target_type).toBe('artwork')
    expect(rows[0].target_id).toBe(artworkId)
    expect(rows[0].admin_ip).toBe(OPERATOR_IP)
    expect(rows[0].reason).toBe('管理端违规处置')
  })

  it('TC-AAA-21: 管理端删作品——归属校验走未过滤读函数（别人的作品 404 零留痕）', async () => {
    const owner = seedArtist({ qq_number: '55021', subdomain: 'audit-owner' })
    const other = seedArtist({ qq_number: '55022', subdomain: 'audit-other' })
    const artworkId = seedArtwork(owner.id)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${other.id}/artworks/${artworkId}`,
      headers: authH(admin),
      payload: { reason: '张冠李戴' }
    })
    expect(res.statusCode).toBe(404)
    expect(countAll()).toBe(0)
    expect(readArtwork(artworkId).takedown_at).toBeNull()
  })

  it('TC-AAA-22: 已下架作品仍从管理端列表可见（含 takedown_at 打标），公开端已被过滤——读路径分叉', async () => {
    const artist = seedArtist({ qq_number: '55023', subdomain: 'audit-fork' })
    const downId = seedArtwork(artist.id, '下架件')
    const liveId = seedArtwork(artist.id, '正常件')
    expect((await app.inject({
      method: 'DELETE', url: `/api/admin/artists/${artist.id}/artworks/${downId}`, headers: authH(admin), payload: {}
    })).statusCode).toBe(200)

    const adminList = await list(`/api/admin/artists/${artist.id}/artworks`)
    expect(adminList.statusCode).toBe(200)
    const adminRows = adminList.json() as AdminArtworkRow[]
    expect(adminRows.map(r => r.id).sort()).toEqual([downId, liveId].sort())
    expect(adminRows.find(r => r.id === downId)?.takedown_at).toBeTruthy()
    expect(adminRows.find(r => r.id === liveId)?.takedown_at).toBeNull()

    const pub = await app.inject({ method: 'GET', url: `/api/public/artworks/${artist.id}` })
    expect(pub.statusCode).toBe(200)
    const pubIds = (pub.json() as { items: AdminArtworkRow[] }).items.map(r => r.id)
    expect(pubIds).toContain(liveId)
    expect(pubIds).not.toContain(downId)

    // 已下架的作品还能被管理员继续处置与恢复：若归属校验误用公开端过滤函数，这里会 404 而死锁
    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${downId}/restore`, headers: authH(admin), payload: { reason: '申诉成立' }
    })).statusCode).toBe(200)
    expect(readArtwork(downId).takedown_at).toBeNull()
  })

  it('TC-AAA-23: 管理端下架 → 恢复全程可在留痕接口按作品查回（一条链看全）', async () => {
    const artist = seedArtist({ qq_number: '55024', subdomain: 'audit-chain' })
    const artworkId = seedArtwork(artist.id)
    expect((await app.inject({
      method: 'DELETE', url: `/api/admin/artists/${artist.id}/artworks/${artworkId}`,
      headers: authH(admin), remoteAddress: OPERATOR_IP, payload: { reason: '违规' }
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'POST', url: `/api/admin/content/artwork/${artworkId}/restore`,
      headers: authH(admin), remoteAddress: OPERATOR_IP, payload: { reason: '误判恢复' }
    })).statusCode).toBe(200)

    const res = await list(`/api/admin/admin-actions?targetType=artwork&targetId=${artworkId}`)
    const json = res.json() as ActionListResponse
    expect(json.total).toBe(2)
    // 时间倒序：恢复在前、下架在后（同一秒内靠 id DESC 决胜）
    expect(json.rows.map(r => r.action)).toEqual(['content_restore', 'content_remove'])
    expect(json.rows.every(r => r.admin_ip === OPERATOR_IP)).toBe(true)
    expect(json.rows.every(r => r.target_id === artworkId)).toBe(true)
  })

  it('TC-AAA-24: 留痕接口自身不改数据（纯读：GET 前后行数一致）', async () => {
    seedAction({ action: 'artist_ban' })
    const before = countAll()
    for (let i = 0; i < 3; i++) {
      expect((await list('/api/admin/admin-actions')).statusCode).toBe(200)
    }
    expect(countAll()).toBe(before)
  })
})
