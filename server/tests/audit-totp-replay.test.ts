// 外部审计 P1-1：TOTP 重放防护
// 同一验证码在同一时间窗口（±1 时间步 = 90 秒）内第二次使用 → 拒绝；新窗口新码 → 通过
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { verifyTotpLogin } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'

// 固定测试密钥（RFC 6238 文档示例值，仅测试用）
const TEST_SECRET = 'JBSWY3DPEHPK3PXP'

describe('TOTP 重放防护 (P1-1)', () => {
  beforeEach(() => cleanDb())

  /** 建号并直接绑定（绕过管理接口，聚焦登录重放逻辑） */
  function bindArtist(qq: string): ArtistRow {
    const artist = seedArtist({ qq_number: qq, subdomain: 'replay-' + qq })
    db.prepare('UPDATE artists SET totp_secret = ?, totp_verified = 1 WHERE id = ?').run(TEST_SECRET, artist.id)
    return db.prepare('SELECT * FROM artists WHERE id = ?').get(artist.id) as ArtistRow
  }

  it('TC-REPLAY-01: 同一时间窗口内同一验证码第二次使用被拒', () => {
    bindArtist('20001')
    const code = computeTotp(TEST_SECRET, Date.now())

    const first = verifyTotpLogin('20001', code)
    expect(first.valid).toBe(true)

    const second = verifyTotpLogin('20001', code) as { valid: boolean; code: string; error: string }
    expect(second.valid).toBe(false)
    expect(second.code).toBe('TOTP_INVALID')
    expect(second.error).toContain('已使用')
  })

  it('TC-REPLAY-02: 新时间窗口的新验证码可正常登录（不误伤）', () => {
    bindArtist('20002')
    const oldCode = computeTotp(TEST_SECRET, Date.now())
    expect(verifyTotpLogin('20002', oldCode).valid).toBe(true)

    // 下一时间步（+30s）的新码 → 通过
    const nextCode = computeTotp(TEST_SECRET, Date.now() + 30000)
    const next = verifyTotpLogin('20002', nextCode)
    expect(next.valid).toBe(true)
  })

  it('TC-REPLAY-03: 重放被拒不累计防爆破计数、不锁定', () => {
    const artist = bindArtist('20003')
    const code = computeTotp(TEST_SECRET, Date.now())

    expect(verifyTotpLogin('20003', code).valid).toBe(true)
    for (let i = 0; i < 5; i++) {
      const r = verifyTotpLogin('20003', code)
      expect(r.valid).toBe(false)
    }
    // 失败计数仍为 0、未锁定
    const row = db.prepare('SELECT totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number; totp_locked_until: number | null }
    expect(row.totp_failed_attempts).toBe(0)
    expect(row.totp_locked_until).toBeNull()
    // 正确的新码仍可登录（未被锁定误伤）
    const nextCode = computeTotp(TEST_SECRET, Date.now() + 30000)
    expect(verifyTotpLogin('20003', nextCode).valid).toBe(true)
  })

  it('TC-REPLAY-04: 不同画师同一时间窗口同一验证码互不影响', () => {
    bindArtist('20004')
    bindArtist('20005')
    const code = computeTotp(TEST_SECRET, Date.now())
    expect(verifyTotpLogin('20004', code).valid).toBe(true)
    expect(verifyTotpLogin('20005', code).valid).toBe(true)
  })
})
