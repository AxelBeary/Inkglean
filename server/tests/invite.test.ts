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

/** invite_codes 表回读行（测试内局部定义） */
interface InviteCodeRowLite {
  id: number
  code: string
  status: string
  expires_at: string | null
  used_by_artist_id: number | null
  used_at: string | null
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
    cleanDb()
    // invite_codes 不在 cleanDb 清单内（测试私有表），本文件自行清理
    db.prepare('DELETE FROM invite_codes').run()
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
    const rows = generateInviteCodes(50, 1, null)
    const codes = rows.map(r => r.code)
    expect(new Set(codes).size).toBe(50)
    // 落库唯一（UNIQUE 约束兜底）
    const stored = listInviteCodes()
    expect(new Set(stored.map(r => r.code)).size).toBe(50)
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
    const [used] = generateInviteCodes(1, 1, null)
    db.prepare("UPDATE invite_codes SET status = 'used', used_by_artist_id = 1, used_at = datetime('now') WHERE id = ?").run(used.id)
    expect(() => validateInviteCode(used.code)).toThrow('INVITE_INVALID')

    // 已吊销
    const [revoked] = generateInviteCodes(1, 1, null)
    db.prepare("UPDATE invite_codes SET status = 'revoked' WHERE id = ?").run(revoked.id)
    expect(() => validateInviteCode(revoked.code)).toThrow('INVITE_INVALID')

    // 已过期（expires_at 回拨 1 小时）
    const [expired] = generateInviteCodes(1, 1, null)
    db.prepare('UPDATE invite_codes SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 3600_000).toISOString(), expired.id)
    expect(() => validateInviteCode(expired.code)).toThrow('INVITE_INVALID')

    // 大小写不敏感
    const [ok] = generateInviteCodes(1, 1, null)
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
