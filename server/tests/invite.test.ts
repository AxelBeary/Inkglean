import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { buildApp } from '../src/app.js'
import {
  generateInviteCodes,
  listInviteCodes,
  revokeInviteCode,
  validateInviteCode,
  registerWithInvite,
  isInviteOnboardingEnabled
} from '../src/features/invite/invite.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

/** invite_codes 表回读行（测试内局部定义） */
interface InviteCodeRowLite {
  id: number
  code: string
  status: string
  expires_at: string | null
  used_by_artist_id: number | null
  used_at: string | null
  max_uses: number
  use_count: number
}

/** 从 otpauth URI 提取 TOTP secret（?secret=XXX&） */
function secretFromUri(uri: string) {
  const m = uri.match(/[?&]secret=([A-Z2-7]+)/)
  if (!m) throw new Error('otpauthUri 缺少 secret')
  return m[1]
}

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber = '10001') {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: 'admin-1' })
}

/** 管理员 token（d2-3 加固后邀请码管理端点受 step-up 入口闸：需 admin_verified 级会话；非管理员仍由 requireAdmin 403 拦截） */
function adminToken(artist: ArtistRow) {
  return createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
}

describe('REQ-039 邀请码注册（invite）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // cleanDb 已含 invite_code_uses / invite_codes 清理（v71 起纳入共享清单，先子后父）
    cleanDb()
    // 会话门禁批：空壳覆盖系列用例会密集调用 register，限流桶是进程级内存，须重置避免波及后续用例（429）
    resetRateLimitBuckets()
    initDatabase(db)
    // 默认入驻模式为 invite（migrate.ts 默认值）；个别用例手动切换
    db.prepare("UPDATE platform_config SET value = 'invite' WHERE key = 'onboarding_mode'").run()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // ─── 批量生成 ───

  it('TC-INV-01: 批量生成 N 个 8 位码，去易混淆字符', () => {
    const rows = generateInviteCodes(5, 3, 1)
    expect(rows).toHaveLength(5)
    for (const r of rows) {
      expect(r.code).toMatch(/^[A-Z2-9]{8}$/)
      expect(r.code).not.toMatch(/[0O1I]/)
      expect(r.status).toBe('unused')
    }
    // 过期时间 = 3 天后（±5s 容差）
    const expected = Date.now() + 3 * 24 * 60 * 60 * 1000
    for (const r of rows) {
      expect(Math.abs(new Date(r.expires_at).getTime() - expected)).toBeLessThan(5000)
    }
  })

  it('TC-INV-02: 批量生成唯一性（50 个全不同）', () => {
    const rows = generateInviteCodes(50, 1, 1, null)
    const codes = rows.map(r => r.code)
    expect(new Set(codes).size).toBe(50)
    // 落库唯一（UNIQUE 约束兜底；total 不受分页影响）
    const stored = listInviteCodes()
    expect(stored.total).toBe(50)
  })

  it('TC-INV-03: 数量/有效期边界校验（0、51、0 天、31 天拒绝）', () => {
    expect(() => generateInviteCodes(0)).toThrow('VALIDATION')
    expect(() => generateInviteCodes(51)).toThrow('VALIDATION')
    expect(() => generateInviteCodes(1, 0)).toThrow('VALIDATION')
    expect(() => generateInviteCodes(1, 31)).toThrow('VALIDATION')
  })

  it('TC-INV-04: 默认有效期 3 天', () => {
    const rows = generateInviteCodes(1)
    const diff = new Date(rows[0].expires_at).getTime() - Date.now()
    expect(diff).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000)
    expect(diff).toBeLessThan(3.1 * 24 * 60 * 60 * 1000)
  })

  // ─── 校验（同响应防枚举） ───

  it('TC-INV-05: 不存在 / 已用 / 已吊销 / 已过期 → 同一错误码 INVITE_INVALID', () => {
    const fail = () => expect(() => validateInviteCode('XXXXXXXX')).toThrow('INVITE_INVALID')
    fail()

    // 已用
    const [used] = generateInviteCodes(1, 1)
    db.prepare("UPDATE invite_codes SET status = 'used', used_by_artist_id = 1, used_at = datetime('now') WHERE id = ?").run(used.id)
    expect(() => validateInviteCode(used.code)).toThrow('INVITE_INVALID')

    // 已吊销
    const [revoked] = generateInviteCodes(1, 1)
    db.prepare("UPDATE invite_codes SET status = 'revoked' WHERE id = ?").run(revoked.id)
    expect(() => validateInviteCode(revoked.code)).toThrow('INVITE_INVALID')

    // 已过期（expires_at 回拨 1 小时）
    const [expired] = generateInviteCodes(1, 1)
    db.prepare('UPDATE invite_codes SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 3600_000).toISOString(), expired.id)
    expect(() => validateInviteCode(expired.code)).toThrow('INVITE_INVALID')

    // 大小写不敏感
    const [ok] = generateInviteCodes(1, 1)
    expect(validateInviteCode(ok.code.toLowerCase()).id).toBe(ok.id)
  })

  // ─── 注册事务 ───

  it('TC-INV-06: 注册成功：建号 hidden + TOTP 密钥未验证 + 码一次性消费', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)

    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20001', name: '新画师', subdomain: 'newbie' }
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.qqNumber).toBe('20001')
    expect(body.otpauthUri).toContain('secret=')

    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '20001'").get() as ArtistRow
    expect(artist.status).toBe('hidden')
    expect(artist.totp_secret).toBeTruthy()
    expect(artist.totp_verified).toBe(0)

    const consumed = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(consumed.status).toBe('used')
    expect(consumed.used_by_artist_id).toBe(artist.id)
    expect(consumed.used_at).toBeTruthy()

    // 建号完整（须知/默认工作流已初始化）
    const rules = db.prepare('SELECT COUNT(*) AS c FROM commission_rules WHERE artist_id = ?').get(artist.id) as { c: number }
    expect(rules.c).toBe(1)
    const stages = db.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?').get(artist.id) as { c: number }
    expect(stages.c).toBeGreaterThan(0)
  })

  it('TC-INV-07: QQ 冲突 → QQ_TAKEN，码保持 unused（事务回滚）', async () => {
    setAdmin()
    seedArtist({ qq_number: '20002', subdomain: 'taken' })
    const [invite] = generateInviteCodes(1, 3, 1)

    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20002', name: '重复', subdomain: 'newbie2' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('QQ_TAKEN')
    const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(row.status).toBe('unused')
    expect(row.used_by_artist_id).toBeNull()
  })

  // ─── 空壳账号覆盖（会话门禁批）：从未完成 TOTP 绑定的空壳可被新邀请码推倒重来 ───

  it('TC-INV-07b: 空壳账号（未绑定/未删除/未封禁）可被新码覆盖重来，原码不回退', async () => {
    setAdmin()
    // 第一次注册：造出空壳（verified=0）
    const [invite1] = generateInviteCodes(1, 3, 1)
    const first = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite1.code, qqNumber: '21001', name: '首次', subdomain: 'shell1' }
    })
    expect(first.statusCode).toBe(201)
    const shellRow = db.prepare("SELECT * FROM artists WHERE qq_number = '21001'").get() as ArtistRow
    expect(shellRow.totp_verified).toBe(0)
    // 模拟壳上已有简介（覆盖后应置空）
    db.prepare("UPDATE artists SET bio = '旧简介' WHERE id = ?").run(shellRow.id)
    const stagesBefore = (db.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?').get(shellRow.id) as { c: number }).c

    // 第二次：新码推倒重来（改写 name/子域名）
    const [invite2] = generateInviteCodes(1, 3, 1)
    const second = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite2.code, qqNumber: '21001', name: '重来', subdomain: 'shell1x' }
    })
    expect(second.statusCode).toBe(201)
    const body2 = second.json()
    expect(body2.qqNumber).toBe('21001')
    expect(body2.otpauthUri).toContain('secret=')

    // 就地更新既有行：id 保留，新入参生效，bio 置空，状态回 hidden
    const updated = db.prepare("SELECT * FROM artists WHERE qq_number = '21001'").get() as ArtistRow
    expect(updated.id).toBe(shellRow.id)
    expect(updated.name).toBe('重来')
    expect(updated.subdomain).toBe('shell1x')
    expect(updated.artist_code).toBe('SHELL1X')
    expect(updated.bio).toBeNull()
    expect(updated.status).toBe('hidden')
    expect(updated.totp_verified).toBe(0)
    expect(updated.totp_secret).toBeTruthy()
    // 新密钥确实不同（重生成，旧壳密钥作废）
    expect(secretFromUri(body2.otpauthUri)).not.toBe(secretFromUri(first.json().otpauthUri))

    // 不重复初始化：须知仍 1 条、工作流不重复（与覆盖前同数）
    const rules = db.prepare('SELECT COUNT(*) AS c FROM commission_rules WHERE artist_id = ?').get(updated.id) as { c: number }
    expect(rules.c).toBe(1)
    const stagesAfter = (db.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?').get(updated.id) as { c: number }).c
    expect(stagesAfter).toBe(stagesBefore)

    // 新码被消费且归属壳 id；原邀请码不回退（仍 used）
    const used2 = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite2.id) as InviteCodeRowLite
    expect(used2.status).toBe('used')
    expect(used2.used_by_artist_id).toBe(shellRow.id)
    const used1 = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite1.id) as InviteCodeRowLite
    expect(used1.status).toBe('used')

    // 未删行重建：该 QQ 名下仍只有一行，且 id 未变
    const count = db.prepare("SELECT COUNT(*) AS c FROM artists WHERE qq_number = '21001'").get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('TC-INV-07c: 覆盖时空壳自身 subdomain/artist_code 复用合法（不报 TAKEN）', async () => {
    setAdmin()
    const [invite1] = generateInviteCodes(1, 3, 1)
    const first = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite1.code, qqNumber: '21002', name: '首次', subdomain: 'shell2' }
    })
    expect(first.statusCode).toBe(201)

    const [invite2] = generateInviteCodes(1, 3, 1)
    const second = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite2.code, qqNumber: '21002', name: '同名重来', subdomain: 'shell2' }
    })
    expect(second.statusCode).toBe(201)
    const updated = db.prepare("SELECT * FROM artists WHERE qq_number = '21002'").get() as ArtistRow
    expect(updated.name).toBe('同名重来')
    expect(updated.subdomain).toBe('shell2')
  })

  it('TC-INV-07d: 覆盖时 subdomain 与其他账号冲突 → SUBDOMAIN_TAKEN，码不消费', async () => {
    setAdmin()
    // 冲突账号：artist_code 故意与 subdomain 解耦，确保只触发 subdomain 碰撞分支（否则 artist_code 派生同撞会先报 CODE_TAKEN）
    seedArtist({ qq_number: '29001', subdomain: 'occupied', artist_code: 'OTHERCODE' })
    const [invite1] = generateInviteCodes(1, 3, 1)
    const first = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite1.code, qqNumber: '21003', name: '首次', subdomain: 'shell3' }
    })
    expect(first.statusCode).toBe(201)

    const [invite2] = generateInviteCodes(1, 3, 1)
    const second = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite2.code, qqNumber: '21003', name: '冲突', subdomain: 'occupied' }
    })
    expect(second.statusCode).toBe(400)
    expect(second.json().code).toBe('SUBDOMAIN_TAKEN')
    const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite2.id) as InviteCodeRowLite
    expect(row.status).toBe('unused')
  })

  it('TC-INV-07e: 已验证/已删除/已封禁账号仍报 QQ_TAKEN（不可覆盖）', async () => {
    setAdmin()
    // 已验证（seedArtist 默认已绑定）
    seedArtist({ qq_number: '21004', subdomain: 'verified' })
    // 已删除：未绑定壳但软删 → 不在可覆盖范围
    const deleted = seedArtist({ qq_number: '21005', subdomain: 'softdel', totp_secret: null, totp_verified: 0 })
    db.prepare("UPDATE artists SET deleted_at = datetime('now') WHERE id = ?").run(deleted.id)
    // 已封禁：未绑定壳但封禁 → 不在可覆盖范围
    const banned = seedArtist({ qq_number: '21006', subdomain: 'banned', totp_secret: null, totp_verified: 0 })
    db.prepare('UPDATE artists SET is_banned = 1 WHERE id = ?').run(banned.id)

    for (const qq of ['21004', '21005', '21006']) {
      const [invite] = generateInviteCodes(1, 3, 1)
      const res = await app.inject({
        method: 'POST',
        url: '/api/invite/register',
        payload: { code: invite.code, qqNumber: qq, name: '覆盖尝试', subdomain: `probe${qq.slice(-2)}` }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('QQ_TAKEN')
      const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
      expect(row.status).toBe('unused')
    }
  })

  it('TC-INV-08: 子域名保留词 → SUBDOMAIN_FORMAT，码保持 unused', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)

    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20003', name: '保留', subdomain: 'admin' }
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('SUBDOMAIN_FORMAT')
    const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(row.status).toBe('unused')
  })

  it('TC-INV-09: 一次性消费——同码第二次注册 INVITE_INVALID', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)
    const payload = { code: invite.code, qqNumber: '20004', name: '首用', subdomain: 'first' }

    const first = await app.inject({ method: 'POST', url: '/api/invite/register', payload })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({ method: 'POST', url: '/api/invite/register', payload })
    expect(second.statusCode).toBe(400)
    expect(second.json().code).toBe('INVITE_INVALID')

    // 画师只有一位
    const count = db.prepare("SELECT COUNT(*) AS c FROM artists WHERE qq_number = '20004'").get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('TC-INV-10: 无效码与不存在同响应（防枚举）', async () => {
    setAdmin()
    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: 'ZZZZZZZZ', qqNumber: '20005', name: '枚举', subdomain: 'enumprobe' }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVITE_INVALID')
  })

  // ─── 入驻模式开关 ───

  it('TC-INV-12: status 反映 onboarding_mode；manual 时 register 拒绝 ONBOARDING_DISABLED', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)

    const enabledRes = await app.inject({ method: 'GET', url: '/api/invite/status' })
    expect(enabledRes.json()).toEqual({ enabled: true })
    expect(isInviteOnboardingEnabled()).toBe(true)

    db.prepare("UPDATE platform_config SET value = 'manual' WHERE key = 'onboarding_mode'").run()

    const disabledRes = await app.inject({ method: 'GET', url: '/api/invite/status' })
    expect(disabledRes.json()).toEqual({ enabled: false })

    const register = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20006', name: '手动模式', subdomain: 'manualmode' }
    })
    expect(register.statusCode).toBe(400)
    expect(register.json().code).toBe('ONBOARDING_DISABLED')

    // 码未被消费
    const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(row.status).toBe('unused')
  })

  // ─── TOTP 首绑确认 ───

  it('TC-INV-13: 注册后 totp-confirm 验证通过并签发会话', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)
    const reg = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20007', name: '绑码', subdomain: 'totpbind' }
    })
    const secret = secretFromUri(reg.json().otpauthUri)
    const code = computeTotp(secret, Date.now())

    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20007', code }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.isAdmin).toBe(false)
    expect(body.artist.qqNumber).toBe('20007')
    expect(body.artist.subdomain).toBe('totpbind')
    const setCookie = res.headers['set-cookie']
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
    expect(cookieHeader).toBeTruthy()
    expect(cookieHeader).toContain('artist_token=')

    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '20007'").get() as ArtistRow
    expect(artist.totp_verified).toBe(1)
  })

  it('TC-INV-14: totp-confirm 错误码拒绝，重复使用同一码拒绝（重放防护）', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)
    const reg = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20008', name: '重放', subdomain: 'replay' }
    })
    const secret = secretFromUri(reg.json().otpauthUri)
    const code = computeTotp(secret, Date.now())

    const bad = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20008', code: '000000' }
    })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().code).toBe('TOTP_BIND_INVALID')

    const ok = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20008', code }
    })
    expect(ok.statusCode).toBe(200)

    // 已绑定后再次确认 → TOTP_NOT_BOUND（已首绑完成，拒绝重复确认）
    const again = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20008', code }
    })
    expect(again.statusCode).toBe(400)
    expect(again.json().code).toBe('TOTP_NOT_BOUND')
  })

  it('TC-INV-14b (v126): 错码拒绝携带剩余次数；刚轮换的旧码判 stale（仅文案分流，不放宽校验）', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)
    const reg = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '20014', name: '分流', subdomain: 'splitmsg' }
    })
    const secret = secretFromUri(reg.json().otpauthUri)

    // 第一错：纯错码（不在 ±3 窗口）→ stale=false，剩余 4 次
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20014', code: '000000' }
    })
    expect(wrong.statusCode).toBe(400)
    expect(wrong.json().code).toBe('TOTP_BIND_INVALID')
    expect(wrong.json().detail).toMatchObject({ stale: false, remainingAttempts: 4 })

    // 第二错：两个时间步前的旧码（不在有效窗 ±1，落在 ±3）→ stale=true，剩余 3 次
    const staleCode = computeTotp(secret, Date.now() - 2 * 30_000)
    const stale = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20014', code: staleCode }
    })
    expect(stale.statusCode).toBe(400)
    expect(stale.json().code).toBe('TOTP_BIND_INVALID')
    expect(stale.json().detail).toMatchObject({ stale: true, remainingAttempts: 3 })

    // 分流仅改文案不改拦截：两次失败后仍未绑定，正确码仍可完成首绑
    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '20014'").get() as ArtistRow
    expect(artist.totp_verified).toBe(0)
    const ok = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '20014', code: computeTotp(secret, Date.now()) }
    })
    expect(ok.statusCode).toBe(200)
  })

  // ─── 管理端 ───

  it('TC-INV-15: 管理端生成/列表/吊销全链路', async () => {
    const admin = setAdmin()
    const headers = { Authorization: `Bearer ${adminToken(admin)}` }

    const gen = await app.inject({
      method: 'POST',
      url: '/api/admin/invite-codes',
      headers,
      payload: { count: 3, validDays: 5 }
    })
    expect(gen.statusCode).toBe(201)
    expect(gen.json().codes).toHaveLength(3)
    const created = gen.json().codes[0]
    expect(created.code).toMatch(/^[A-Z2-9]{8}$/)

    const list = await app.inject({ method: 'GET', url: '/api/admin/invite-codes', headers })
    expect(list.statusCode).toBe(200)
    expect(list.json().codes).toHaveLength(3)
    expect(list.json().codes[0].usedBy).toBeNull()
    expect(list.json().codes[0].expiresAt).toBeTruthy()

    const revoke = await app.inject({
      method: 'POST',
      url: `/api/admin/invite-codes/${created.id}/revoke`,
      headers
    })
    expect(revoke.statusCode).toBe(200)
    expect(revoke.json().status).toBe('revoked')

    // 已吊销不可再吊销
    const again = await app.inject({
      method: 'POST',
      url: `/api/admin/invite-codes/${created.id}/revoke`,
      headers
    })
    expect(again.statusCode).toBe(400)
    expect(again.json().code).toBe('INVITE_CANNOT_REVOKE')

    // 非管理员 403
    const pleb = seedArtist({ qq_number: '30001', subdomain: 'pleb' })
    const denied = await app.inject({
      method: 'GET',
      url: '/api/admin/invite-codes',
      headers: { Authorization: `Bearer ${adminToken(pleb)}` }
    })
    expect(denied.statusCode).toBe(403)
  })

  it('TC-INV-16: 管理端生成参数校验（count/validDays 越界 → VALIDATION）', async () => {
    const admin = setAdmin()
    const headers = { Authorization: `Bearer ${adminToken(admin)}` }
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/invite-codes',
      headers,
      payload: { count: 0 }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('VALIDATION')
  })

  it('TC-INV-17: 迁移 v58 建表（invite_codes 存在 + 索引存在）', () => {
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invite_codes'").get()
    expect(table).toBeTruthy()
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invite_codes'").all() as Array<{ name: string }>
    expect(indexes.map(i => i.name)).toEqual(
      expect.arrayContaining(['idx_invite_codes_code', 'idx_invite_codes_status'])
    )
  })

  it('TC-INV-18: 服务层 revokeInviteCode 对不存在 id 返回 NOT_FOUND', () => {
    expect(() => revokeInviteCode(99999)).toThrow('NOT_FOUND')
  })

  it('TC-INV-19: 已使用码不可吊销（服务层）', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 1)
    db.prepare("UPDATE invite_codes SET status = 'used', used_by_artist_id = 1, used_at = datetime('now') WHERE id = ?").run(invite.id)
    expect(() => revokeInviteCode(invite.id)).toThrow('INVITE_CANNOT_REVOKE')
  })

  it('TC-INV-20: registerWithInvite 事务性——子域名冲突时 TOTP 密钥不残留', async () => {
    setAdmin()
    // artist_code 不同名，确保先命中子域名冲突（createArtist 口径：身份码先于子域名校验）
    seedArtist({ qq_number: '40001', subdomain: 'occupied', artist_code: 'OTHER' })
    const [invite] = generateInviteCodes(1, 3, 1)
    expect(() =>
      registerWithInvite({ code: invite.code, qqNumber: '40002', name: '冲突', subdomain: 'occupied' })
    ).toThrow('SUBDOMAIN_TAKEN')
    const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(row.status).toBe('unused')
    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '40002'").get() as ArtistRow | undefined
    expect(artist).toBeUndefined()
  })

  // ─── 多次使用（v71：每码可用次数 1-100） ───

  it('TC-INV-21: 多次码额度内可多人注册，用满置 used，超额拒绝且逐次留痕', async () => {
    setAdmin()
    const [invite] = generateInviteCodes(1, 3, 2) // maxUses=2

    // 第一人：额度未用完，码保持 unused
    registerWithInvite({ code: invite.code, qqNumber: '50001', name: '多次一', subdomain: 'multi1' })
    const mid = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(mid.status).toBe('unused')
    expect(mid.use_count).toBe(1)

    // 第二人：额度用满 → used
    registerWithInvite({ code: invite.code, qqNumber: '50002', name: '多次二', subdomain: 'multi2' })
    const full = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(invite.id) as InviteCodeRowLite
    expect(full.status).toBe('used')
    expect(full.use_count).toBe(2)

    // 第三人：额度已满 → INVITE_INVALID，且不残留账号
    expect(() =>
      registerWithInvite({ code: invite.code, qqNumber: '50003', name: '超额', subdomain: 'multi3' })
    ).toThrow('INVITE_INVALID')
    const extra = db.prepare("SELECT COUNT(*) AS c FROM artists WHERE qq_number = '50003'").get() as { c: number }
    expect(extra.c).toBe(0)

    // 使用明细：两行，逐次留痕
    const uses = db.prepare('SELECT * FROM invite_code_uses WHERE invite_code_id = ? ORDER BY id').all(invite.id) as Array<{ artist_id: number; used_at: string }>
    expect(uses).toHaveLength(2)
    for (const u of uses) {
      expect(u.artist_id).toBeTruthy()
      expect(u.used_at).toBeTruthy()
    }
  })

  it('TC-INV-22: maxUses 边界校验（0/101 拒绝，service 层 + HTTP schema 双闸）', async () => {
    expect(() => generateInviteCodes(1, 3, 0)).toThrow('VALIDATION')
    expect(() => generateInviteCodes(1, 3, 101)).toThrow('VALIDATION')

    const admin = setAdmin()
    const headers = { Authorization: `Bearer ${adminToken(admin)}` }
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/invite-codes',
      headers,
      payload: { count: 1, maxUses: 101 }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-INV-23: 列表状态筛选（含派生态 expired）+ 码搜索 + 服务端分页', async () => {
    const admin = setAdmin()
    const headers = { Authorization: `Bearer ${adminToken(admin)}` }

    const [u1, u2] = generateInviteCodes(2, 5, 1, admin.id) // unused 有效
    const [used] = generateInviteCodes(1, 5, 1, admin.id)
    db.prepare("UPDATE invite_codes SET status = 'used', used_by_artist_id = ?, used_at = datetime('now') WHERE id = ?").run(admin.id, used.id)
    const [revoked] = generateInviteCodes(1, 5, 1, admin.id)
    db.prepare("UPDATE invite_codes SET status = 'revoked' WHERE id = ?").run(revoked.id)
    const [expired] = generateInviteCodes(1, 5, 1, admin.id)
    db.prepare('UPDATE invite_codes SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 3600_000).toISOString(), expired.id)

    // 全量：5 张 + total 同口径
    const all = await app.inject({ method: 'GET', url: '/api/admin/invite-codes', headers })
    expect(all.statusCode).toBe(200)
    expect(all.json().codes).toHaveLength(5)
    expect(all.json().total).toBe(5)

    // unused 筛掉已过期；expired 只命中过期未用
    const unused = await app.inject({ method: 'GET', url: '/api/admin/invite-codes?status=unused', headers })
    expect(unused.json().codes).toHaveLength(2)
    const expiredRes = await app.inject({ method: 'GET', url: '/api/admin/invite-codes?status=expired', headers })
    expect(expiredRes.json().codes).toHaveLength(1)
    expect(expiredRes.json().codes[0].id).toBe(expired.id)
    expect(expiredRes.json().codes[0].expired).toBe(true)

    // used / revoked 各 1
    const usedRes = await app.inject({ method: 'GET', url: '/api/admin/invite-codes?status=used', headers })
    expect(usedRes.json().codes).toHaveLength(1)
    const revokedRes = await app.inject({ method: 'GET', url: '/api/admin/invite-codes?status=revoked', headers })
    expect(revokedRes.json().codes).toHaveLength(1)

    // 码模糊搜索（取 u1 中间 4 位，大小写不敏感）
    const q = u1.code.slice(2, 6).toLowerCase()
    const search = await app.inject({ method: 'GET', url: `/api/admin/invite-codes?q=${q}`, headers })
    expect(search.json().codes.map((c: { id: number }) => c.id)).toContain(u1.id)

    // 分页：pageSize=2 → 首页 2 条 total=5；第三页 1 条
    const p1 = await app.inject({ method: 'GET', url: '/api/admin/invite-codes?pageSize=2&page=1', headers })
    expect(p1.json().codes).toHaveLength(2)
    expect(p1.json().total).toBe(5)
    expect(p1.json().pageSize).toBe(2)
    const p3 = await app.inject({ method: 'GET', url: '/api/admin/invite-codes?pageSize=2&page=3', headers })
    expect(p3.json().codes).toHaveLength(1)

    // 额度字段下发（u2 未消费：0/1）
    const u2Row = all.json().codes.find((c: { id: number }) => c.id === u2.id)
    expect(u2Row.maxUses).toBe(1)
    expect(u2Row.useCount).toBe(0)
  })

  it('TC-INV-24: 使用明细端点——多次码名单倒序下发；不存在 id → NOT_FOUND', async () => {
    const admin = setAdmin()
    const headers = { Authorization: `Bearer ${adminToken(admin)}` }
    const [invite] = generateInviteCodes(1, 3, 2)
    registerWithInvite({ code: invite.code, qqNumber: '50011', name: '明细一', subdomain: 'usesone' })
    registerWithInvite({ code: invite.code, qqNumber: '50012', name: '明细二', subdomain: 'usestwo' })

    const res = await app.inject({ method: 'GET', url: `/api/admin/invite-codes/${invite.id}/uses`, headers })
    expect(res.statusCode).toBe(200)
    const uses = res.json().uses
    expect(uses).toHaveLength(2)
    // 倒序：最近使用者（50012）在前
    expect(uses[0].qqNumber).toBe('50012')
    expect(uses[0].name).toBe('明细二')
    expect(uses[0].usedAt).toBeTruthy()

    const missing = await app.inject({ method: 'GET', url: '/api/admin/invite-codes/99999/uses', headers })
    expect(missing.statusCode).toBe(404)
  })

  // ─── 限流（放在最后：rate-limit 桶为模块级全局，前面的注册用例已累计计数） ───

  it('TC-INV-11: 限流存在性——连续注册超过阈值返回 RATE_LIMITED', async () => {
    setAdmin()
    let seen429 = false
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/invite/register',
        payload: { code: `A${String(i).padStart(7, '0')}`, qqNumber: `200${String(i).padStart(4, '0')}`, name: '限流', subdomain: `rl${i}` }
      })
      if (res.statusCode === 429 && res.json().code === 'RATE_LIMITED') {
        seen429 = true
        break
      }
    }
    expect(seen429).toBe(true)
  })
})
