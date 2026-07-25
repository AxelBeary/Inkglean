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

  // TC-A-02: 生成登录码 — QQ 未绑定
  it('TC-A-02: 未绑定QQ抛出错误', () => {
    expect(() => {
      authService.generateLoginCode('99999')
    }).toThrow('未绑定画师账号')
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

  // TC-A-05: 验证登录码 — 超过最大尝试次数
  it('TC-A-05: 超过3次尝试后锁定', () => {
    authService.generateLoginCode('12345')

    // 错误尝试 3 次
    authService.verifyLoginCode('12345', '000001')
    authService.verifyLoginCode('12345', '000002')
    authService.verifyLoginCode('12345', '000003')

    const result = authService.verifyLoginCode('12345', '000004')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('尝试次数过多')
  })

  // TC-A-06: 验证登录码 — 过期
  it('TC-A-06: 过期登录码验证失败', () => {
    authService.generateLoginCode('12345')

    // 手动将过期时间改为过去
    db.prepare("UPDATE login_codes SET expires_at = datetime('now', '-1 hour')").run()

    const result = authService.verifyLoginCode('12345', '123456')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('已过期')
  })

  // TC-A-07: 会话 Token — 创建与解析
  it('TC-A-07: Token 创建后可正确解析', () => {
    const token = authService.createSession(1)
    const session = authService.parseSession(token)

    expect(session).toEqual({ artistId: 1 })
  })

  // TC-A-08: 会话 Token — 篡改签名
  it('TC-A-08: 篡改 Token 返回 null', () => {
    const token = authService.createSession(1)
    // 修改最后一个字符
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A')

    expect(authService.parseSession(tampered)).toBeNull()
  })

  // TC-A-09: 会话 Token — 过期
  it('TC-A-09: 超过7天的 Token 返回 null', () => {
    // 构造 8 天前的 token（使用与 auth.service.js 相同的 SECRET）
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-vitest'
    const payload = `1:${eightDaysAgo}`
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
    const token = Buffer.from(`${payload}:${sig}`).toString('base64url')

    expect(authService.parseSession(token)).toBeNull()
  })
})
