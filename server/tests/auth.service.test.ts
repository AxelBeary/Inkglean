import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createHmac } from 'crypto'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import * as authService from '../src/features/auth/auth.service.js'
import type { SessionPayload, TotpLoginDenyResult } from '../src/features/auth/auth.service.js'
import type { Artist } from '../src/types/entities.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'

/** verifyTotpLogin 成功形态断言视图 */
interface TotpAllowResult {
  valid: boolean
  artist: { id: number }
}

describe('认证服务 (Auth Service) — REQ-027 TOTP', () => {
  let artist: ArtistRow

  beforeEach(() => {
    cleanDb()
    // GHSA-6pf3-854w：IP+账号防爆破态是进程内存（跨用例残留会让锁定误伤后续用例），逐例清空
    authService.resetTotpLoginAttemptStore()
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
    const result = authService.verifyTotpLogin('12345', '123456') as TotpLoginDenyResult
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

  it('TC-A-09: 错误动态码统一拒绝——同码同文案，不透出剩余次数（GHSA-6pf3 P1 口径）', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))

    const result = authService.verifyTotpLogin('12345', '000000', '10.0.0.1') as TotpLoginDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    expect(result.error).toBe('QQ号或动态口令错误')
    expect(result.error).not.toContain('剩余')
    expect(result.reason).toBe('invalid_code')
  })

  it('TC-A-10: 未注册 QQ 防枚举（与码错误同响应）', () => {
    const result = authService.verifyTotpLogin('99999', '123456') as TotpLoginDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    // 不泄露「未注册」信息
    expect(result.error).not.toContain('注册')
  })

  // ─── 防爆破 ───

  it('TC-A-11: 连续错 5 次锁「(IP,账号) 组合」——不再写账号列（GHSA-6pf3 定向锁号修复）', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))

    // 前 4 次：统一拒绝 + 内部 reason=invalid_code；账号列全程不动（单 IP 再也锁不死账号）
    for (let i = 1; i <= 4; i++) {
      const r = authService.verifyTotpLogin('12345', '000000', '1.2.3.4') as TotpLoginDenyResult
      expect(r.valid).toBe(false)
      expect(r.code).toBe('TOTP_INVALID')
      expect(r.error).toBe('QQ号或动态口令错误')
      expect(r.reason).toBe('invalid_code')
      const mid = db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until: number | null }
      expect(mid.totp_failed_attempts).toBe(0)
      expect(mid.totp_locked_until).toBeNull()
    }
    // 第 5 次错误 → 该组合锁定跃迁（对外仍统一码，reason/lockTriggered 仅内部）
    const locked = authService.verifyTotpLogin('12345', '000000', '1.2.3.4') as TotpLoginDenyResult
    expect(locked.code).toBe('TOTP_INVALID')
    expect(locked.reason).toBe('locked')
    expect(locked.lockTriggered).toBe(true)
    expect(locked.remainingLockMs).toBe(authService.TOTP_LOCK_DURATION_MS)
    // 账号列仍未被写入
    const row = db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until: number | null }
    expect(row.totp_failed_attempts).toBe(0)
    expect(row.totp_locked_until).toBeNull()
    // 组合锁定期内正确码也被拒（保持旧锁定语义）
    const denied = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '1.2.3.4') as TotpLoginDenyResult
    expect(denied.valid).toBe(false)
    expect(denied.reason).toBe('locked')
    expect(denied.remainingLockMs).toBeGreaterThan(0)
  })

  it('TC-A-12: 登录态路径写入的账号级锁定，登录仍尊重——对外统一拒绝，reason 仅内部', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 手动触发账号级锁定（SRV-15 语义：由 verify-current/rebind 等登录态路径写入）
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?').run(Date.now() + 15 * 60_000, artist.id)

    const code = computeTotp(secret, Date.now())
    const result = authService.verifyTotpLogin('12345', code, '5.6.7.8') as TotpLoginDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    expect(result.error).toBe('QQ号或动态口令错误')
    expect(result.reason).toBe('locked')
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

    const result = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '8.8.8.8') as TotpLoginDenyResult
    expect(result.valid).toBe(false)
    expect(result.code).toBe('TOTP_INVALID')
    expect(result.reason).toBe('locked')

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

  it('TC-A-14: 登录成功清 IP+账号组合计数；登录路径不写账号列', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 同 IP 错 2 次（内存计数 2；账号列不动）
    authService.verifyTotpLogin('12345', '000000', '9.9.9.9')
    authService.verifyTotpLogin('12345', '000000', '9.9.9.9')
    let row = db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until?: number | null }
    expect(row.totp_failed_attempts).toBe(0)
    expect(row.totp_locked_until).toBeNull()

    // 正确登录 → 成功且组合计数清零
    const ok = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '9.9.9.9')
    expect(ok.valid).toBe(true)

    // 计数从头起算：再错 4 次仍不触发锁定（第 5 次才会）
    for (let i = 1; i <= 4; i++) {
      const r = authService.verifyTotpLogin('12345', '000000', '9.9.9.9') as TotpLoginDenyResult
      expect(r.reason).toBe('invalid_code')
    }
    const fifth = authService.verifyTotpLogin('12345', '000000', '9.9.9.9') as TotpLoginDenyResult
    expect(fifth.reason).toBe('locked')
    expect(fifth.lockTriggered).toBe(true)
    // 账号列始终未被登录路径写入
    row = db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until?: number | null }
    expect(row.totp_failed_attempts).toBe(0)
    expect(row.totp_locked_until).toBeNull()
  })

  // ─── GHSA-6pf3-854w P1：五态统一 / IP 键 / 自动解锁 / 缺 t 拒绝 ───

  it('TC-A-20: 五态对外完全一致（码/文案），差异仅在内部 reason', () => {
    // 态1：QQ 不存在
    const notFound = authService.verifyTotpLogin('999999999', '123456', 'ip-1') as TotpLoginDenyResult
    // 态2：码错（需已绑定账号）
    const bound = seedArtist({ qq_number: '12346', subdomain: 'alice-bound' })
    const secret = generateSecret()
    authService.bindTotpInit(bound.id, secret)
    authService.confirmTotpBind(bound.id, computeTotp(secret, Date.now()))
    const wrongCode = authService.verifyTotpLogin('12346', '000000', 'ip-1') as TotpLoginDenyResult
    // 态3：未绑定（本 describe 初态 artist）
    const unbound = authService.verifyTotpLogin('12345', '123456', 'ip-1') as TotpLoginDenyResult
    // 态4：封禁
    db.prepare('UPDATE artists SET is_banned = 1 WHERE id = ?').run(bound.id)
    const banned = authService.verifyTotpLogin('12346', computeTotp(secret, Date.now()), 'ip-2') as TotpLoginDenyResult
    // 态5：锁定（DB 账号锁）
    db.prepare('UPDATE artists SET is_banned = 0, totp_locked_until = ? WHERE id = ?').run(Date.now() + 60_000, bound.id)
    const locked = authService.verifyTotpLogin('12346', computeTotp(secret, Date.now()), 'ip-2') as TotpLoginDenyResult

    const all = [notFound, wrongCode, unbound, banned, locked]
    for (const r of all) {
      expect(r.valid).toBe(false)
      expect(r.code).toBe('TOTP_INVALID')
      expect(r.error).toBe('QQ号或动态口令错误')
      // 匿名面禁止透出剩余次数/锁定明细文案与毫秒（detail 由路由层负责不发，这里从紧断言服务层不外泄锁毫秒）
      expect(r.error).not.toMatch(/剩余|次机会|锁定|封禁/)
    }
    expect(new Set(all.map(r => r.reason))).toEqual(new Set(['not_found', 'invalid_code', 'unbound', 'banned', 'locked']))
  })

  it('TC-A-21: 锁定键含 IP——同账号不同 IP 不互锁（单 IP 锁不死任意账号）', () => {
    const secret = generateSecret()
    authService.bindTotpInit(artist.id, secret)
    authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    // 攻击 IP 打满 5 次
    for (let i = 0; i < 5; i++) {
      authService.verifyTotpLogin('12345', '000000', '203.0.113.66')
    }
    // 攻击者自己再来（含正确码）被拒
    const attacker = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '203.0.113.66') as TotpLoginDenyResult
    expect(attacker.valid).toBe(false)
    expect(attacker.reason).toBe('locked')
    // 合法用户另一 IP 正确码照常登录
    const victim = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '198.51.100.9')
    expect(victim.valid).toBe(true)
  })

  it('TC-A-22: 组合锁 15 分钟自动解（合法用户恢复路径）', () => {
    vi.useFakeTimers()
    try {
      const secret = generateSecret()
      authService.bindTotpInit(artist.id, secret)
      authService.confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
      for (let i = 0; i < 5; i++) {
        authService.verifyTotpLogin('12345', '000000', '203.0.113.70')
      }
      const during = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '203.0.113.70') as TotpLoginDenyResult
      expect(during.reason).toBe('locked')
      // 推进 15 分 1 秒 → 锁自然到期，正确码可登录（无需任何「解锁」写入）
      vi.advanceTimersByTime(authService.TOTP_LOCK_DURATION_MS + 1000)
      const after = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now()), '203.0.113.70')
      expect(after.valid).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('TC-A-23: verifySession 拒缺 t/非法 t 的签名合法 token（GHSA-6pf3 低-3；web+desktop 分支同口径）', () => {
    const SECRET = process.env.SESSION_SECRET ?? 'test-secret-key-for-vitest'
    const forge = (payload: Record<string, unknown>): string => {
      const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const sig = createHmac('sha256', SECRET).update(b64).digest('base64url')
      return `${b64}.${sig}`
    }
    // 修复前：缺 t → Date.now()-undefined=NaN → 比较恒 false → 7 天 TTL 失守直接放行
    expect(authService.verifySession(forge({ id: artist.id, v: 1 }))).toBeNull()
    expect(authService.verifySession(forge({ id: artist.id, t: null, v: 1 }))).toBeNull()
    expect(authService.verifySession(forge({ id: artist.id, t: '123', v: 1 }))).toBeNull()
    // desktop 分支同判（payload 契约：createSession 恒带数值 t，缺=伪造/损坏）
    expect(authService.verifySession(forge({ id: artist.id, v: 1, client: 'desktop', device_id: 1 }))).toBeNull()
    // 对照：带合法 t 的桌面 token 解析正常（t 基 TTL 不适用，过期权威在账本）
    const ok = authService.verifySession(forge({ id: artist.id, t: Date.now(), v: 1, client: 'desktop', device_id: 1 }))
    expect(ok?.client).toBe('desktop')
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
    const result = authService.verifyTotpLogin('12345', computeTotp(secret, Date.now())) as TotpLoginDenyResult
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
