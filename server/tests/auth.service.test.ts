import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import * as authService from '../src/features/auth/auth.service.js'
import type { SessionPayload } from '../src/features/auth/auth.service.js'
import type { Artist } from '../src/types/entities.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'

/** verifyTotpLogin 拒绝形态断言视图（成功分支 { valid: true, artist } 无 code/error） */
interface TotpDenyResult {
  valid: boolean
  code: string
  error: string
}

/** verifyTotpLogin 成功形态断言视图 */
interface TotpAllowResult {
  valid: boolean
  artist: { id: number }
}

describe('认证服务 (Auth Service) — REQ-027 TOTP', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    // 会话门禁批：本组用例验证绑定/登录全流程，需从「未绑定」初态起步，显式覆盖 seedArtist 的已绑定默认值
    artist = seedArtist({ qq_number: '12345', subdomain: 'alice', totp_secret: null, totp_verified: 0 })
  })

  // ─── 绑定流程 ───

  it('TC-A-01: 初始状态未绑定', () => {
    const status = authService.getTotpStatus(artist)
    expect(status.hasSecret).toBe(false)
    expect(status.verified).toBe(false)
  })

  it('TC-A-02: bindTotpInit 写入密钥但未验证', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_secret: string; totp_verified: number }
    expect(row.totp_secret).toBe(secret)
    expect(row.totp_verified).toBe(0)
  })

  it('TC-A-03: confirmTotpBind 正确码完成绑定', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    const code = computeTotp(secret, Date.now())
    authService.confirmTotpBind(artist.id, code)
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_verified: number }
    expect(row.totp_verified).toBe(1)
  })

  it('TC-A-04: confirmTotpBind 错误码抛 TOTP_BIND_INVALID', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    expect(() => authService.confirmTotpBind(artist.id, '000000')).toThrowError(/TOTP_BIND_INVALID/)
    // 绑定状态不变
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(artist.id) as { totp_verified: number }
    expect(row.totp_verified).toBe(0)
  })

  it('TC-A-05: confirmTotpBind 未先生成密钥抛 TOTP_NOT_BOUND', () => {
    expect(() => authService.confirmTotpBind(artist.id, '123456')).toThrowError(/TOTP_NOT_BOUND/)
  })

  it('TC-A-06: bindTotpInit 重复调用覆盖旧密钥', () => {
    const secret1 = generateSecret()
    const secret2 = generateSecret()
    authService.bindTotpInit(artist.id, secret1)
    authService.bindTotpInit(artist.id, secret2)
    const row = db.prepare('SELECT totp_secret FROM artists WHERE id = ?').get(artist.id) as { totp_secret: string }
    expect(row.totp_secret).toBe(secret2)
  })

  // ─── 登录校验 ───

  it('TC-A-07: 未绑定画师登录返回 TOTP_INVALID（audit-a P3-11 防枚举统一）', () => {
    const result = authService.verifyTotpLogin('12345', '123456') as TotpDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    expect(result.error).toBe('QQ号或动态口令错误')
  })

  it('TC-A-08: 已绑定 + 正确动态码登录成功', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))

    const code = computeTotp(secret, Date.now())
    const result = authService.verifyTotpLogin('12345', code) as TotpAllowResult
    expect(result.valid).toBe(true)
    expect(result.artist.id).toBe(artist.id)
  })

  it('TC-A-09: 错误动态码返回 TOTP_INVALID（含剩余机会提示）', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))

    const result = authService.verifyTotpLogin('12345', '000000') as TotpDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    expect(result.error).toContain('剩余 4 次机会')
  })

  it('TC-A-10: 未注册 QQ 防枚举（与码错误同响应）', () => {
    const result = authService.verifyTotpLogin('99999', '123456') as TotpDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    // 不泄露「未注册」信息
    expect(result.error).not.toContain('注册')
  })

  // ─── 防爆破 ───

  it('TC-A-11: 连续错 5 次触发锁定', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))

    // P2-F3: 每次失败后计数应原子递增且与 DB 一致（防 read-modify-write 丢失更新回归）
    for (let i = 1; i <= 4; i++) {
      const r = authService.verifyTotpLogin('12345', '000000') as TotpDenyResult
      expect(r.valid).toBe(false)
      expect(r.code).toBe('TOTP_INVALID')
      const mid = db.prepare('SELECT totp_failed_attempts FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number }
      expect(mid.totp_failed_attempts).toBe(i)
    }
    // 第 5 次错误 → 锁定
    const locked = authService.verifyTotpLogin('12345', '000000') as TotpDenyResult
    expect(locked.valid).toBe(false)
    expect(locked.code).toBe('TOTP_LOCKED')

    // 查库验证锁定时间已写入、计数已归零（触发锁定时清零）
    const row = db.prepare('SELECT totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_locked_until: number }
    expect(row.totp_locked_until).toBeGreaterThan(Date.now())
    const after = db.prepare('SELECT totp_failed_attempts FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number }
    expect(after.totp_failed_attempts).toBe(0)
  })

  it('TC-A-12: 锁定期间正确码也拒绝', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 手动触发锁定
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?').run(Date.now() + 15 * 60_000, artist.id)

    const code = computeTotp(secret, Date.now())
    const result = authService.verifyTotpLogin('12345', code) as TotpDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_LOCKED')
  })

  it('TC-A-13: 锁定过期后允许重试', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 锁定时间设为过去（模拟锁定已过期）
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?').run(Date.now() - 1000, artist.id)

    const code = computeTotp(secret, Date.now())
    const result = authService.verifyTotpLogin('12345', code)
    expect(result.valid).toBe(true)
  })

  it('TC-A-13b: totp_locked_until 落成 ISO 字符串时仍正确判锁（260830 审计 M-6 口径统一）', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 字符串口径：模拟历史/异构写入把锁定时刻落成 ISO 文本——
    // 修复前 verifyTotpLogin 裸 `>` 比较会退化为字符串比较得出错误结论
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?')
      .run(new Date(Date.now() + 15 * 60_000).toISOString(), artist.id)

    const result = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now())) as TotpDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_LOCKED')

    // checkTotpLocked（绑定/确认路径共用）与登录路径同口径
    const row = db.prepare('SELECT totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_locked_until: string }
    expect(() => authService.checkTotpLocked(row)).toThrowError(/TOTP_LOCKED/)

    // parseLockedUntilMs 单一解析函数自身口径锁定
    expect(authService.parseLockedUntilMs(123)).toBe(123)
    expect(authService.parseLockedUntilMs(Number.NaN)).toBe(0)
    expect(authService.parseLockedUntilMs('not-a-date')).toBe(0)
    expect(authService.parseLockedUntilMs(null)).toBe(0)
    expect(authService.parseLockedUntilMs(undefined)).toBe(0)
  })

  it('TC-A-14: 登录成功清零失败计数', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 错 2 次
    authService.verifyTotpLogin('12345', '000000')
    authService.verifyTotpLogin('12345', '000000')
    let row = db.prepare('SELECT totp_failed_attempts FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until?: number | null }
    expect(row.totp_failed_attempts).toBe(2)

    // 正确登录
    authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()))
    row = db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until?: number | null }
    expect(row.totp_failed_attempts).toBe(0)
    expect(row.totp_locked_until).toBeNull()
  })

  // ─── 重置 ───

  it('TC-A-15: resetTotp 清空绑定（旧密钥失效）', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))

    authService.resetTotp(artist.id)
    const status = authService.getTotpStatus(db.prepare('SELECT * FROM artists WHERE id = ?').get(artist.id) as Artist)
    expect(status.hasSecret).toBe(false)
    expect(status.verified).toBe(false)

    // 旧密钥的码已无法登录
    const result = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now())) as TotpDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
  })

  // ─── 会话 Token（原样保留） ───

  it('TC-A-16: Token 创建后可正确解析', () => {
    const token = authService.createSession(artist.id, artist.token_version)
    const session = authService.verifySession(token) as SessionPayload

    expect(session).not.toBeNull()
    expect(session.id).toBe(artist.id)
    expect(session.t).toBeTypeOf('number')
  })

  it('TC-A-17: 篡改 Token 返回 null', () => {
    const token = authService.createSession(artist.id, artist.token_version)
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A')

    expect(authService.verifySession(tampered)).toBeNull()
  })

  it('TC-A-18: 超过7天的 Token 返回 null', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production'
    const payload = Buffer.from(JSON.stringify({ id: artist.id, t: eightDaysAgo })).toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const token = `${payload}.${sig}`

    expect(authService.verifySession(token)).toBeNull()
  })

  it('TC-A-19: 空 Token 返回 null', () => {
    expect(authService.verifySession(null as unknown as string)).toBeNull()
    expect(authService.verifySession('')).toBeNull()
    expect(authService.verifySession('invalid')).toBeNull()
  })
})
