import { describe, it, expect, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { db, cleanDb, seedArtist } from './setup.js'
import * as authService from '../src/features/auth/auth.service.js'

describe('认证服务 (Auth Service)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
  })

  // TC-A-01: 生成登录码 — 正常
  it('TC-A-01: 生成6位数字登录码', () => {
    const { code, artist: a } = authService.generateLoginCode('12345')

    expect(code).toMatch(/^\d{6}$/)
    expect(a.id).toBe(artist.id)
  })

  // TC-A-02: 生成登录码 — QQ 未绑定（P2-3: 防用户枚举，静默返回不抛错）
  it('TC-A-02: 未绑定QQ静默返回（不抛错）', () => {
    const result = authService.generateLoginCode('99999')
    expect(result.code).toBeNull()
    expect(result.artist).toBeNull()
  })

  // TC-A-03: 验证登录码 — 正确
  it('TC-A-03: 正确登录码验证通过且一次性', () => {
    const { code } = authService.generateLoginCode('12345')
    const result = authService.verifyLoginCode('12345', code)

    expect(result.valid).toBe(true)
    expect(result.artist.id).toBe(artist.id)

    // 二次使用应失败（已删除）
    const again = authService.verifyLoginCode('12345', code)
    expect(again.valid).toBe(false)
  })

  // TC-A-04: 验证登录码 — 错误
  it('TC-A-04: 错误登录码返回失败', () => {
    authService.generateLoginCode('12345')
    const result = authService.verifyLoginCode('12345', '000000')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('登录码错误')
  })

  // TC-A-05: 验证登录码 — 超过最大尝试次数（5次）
  it('TC-A-05: 超过5次尝试后锁定', () => {
    authService.generateLoginCode('12345')

    // 错误尝试 5 次
    authService.verifyLoginCode('12345', '000001')
    authService.verifyLoginCode('12345', '000002')
    authService.verifyLoginCode('12345', '000003')
    authService.verifyLoginCode('12345', '000004')
    authService.verifyLoginCode('12345', '000005')

    const result = authService.verifyLoginCode('12345', '000006')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('尝试次数过多')
  })

  // TC-A-06: 验证登录码 — 过期（P0-4: expires_at 为 Unix 毫秒整数）
  it('TC-A-06: 过期登录码验证失败', () => {
    authService.generateLoginCode('12345')

    // 手动将过期时间改为 1 小时前（Unix 毫秒）
    db.prepare("UPDATE login_codes SET expires_at = ?").run(Date.now() - 3600000)

    const result = authService.verifyLoginCode('12345', '123456')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('已过期')
  })

  // TC-A-07: 会话 Token — 创建与解析
  it('TC-A-07: Token 创建后可正确解析', () => {
    const token = authService.createSession(artist.id)
    const session = authService.verifySession(token)

    expect(session).not.toBeNull()
    expect(session.id).toBe(artist.id)
    expect(session.t).toBeTypeOf('number')
  })

  // TC-A-08: 会话 Token — 篡改签名
  it('TC-A-08: 篡改 Token 返回 null', () => {
    const token = authService.createSession(artist.id)
    // 修改最后一个字符
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A')

    expect(authService.verifySession(tampered)).toBeNull()
  })

  // TC-A-09: 会话 Token — 过期
  it('TC-A-09: 超过7天的 Token 返回 null', () => {
    // 构造 8 天前的 token（使用与 auth.service.js 相同的 SECRET）
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production'
    const payload = Buffer.from(JSON.stringify({ id: artist.id, t: eightDaysAgo })).toString('base64url')
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const token = `${payload}.${sig}`

    expect(authService.verifySession(token)).toBeNull()
  })

  // TC-A-10: 会话 Token — null/空输入
  it('TC-A-10: 空 Token 返回 null', () => {
    expect(authService.verifySession(null)).toBeNull()
    expect(authService.verifySession('')).toBeNull()
    expect(authService.verifySession('invalid')).toBeNull()
  })

  // TC-A-11 (P0-3): 失败尝试的 attempts 不被回滚 — 连续输错后计数累加直至锁定
  it('TC-A-11: 连续输错码 attempts 累加，第6次锁定', () => {
    authService.generateLoginCode('12345')

    // 连续 5 次错误尝试
    for (let i = 1; i <= 5; i++) {
      const r = authService.verifyLoginCode('12345', `00000${i}`)
      expect(r.valid).toBe(false)
    }

    // 确认 attempts 已累加到 5（查库验证，非推断）
    const record = db.prepare('SELECT attempts FROM login_codes WHERE artist_id = ?').get(artist.id)
    expect(record.attempts).toBe(5)

    // 第 6 次应被锁定（即使码正确也不行）
    const locked = authService.verifyLoginCode('12345', '000006')
    expect(locked.valid).toBe(false)
    expect(locked.error).toContain('尝试次数过多')
  })

  // TC-A-12 (P0-4): 过期码可被清理 SQL 删除（整数格式）
  it('TC-A-12: 过期码被清理（Unix 毫秒整数格式）', () => {
    authService.generateLoginCode('12345')

    // 将 expires_at 设为 1 秒前（已过期）
    db.prepare("UPDATE login_codes SET expires_at = ?").run(Date.now() - 1000)

    // 执行与 app.js cleanupCodes 相同的清理 SQL
    const result = db.prepare("DELETE FROM login_codes WHERE expires_at < ?").run(Date.now())
    expect(result.changes).toBe(1)

    // 确认记录已删除
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM login_codes').get()
    expect(remaining.c).toBe(0)
  })
})
