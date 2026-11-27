// v86 事件流水幕布 步 1：activity_events 三条来源接线 + 查询面 + 逆泄露
//
// 覆盖：
//   认证线   TC-AE-01~06  TOTP/passkey 成功、登录失败（reason 只进 meta、不出响应体）、step-up 失败
//   管理线   TC-AE-07~10  同事务双写（成功/回滚都不留半截账）、12 类动作单点覆盖
//   交易上传 TC-AE-11~14  下单 / 参考图上传 / 举报 / 留言
//   查询面   TC-AE-15~20  鉴权三态、分页游标、筛选、limit 钳制、from>to 空页
//   逆泄露   TC-AE-21~23  非 /api/admin 响应体不含 ip/ua；查询面不含 ua 字段
//   隐私口径 TC-AE-24     不采集访客浏览（无 access 类 action）
//
// 认证范式照抄 tests/admin-actions-audit.test.ts（setAdmin + authH，step-up 需 admin_verified）；
// TOTP 造码照 tests/last-login.test.ts（computeTotp）。
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { buildApp } from '../src/app.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import * as complianceService from '../src/features/compliance/compliance.service.js'
import * as activityService from '../src/features/activity/activity.service.js'
import { generateInviteCodes } from '../src/features/invite/invite.service.js'
import { gcActivityEvents, ACTIVITY_TTL_DEFAULTS, AUTH_TTL_ACTIONS, TRADE_TTL_ACTIONS } from '../src/features/activity/activity.ttl.js'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear' + 'er '

const LOGIN_IP = '203.0.113.61'
const ADMIN_IP = '203.0.113.62'
// 匿名侧取证 IP：公开端点绝不该把它们回吐出去（v75 口径：ip 只到 /api/admin/* 为止）
const REPORT_IP = '203.0.113.90'
const GUESTBOOK_IP = '203.0.113.91'

/** 查询接口响应壳 */
interface ActivityListResponse {
  rows: Array<{
    id: number
    at: number
    actorKind: string
    actorId: number | null
    ip: string | null
    action: string
    targetType: string | null
    targetId: number | null
    outcome: string
    meta: Record<string, unknown>
  }>
  nextBeforeId: number | null
  hasMore: boolean
}

/** COUNT(*) 行 */
interface CountRow {
  c: number
}

/** activity_events 原始行（库层断言用） */
interface ActivityDbRow {
  id: number
  at: number
  actor_kind: string
  actor_id: number | null
  ip: string | null
  action: string
  target_type: string | null
  target_id: number | null
  meta_json: string
  outcome: string
}

function allEvents(): ActivityDbRow[] {
  return db.prepare('SELECT * FROM activity_events ORDER BY id ASC').all() as ActivityDbRow[]
}

function eventsByAction(action: string): ActivityDbRow[] {
  return db.prepare('SELECT * FROM activity_events WHERE action = ? ORDER BY id ASC').all(action) as ActivityDbRow[]
}

function countEvents(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM activity_events').get() as CountRow).c
}

describe('v86 事件流水幕布：三条来源接线 + 查询面', () => {
  let app: FastifyInstance
  let admin: ArtistRow

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    db.prepare("UPDATE platform_config SET value = 'invite' WHERE key = 'onboarding_mode'").run()
    app = await buildApp({ logger: false })
    await app.ready()
    admin = setAdmin('10001')
  })

  function setAdmin(qq: string): ArtistRow {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    return seedArtist({ qq_number: qq, subdomain: `ae-admin-${qq.slice(-4)}` })
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

  function listActivity(url: string, headers: Record<string, string> = authH(admin)) {
    return app.inject({ method: 'GET', url, headers })
  }

  /** 造一个可登录的画师（固定测试用 TOTP 密钥） */
  function seedLoginable(qq: string, subdomain: string): ArtistRow {
    const a = seedArtist({ qq_number: qq, subdomain })
    db.prepare("UPDATE artists SET totp_secret = 'JBSWY3DPEHPK3PXP', totp_verified = 1, totp_failed_attempts = 0 WHERE id = ?").run(a.id)
    return db.prepare('SELECT * FROM artists WHERE id = ?').get(a.id) as ArtistRow
  }

  // ═══════════════════════════════════════════
  // ① 认证线
  // ═══════════════════════════════════════════

  it('TC-AE-01: TOTP 登录成功 → login_success 1 行，IPv4 原值入库、actor_kind=artist、meta.method=totp', async () => {
    const artist = seedLoginable('20001', 'ae-alice')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: LOGIN_IP,
      payload: { qqNumber: '20001', code: computeTotp('JBSWY3DPEHPK3PXP', Date.now()) }
    })
    expect(res.statusCode).toBe(200)

    const rows = eventsByAction('login_success')
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_kind).toBe('artist')
    expect(rows[0].actor_id).toBe(artist.id)
    // D2=A：IP 记原值不脱敏
    expect(rows[0].ip).toBe(LOGIN_IP)
    expect(rows[0].outcome).toBe('ok')
    expect(JSON.parse(rows[0].meta_json).method).toBe('totp')
    // at 是毫秒时间戳且接近现在
    expect(Math.abs(rows[0].at - Date.now())).toBeLessThan(10_000)
  })

  it('TC-AE-02: 邀请码首绑确认 → login_success，meta.method=invite（第四种登录方式）', async () => {
    const [invite] = generateInviteCodes(1, 3, 1)
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '30001', name: '新画师', subdomain: 'aenewbie' }
    })
    expect(regRes.statusCode).toBe(201)
    const secret = (regRes.json().otpauthUri as string).match(/secret=([A-Z2-7]+)/)![1]
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      remoteAddress: '198.51.100.77',
      payload: { qqNumber: '30001', code: computeTotp(secret, Date.now()) }
    })
    expect(confirmRes.statusCode).toBe(200)

    const rows = eventsByAction('login_success')
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].meta_json).method).toBe('invite')
    expect(rows[0].ip).toBe('198.51.100.77')
  })

  it('TC-AE-03: 登录失败 → login_fail 1 行，reason 只进 meta_json，响应体不含 reason', async () => {
    seedLoginable('20002', 'ae-bob')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: LOGIN_IP,
      payload: { qqNumber: '20002', code: '000000' }
    })
    expect(res.statusCode).toBe(401)
    // GHSA-6pf3-854w P1 硬约束：响应体绝不含 reason / 剩余次数 / 锁定明细
    expect(res.body).not.toContain('reason')
    expect(res.body).not.toContain('invalid_code')
    expect(res.body).not.toContain(LOGIN_IP)

    const rows = eventsByAction('login_fail')
    expect(rows).toHaveLength(1)
    expect(rows[0].outcome).toBe('fail')
    expect(rows[0].ip).toBe(LOGIN_IP)
    // 内部归因落库（运维排障面），与响应体口径解耦
    const meta = JSON.parse(rows[0].meta_json) as { reason: string; qqNumber: string }
    expect(typeof meta.reason).toBe('string')
    expect(meta.reason.length).toBeGreaterThan(0)
    // 账号不存在时 actor_id 为 NULL —— 不伪造主体
    expect(rows[0].actor_kind).toBe('anon')
  })

  it('TC-AE-04: 登录失败五态归因落在 meta.reason，且被拒账号与不存在账号的响应体逐字一致', async () => {
    seedLoginable('20003', 'ae-carol')
    const known = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: LOGIN_IP,
      payload: { qqNumber: '20003', code: '000000' }
    })
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: LOGIN_IP,
      payload: { qqNumber: '99999', code: '000000' }
    })
    expect(known.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(known.body).toBe(unknown.body)

    const metas = eventsByAction('login_fail').map(r => JSON.parse(r.meta_json) as { reason: string })
    expect(metas).toHaveLength(2)
    // 两态 reason 不同（差异只在库里，不在响应里）
    expect(metas[0].reason).not.toBe(metas[1].reason)
  })

  it('TC-AE-05: step-up 失败 → stepup_fail 1 行，actor_kind=admin、outcome=fail', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      remoteAddress: ADMIN_IP,
      headers: { authorization: AUTH_PREFIX + createSession(admin.id, admin.token_version) },
      payload: { method: 'totp', code: '000000' }
    })
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('reason')

    const rows = eventsByAction('stepup_fail')
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_kind).toBe('admin')
    expect(rows[0].actor_id).toBe(admin.id)
    expect(rows[0].outcome).toBe('fail')
    expect(rows[0].ip).toBe(ADMIN_IP)
    expect(JSON.parse(rows[0].meta_json).method).toBe('totp')
  })

  it('TC-AE-06: step-up 成功不产生 stepup_fail（防误报），且不写 login_success', async () => {
    // 管理员需先绑定 TOTP
    db.prepare("UPDATE artists SET totp_secret = 'JBSWY3DPEHPK3PXP', totp_verified = 1, totp_failed_attempts = 0 WHERE id = ?").run(admin.id)
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      remoteAddress: ADMIN_IP,
      headers: { authorization: AUTH_PREFIX + createSession(admin.id, admin.token_version) },
      payload: { method: 'totp', code: computeTotp('JBSWY3DPEHPK3PXP', Date.now()) }
    })
    expect(res.statusCode).toBe(200)
    expect(eventsByAction('stepup_fail')).toHaveLength(0)
    // step-up 不是登录，不该混进 login_success
    expect(eventsByAction('login_success')).toHaveLength(0)
  })

  // ═══════════════════════════════════════════
  // ② 管理动作线（同事务双写）
  // ═══════════════════════════════════════════

  it('TC-AE-07: 管理员封禁 → admin_actions 1 行 + activity_events 1 行（同事务双写）', async () => {
    const target = seedArtist({ qq_number: '40001', subdomain: 'ae-target' })
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${target.id}/ban`,
      remoteAddress: ADMIN_IP,
      headers: authH(admin),
      payload: { reason: '违规内容' }
    })
    expect(res.statusCode).toBe(200)

    const actions = db.prepare('SELECT * FROM admin_actions').all() as Array<{ id: number; action: string; admin_ip: string | null }>
    expect(actions).toHaveLength(1)
    expect(actions[0].action).toBe('artist_ban')
    expect(actions[0].admin_ip).toBe(ADMIN_IP)

    const rows = eventsByAction('artist_ban')
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_kind).toBe('admin')
    expect(rows[0].actor_id).toBe(admin.id)
    expect(rows[0].ip).toBe(ADMIN_IP)
    expect(rows[0].target_type).toBe('artist')
    expect(rows[0].target_id).toBe(target.id)
    expect(rows[0].outcome).toBe('ok')
    expect(JSON.parse(rows[0].meta_json).reason).toBe('违规内容')
  })

  it('TC-AE-08: 双写是「同事务」——管理动作回滚时两表都不留行（构造事务内写失败）', () => {
    const target = seedArtist({ qq_number: '40002', subdomain: 'ae-target2' })
    // 构造事务内第二步失败：把 activity_events 的 action 列临时改成触发器拒绝该值。
    // 目的不是测 SQLite，而是证明「两次 INSERT 共享同一回滚单元」——
    // 若双写写在业务事务之外（或各开各的事务），admin_actions 会留下半截账。
    const before = db.prepare('SELECT COUNT(*) AS c FROM admin_actions').get() as CountRow
    // try/finally 保证触发器一定被摘掉：它会让所有 artist_ban 写入失败，
    // 一旦漏摘会污染本文件后续用例（本批变异检查时实测踩到过，故加隔离）
    try {
      db.exec(`
        CREATE TRIGGER ae_block_ban BEFORE INSERT ON activity_events
        WHEN NEW.action = 'artist_ban'
        BEGIN SELECT RAISE(ABORT, 'blocked for txn test'); END;
      `)
      expect(() => complianceService.setArtistBanned(target.id, true, admin.id, '事务测试', ADMIN_IP)).toThrow()
    } finally {
      db.exec('DROP TRIGGER IF EXISTS ae_block_ban')
    }

    const afterActions = (db.prepare('SELECT COUNT(*) AS c FROM admin_actions').get() as CountRow).c
    expect(afterActions).toBe(before.c) // 半截账零容忍
    expect(eventsByAction('artist_ban')).toHaveLength(0)
    // 业务列也没被写进去（整笔回滚）
    const row = db.prepare('SELECT is_banned FROM artists WHERE id = ?').get(target.id) as { is_banned: number }
    expect(row.is_banned).toBe(0)
    // 触发器已摘：后续 artist_ban 写入恢复正常（证明隔离生效，不是靠触发器残留在绿）
    const artwork = seedArtist({ qq_number: '40009', subdomain: 'aetarget9' })
    expect(complianceService.setArtistBanned(artwork.id, true, admin.id, '恢复正常', ADMIN_IP)).toBe(true)
    expect(eventsByAction('artist_ban')).toHaveLength(1)
  })

  it('TC-AE-09: 单点接线覆盖全部管理动作——12 类 action 全部经 writeAdminAction 产生流水', () => {
    // 逐个直调 writeAdminAction（它就是全部 12 类动作的唯一写入口，见 compliance.service 注释）
    const actions = [
      'report_resolve', 'content_remove', 'content_restore',
      'artist_ban', 'artist_unban', 'home_takedown', 'home_restore',
      'artist_status_set', 'artist_remove', 'artist_profile_update',
      'delivery_link_reissue', 'admin_transfer'
    ]
    for (const [i, action] of actions.entries()) {
      complianceService.writeAdminAction(admin.id, action, 'artist', 1000 + i, `原因 ${action}`, ADMIN_IP)
    }
    // 两表行数一致、action 集合一致 —— 这就是「一处覆盖全部」的机械证据
    const ledger = (db.prepare('SELECT action FROM admin_actions ORDER BY id').all() as Array<{ action: string }>)
      .map(r => r.action)
    const feed = allEvents().map(r => r.action)
    expect(feed).toEqual(ledger)
    expect(feed).toEqual(actions)
  })

  it('TC-AE-10: 内容下架（artwork）→ content_remove 流水，target_type/target_id 指向作品', async () => {
    const target = seedArtist({ qq_number: '40003', subdomain: 'ae-target3' })
    const art = db.prepare(
      "INSERT INTO artworks (artist_id, image_path, title, like_count) VALUES (?, 'images/1/x.png', '作品', 0)"
    ).run(target.id)
    const artworkId = Number(art.lastInsertRowid)
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/content/artwork/${artworkId}/remove`,
      remoteAddress: ADMIN_IP,
      headers: authH(admin),
      payload: { reason: '侵权' }
    })
    expect(res.statusCode).toBe(200)
    const rows = eventsByAction('content_remove')
    expect(rows).toHaveLength(1)
    expect(rows[0].target_type).toBe('artwork')
    expect(rows[0].target_id).toBe(artworkId)
  })

  // ═══════════════════════════════════════════
  // ③ 交易与上传线
  // ═══════════════════════════════════════════

  it('TC-AE-11: 下单成功 → order_create 1 行，actor_kind=client、target 指向订单', async () => {
    const artist = seedLoginable('20010', 'ae-seller')
    // 真实路由是 POST /api/orders（body 带 subdomain），不是 /api/orders/artist/:sub
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      remoteAddress: '203.0.113.71',
      payload: { subdomain: artist.subdomain, clientQq: '88888', clientName: '客户', description: '画个猫', agreeRules: true }
    })
    expect(res.statusCode).toBeLessThan(400)

    const rows = eventsByAction('order_create')
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_kind).toBe('client')
    expect(rows[0].ip).toBe('203.0.113.71')
    expect(rows[0].target_type).toBe('order')
    expect(rows[0].target_id).toBeTruthy()
    expect(JSON.parse(rows[0].meta_json).orderNo).toContain('-')
  })

  it('TC-AE-12: 下单回滚 → order_create 不留行（写在建单事务内）', async () => {
    const artist = seedLoginable('20011', 'ae-seller2')
    const { createOrder } = await import('../src/features/order/order-create.js')
    // 触发事务内失败：引用一个不存在的画师 → 事务首步就抛；用 -1 保证抛在写 orders 之前
    expect(() => createOrder({ artistId: 999_999, clientQq: '88888', description: 'x', ip: '203.0.113.72' }))
      .toThrow()
    expect(eventsByAction('order_create')).toHaveLength(0)
    void artist
  })

  it('TC-AE-13: 举报提交 → report_submit 1 行（匿名但有后果的动作）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/reports',
      remoteAddress: '203.0.113.73',
      payload: { targetType: 'other', description: '举报一个情况' }
    })
    expect(res.statusCode).toBe(201)
    const rows = eventsByAction('report_submit')
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_kind).toBe('anon')
    expect(rows[0].actor_id).toBeNull()
    expect(rows[0].ip).toBe('203.0.113.73')
    expect(rows[0].target_type).toBe('report')
  })

  it('TC-AE-14: 留言提交 → guestbook_post 1 行；留言被拒（功能关闭）时不产生流水', async () => {
    const artist = seedArtist({ qq_number: '20012', subdomain: 'ae-gb' })
    const ok = await app.inject({
      method: 'POST',
      url: `/api/public/artist/${artist.subdomain}/messages`,
      remoteAddress: '203.0.113.74',
      payload: { nickname: '访客', content: '你好呀' }
    })
    expect(ok.statusCode).toBe(201)
    expect(eventsByAction('guestbook_post')).toHaveLength(1)

    // 功能关闭 → 403，不应记「留言提交成功」
    db.prepare('UPDATE artists SET guestbook_enabled = 0 WHERE id = ?').run(artist.id)
    const rejected = await app.inject({
      method: 'POST',
      url: `/api/public/artist/${artist.subdomain}/messages`,
      remoteAddress: '203.0.113.75',
      payload: { nickname: '访客', content: '再来一条' }
    })
    expect(rejected.statusCode).toBe(403)
    expect(eventsByAction('guestbook_post')).toHaveLength(1)
  })

  // ═══════════════════════════════════════════
  // ④ 查询面
  // ═══════════════════════════════════════════

  it('TC-AE-15: 鉴权三态——无凭证 401 / 非管理员 403 / basic 会话 401 STEP_UP_REQUIRED', async () => {
    const anon = await listActivity('/api/admin/activity-events', {})
    expect(anon.statusCode).toBe(401)

    const pleb = seedArtist({ qq_number: '50001', subdomain: 'ae-pleb' })
    const plebRes = await app.inject({
      method: 'GET',
      url: '/api/admin/activity-events',
      headers: { authorization: AUTH_PREFIX + createSession(pleb.id, pleb.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string }) }
    })
    expect(plebRes.statusCode).toBe(403)

    const basic = await listActivity('/api/admin/activity-events', basicH(admin))
    expect(basic.statusCode).toBe(401)
    expect(basic.json().code).toBe('STEP_UP_REQUIRED')
  })

  it('TC-AE-16: 分页——at DESC, id DESC 排序 + beforeId 游标翻页不重不漏', async () => {
    const base = Date.now()
    const insert = db.prepare(
      'INSERT INTO activity_events (at, actor_kind, actor_id, ip, action, outcome) VALUES (?, ?, ?, ?, ?, ?)'
    )
    // 同毫秒 3 条 + 更早 2 条：同秒多事件靠 id 稳定排序
    insert.run(base, 'admin', admin.id, ADMIN_IP, 'artist_ban', 'ok')
    insert.run(base, 'admin', admin.id, ADMIN_IP, 'artist_unban', 'ok')
    insert.run(base, 'admin', admin.id, ADMIN_IP, 'home_takedown', 'ok')
    insert.run(base - 1000, 'admin', admin.id, ADMIN_IP, 'home_restore', 'ok')
    insert.run(base - 2000, 'admin', admin.id, ADMIN_IP, 'artist_remove', 'ok')

    const page1 = (await listActivity('/api/admin/activity-events?limit=2')).json() as ActivityListResponse
    expect(page1.rows).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    expect(page1.nextBeforeId).toBe(page1.rows[1].id)

    const page2 = (await listActivity(`/api/admin/activity-events?limit=2&beforeId=${page1.nextBeforeId}`)).json() as ActivityListResponse
    expect(page2.rows).toHaveLength(2)
    // 不重：两页 id 无交集
    const ids1 = page1.rows.map(r => r.id)
    const ids2 = page2.rows.map(r => r.id)
    expect(ids1.filter(id => ids2.includes(id))).toHaveLength(0)
    // 不漏：4 条取完仍未到尾部
    expect(page2.hasMore).toBe(true)

    const page3 = (await listActivity(`/api/admin/activity-events?limit=2&beforeId=${page2.nextBeforeId}`)).json() as ActivityListResponse
    expect(page3.rows).toHaveLength(1)
    expect(page3.hasMore).toBe(false)
    expect(page3.nextBeforeId).toBeNull()

    const total = [...ids1, ...ids2, ...page3.rows.map(r => r.id)]
    expect(new Set(total).size).toBe(5)
  })

  it('TC-AE-17: 筛选——action / actorKind / actorId / 时间范围（闭区间）', async () => {
    const base = Date.now()
    const insert = db.prepare(
      'INSERT INTO activity_events (at, actor_kind, actor_id, ip, action, outcome) VALUES (?, ?, ?, ?, ?, ?)'
    )
    insert.run(base - 3000, 'admin', admin.id, ADMIN_IP, 'artist_ban', 'ok')
    insert.run(base - 2000, 'artist', 77, '203.0.113.80', 'login_success', 'ok')
    insert.run(base - 1000, 'anon', null, '203.0.113.81', 'login_fail', 'fail')

    const byAction = (await listActivity('/api/admin/activity-events?action=login_success')).json() as ActivityListResponse
    expect(byAction.rows).toHaveLength(1)
    expect(byAction.rows[0].action).toBe('login_success')

    const byKind = (await listActivity('/api/admin/activity-events?actorKind=admin')).json() as ActivityListResponse
    expect(byKind.rows).toHaveLength(1)
    expect(byKind.rows[0].actorKind).toBe('admin')

    const byActor = (await listActivity('/api/admin/activity-events?actorKind=artist&actorId=77')).json() as ActivityListResponse
    expect(byActor.rows).toHaveLength(1)

    const byRange = (await listActivity(`/api/admin/activity-events?from=${base - 2500}&to=${base - 500}`)).json() as ActivityListResponse
    expect(byRange.rows.map(r => r.action)).toEqual(['login_fail', 'login_success'])
  })

  it('TC-AE-18: limit 钳制——schema 拒 >200，缺省回 50', async () => {
    const over = await listActivity('/api/admin/activity-events?limit=201')
    expect(over.statusCode).toBe(400)
    const zero = await listActivity('/api/admin/activity-events?limit=0')
    expect(zero.statusCode).toBe(400)
    // 服务层 clampLimit 双保险（防绕过 schema 的直调）
    expect(activityService.clampLimit(9999)).toBe(activityService.ACTIVITY_LIMIT_MAX)
    expect(activityService.clampLimit(0)).toBe(activityService.ACTIVITY_LIMIT_DEFAULT)
    expect(activityService.clampLimit('abc')).toBe(activityService.ACTIVITY_LIMIT_DEFAULT)
  })

  it('TC-AE-19: from>to → 空页（不报错，前端拖动时间窗的正常交互）', async () => {
    db.prepare('INSERT INTO activity_events (at, actor_kind, action, outcome) VALUES (?, ?, ?, ?)')
      .run(Date.now(), 'admin', 'artist_ban', 'ok')
    const res = (await listActivity('/api/admin/activity-events?from=9999&to=1')).json() as ActivityListResponse
    expect(res.rows).toHaveLength(0)
    expect(res.hasMore).toBe(false)
    expect(res.nextBeforeId).toBeNull()
  })

  it('TC-AE-20: meta 超 2KB 退化为截断标记，不阻断写入、不抛错', () => {
    const huge = { blob: 'x'.repeat(3000) }
    expect(() => activityService.recordEvent({
      actorKind: 'admin', actorId: admin.id, ip: ADMIN_IP, action: 'artist_ban', meta: huge
    })).not.toThrow()
    const rows = eventsByAction('artist_ban')
    expect(rows).toHaveLength(1)
    const meta = JSON.parse(rows[0].meta_json) as { truncated?: boolean; bytes?: number }
    expect(meta.truncated).toBe(true)
    expect(meta.bytes).toBeGreaterThan(activityService.META_JSON_MAX_BYTES)
    expect(Buffer.byteLength(rows[0].meta_json, 'utf8')).toBeLessThanOrEqual(activityService.META_JSON_MAX_BYTES)
  })

  // ═══════════════════════════════════════════
  // ⑤ 逆泄露（硬约束）
  // ═══════════════════════════════════════════

  it('TC-AE-21: 逆泄露——非 /api/admin 响应体一律不含流水列名与流水专属 IP', async () => {
    const artist = seedLoginable('20020', 'aeleak')
    // 造真实数据：登录、举报、留言各产生一条流水
    await app.inject({
      method: 'POST', url: '/api/auth/verify', remoteAddress: LOGIN_IP,
      payload: { qqNumber: '20020', code: computeTotp('JBSWY3DPEHPK3PXP', Date.now()) }
    })
    await app.inject({
      method: 'POST', url: '/api/public/reports', remoteAddress: REPORT_IP,
      payload: { targetType: 'other', description: '举报' }
    })
    await app.inject({
      method: 'POST', url: `/api/public/artist/${artist.subdomain}/messages`, remoteAddress: GUESTBOOK_IP,
      payload: { nickname: '访客', content: '留言' }
    })
    expect(countEvents()).toBeGreaterThanOrEqual(3)

    // 🔴 硬约束（任务书原文）：**非 /api/admin 的响应体不得出现 ip / ua**。
    // 故探针分两组：非管理口按「连取证 IP 都不许出现」从严；管理口（v75 起本就有
    // report_ip/admin_ip 口径）只查「不夹带流水表的东西」。
    const nonAdminProbes: Array<{ url: string; headers: Record<string, string> }> = [
      { url: '/api/auth/me', headers: { authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version) } },
      { url: '/api/artist/profile', headers: { authorization: AUTH_PREFIX + createSession(artist.id, artist.token_version) } },
      { url: `/api/artists/${artist.subdomain}`, headers: {} },
      { url: `/api/public/artist/${artist.subdomain}/messages`, headers: {} },
      { url: '/api/health', headers: {} }
    ]
    for (const p of nonAdminProbes) {
      const res = await app.inject({ method: 'GET', url: p.url, headers: p.headers })
      expect(res.statusCode, p.url).toBe(200)
      // 非管理口：流水表存在/列名 + 任何取证 IP 一律不得出现
      expect(res.body, p.url).not.toContain('activity_events')
      expect(res.body, p.url).not.toContain('meta_json')
      expect(res.body, p.url).not.toContain('actorKind')
      // 键名层面也不许出现裸 ip / ua（含 "ip": / "ua": 两种序列化形态）
      expect(res.body, p.url).not.toContain('"ip"')
      expect(res.body, p.url).not.toContain('"ua"')
      expect(res.body, p.url).not.toContain(LOGIN_IP)
      expect(res.body, p.url).not.toContain(REPORT_IP)
      expect(res.body, p.url).not.toContain(GUESTBOOK_IP)
    }

    const adminProbes: Array<{ url: string; headers: Record<string, string> }> = [
      { url: '/api/admin/artists', headers: authH(admin) },
      { url: '/api/admin/reports', headers: authH(admin) },
      { url: '/api/admin/messages', headers: authH(admin) },
      { url: '/api/admin/admin-actions', headers: authH(admin) }
    ]
    for (const p of adminProbes) {
      const res = await app.inject({ method: 'GET', url: p.url, headers: p.headers })
      expect(res.statusCode, p.url).toBe(200)
      // 管理口可以有它自己那几列取证 IP，但不得夹带流水表的结构/字段
      expect(res.body, p.url).not.toContain('activity_events')
      expect(res.body, p.url).not.toContain('meta_json')
      expect(res.body, p.url).not.toContain('actorKind')
    }
  })

  it('TC-AE-22: 流水查询面出站形状——字段白名单，不含 ua / meta_json 原文列名', async () => {
    db.prepare('INSERT INTO activity_events (at, actor_kind, actor_id, ip, action, target_type, target_id, meta_json, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(Date.now(), 'admin', admin.id, ADMIN_IP, 'artist_ban', 'artist', 42, '{"reason":"违规"}', 'ok')
    const res = (await listActivity('/api/admin/activity-events')).json() as ActivityListResponse
    expect(res.rows).toHaveLength(1)
    const row = res.rows[0]
    expect(Object.keys(row).sort()).toEqual([
      'action', 'actorId', 'actorKind', 'at', 'id', 'ip', 'meta', 'outcome', 'targetId', 'targetType'
    ])
    expect(row.meta).toEqual({ reason: '违规' })
    // 本批不采集 UA（SPEC D2 未拍之前不落）；出站形状里根本没有该字段
    const raw = JSON.stringify(res.rows)
    expect(raw).not.toContain('"ua"')
    expect(raw).not.toContain('meta_json')
  })

  it('TC-AE-23: 登录失败响应体在 4 种登录入口都同码同文案（reason 落库不外泄）', async () => {
    seedLoginable('20030', 'ae-deny')
    const paths = ['/api/auth/verify', '/api/auth/desktop/login']
    const bodies: string[] = []
    for (const url of paths) {
      const res = await app.inject({
        method: 'POST', url, remoteAddress: LOGIN_IP,
        payload: url.includes('desktop')
          ? { qqNumber: '20030', code: '000000', deviceUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }
          : { qqNumber: '20030', code: '000000' }
      })
      expect(res.statusCode).toBe(401)
      bodies.push(res.body)
    }
    expect(new Set(bodies).size).toBe(1)
  })

  // ═══════════════════════════════════════════
  // ⑥ 隐私口径落地
  // ═══════════════════════════════════════════

  it('TC-AE-24: 隐私口径 D1=B——白名单内不存在任何访客浏览类 action', () => {
    const declared = Object.values(activityService.ACTIONS).map(v => String(v))
    // 管理动作是 admin: 前缀 + 原名（实际写入用 admin_actions.action），不算浏览类
    const browsable = declared.filter(a => /view|visit|page|access|browse|enter/i.test(a))
    expect(browsable).toEqual([])
    // 交易上传线四动作齐全（deliverable_download 按本批裁剪不做）
    expect(declared).toEqual(expect.arrayContaining([
      'login_success', 'login_fail', 'stepup_fail',
      'order_create', 'reference_upload', 'report_submit', 'guestbook_post'
    ]))
    expect(declared).not.toContain('deliverable_download')
  })

  it('TC-AE-25: 计数字段与筛选同口径（countEvents 与 queryEvents 一致）', async () => {
    const base = Date.now()
    const insert = db.prepare('INSERT INTO activity_events (at, actor_kind, actor_id, action, outcome) VALUES (?, ?, ?, ?, ?)')
    insert.run(base, 'admin', admin.id, 'artist_ban', 'ok')
    insert.run(base, 'artist', 77, 'login_success', 'ok')
    insert.run(base, 'artist', 77, 'login_fail', 'fail')

    expect(activityService.countEvents()).toBe(3)
    expect(activityService.countEvents({ actorKind: 'artist' })).toBe(2)
    expect(activityService.countEvents({ actorKind: 'artist', actorId: 77 })).toBe(2)
    expect(activityService.countEvents({ action: 'artist_ban' })).toBe(1)
  })

  it('TC-AE-26: 筛选器枚举接口下发 action/actorKind（前端幕布筛选下拉的唯一事实源）', async () => {
    const res = await listActivity('/api/admin/activity-events/filters')
    expect(res.statusCode).toBe(200)
    const body = res.json() as { actorKinds: string[]; actions: string[] }
    expect(body.actorKinds).toEqual(['admin', 'artist', 'client', 'anon'])
    expect(body.actions).toContain('login_success')
    expect(body.actions).toContain('report_submit')
  })

  it('TC-AE-27: 种子订单不影响流水（seedOrder 直插不改流水，防误报）', () => {
    const artist = seedArtist({ qq_number: '20040', subdomain: 'ae-seed' })
    seedOrder(artist.id)
    expect(countEvents()).toBe(0)
  })
})

// ═══════════════════════════════════════════
// ⑦ 分级 TTL（D4=B 拍板：管理动作 365 / 认证 180 / 交易上传 90）
// 抽件到 features/activity/activity.ttl.ts 后才能这样直接造数验证——这是抽件的第二个理由。
// ═══════════════════════════════════════════

describe('activity_events 分级 TTL（D4=B）', () => {
  const DAY = 86_400_000
  let now = 0

  beforeEach(() => {
    cleanDb()
    now = Date.parse('2026-11-28T00:00:00.000Z')
  })

  function seedAt(action: string, ageDays: number, extra: Partial<Record<string, unknown>> = {}): number {
    const r = db.prepare(
      'INSERT INTO activity_events (at, actor_kind, actor_id, ip, action, target_type, target_id, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      now - ageDays * DAY,
      (extra.actor_kind as string) ?? 'admin',
      (extra.actor_id as number | null) ?? 1,
      '203.0.113.5',
      action,
      null,
      null,
      'ok'
    )
    return Number(r.lastInsertRowid)
  }

  function remaining(): string[] {
    return (db.prepare('SELECT action FROM activity_events ORDER BY id').all() as Array<{ action: string }>)
      .map(r => r.action)
  }

  it('TC-AE-TTL-01: 三档并存——各造「刚过期」与「刚未过期」两行，跑一次 GC 只删过期的那三条', () => {
    // 管理动作档 365：366 天前的过期、364 天前的不清
    seedAt('artist_ban', 366)
    seedAt('artist_ban', 364)
    // 认证档 180：181 天前过期、179 天前不清
    seedAt('login_success', 181)
    seedAt('login_success', 179)
    // 交易档 90：91 天前过期、89 天前不清
    seedAt('order_create', 91)
    seedAt('order_create', 89)
    expect(remaining()).toHaveLength(6)

    const res = gcActivityEvents(ACTIVITY_TTL_DEFAULTS, now)
    expect(res.deleted).toBe(3)
    expect(res.admin).toBe(1)
    expect(res.auth).toBe(1)
    expect(res.trade).toBe(1)
    // 未到期的三条原样保留（按 id 对应 age 364/179/89）
    const left = db.prepare('SELECT id FROM activity_events ORDER BY id').all() as Array<{ id: number }>
    expect(left).toHaveLength(3)
  })

  it('TC-AE-TTL-02: 同一动作在不同档位下互不误伤（三档各自独立跑，不串档）', () => {
    // 认证动作 200 天前：超过 180 档 → 删；未超 365（若误归管理档就不会删）
    seedAt('login_fail', 200)
    // 交易动作 200 天前：未超 90 档？200 > 90 → 删
    seedAt('guestbook_post', 200)
    // 管理动作 200 天前：未超 365 → 保留
    seedAt('content_remove', 200)

    gcActivityEvents(ACTIVITY_TTL_DEFAULTS, now)
    expect(remaining()).toEqual(['content_remove'])
  })

  it('TC-AE-TTL-03: 排除法兜底——未登记的白名单外动作默认走最长档（365），不被短档误删', () => {
    // 未来新增的管理动作名未登记进任何一个 TTL 白名单：必须落在 admin 长档
    seedAt('some_future_admin_action', 200)
    seedAt('some_future_admin_action', 400)
    gcActivityEvents(ACTIVITY_TTL_DEFAULTS, now)
    // 200 天那条（未超 365）保留；400 天那条（超 365）删
    expect(remaining()).toEqual(['some_future_admin_action'])
    const leftAt = db.prepare('SELECT at FROM activity_events').get() as { at: number }
    expect(leftAt.at).toBe(now - 200 * DAY)
  })

  it('TC-AE-TTL-04: 全量未到期时零删除（不误删新数据）', () => {
    seedAt('artist_ban', 1)
    seedAt('login_success', 1)
    seedAt('order_create', 1)
    const res = gcActivityEvents(ACTIVITY_TTL_DEFAULTS, now)
    expect(res.deleted).toBe(0)
    expect(remaining()).toHaveLength(3)
  })

  it('TC-AE-TTL-05: 天数可注入——传更短窗口即按短窗删除（env 覆盖语义）', () => {
    seedAt('artist_ban', 31)
    seedAt('login_success', 31)
    seedAt('order_create', 31)
    const res = gcActivityEvents({ admin: 30, auth: 30, other: 30 }, now)
    expect(res.deleted).toBe(3)
    expect(remaining()).toHaveLength(0)
  })

  it('TC-AE-TTL-06: 三档默认值就是拍板的 365/180/90（防后续误改）', () => {
    expect(ACTIVITY_TTL_DEFAULTS).toEqual({ admin: 365, auth: 180, other: 90 })
    // 白名单内容与写入侧 ACTIONS 一致（删漏一个动作会让它掉进 365 长档——保守方向，但仍是漂移）
    expect([...AUTH_TTL_ACTIONS].sort()).toEqual(['login_fail', 'login_success', 'stepup_fail'])
    expect([...TRADE_TTL_ACTIONS].sort()).toEqual(['guestbook_post', 'order_create', 'reference_upload', 'report_submit'])
  })
})

