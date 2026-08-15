// ============================================
// 815 审计 P1-5 回归：绑定/确认类 TOTP 路径防爆破（对齐登录路径口径）
// 覆盖：setup 向导 totp-confirm 与 邀请码入驻 totp-confirm
// 口径：连续错 5 次 → 锁 15 分钟；锁定期内任何尝试（含正确码）拒绝
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import { confirmTotpAndComplete } from '../src/features/setup/setup.service.js'
import { confirmInviteTotp } from '../src/features/invite/invite.service.js'

describe('P1-5 确认类 TOTP 防爆破', () => {
  let secret

  beforeEach(() => {
    cleanDb()
    secret = generateSecret()
  })

  /** 建一个已绑密钥未验证的画师（setup/invite 确认前置态） */
  function makeUnverifiedArtist(qq, subdomain) {
    const artist = seedArtist({ qq_number: qq, subdomain })
    db.prepare('UPDATE artists SET totp_secret = ?, totp_verified = 0 WHERE id = ?').run(secret, artist.id)
    return artist
  }

  it('TC-GUARD-01: setup 向导确认——连错 5 次锁定，锁定期正确码也拒绝', () => {
    makeUnverifiedArtist('77701', 'guard-setup')

    for (let i = 0; i < 4; i++) {
      expect(() => confirmTotpAndComplete({ qqNumber: '77701', code: '000000' })).toThrow('TOTP_BIND_INVALID')
    }
    // 第 5 次触发锁定
    expect(() => confirmTotpAndComplete({ qqNumber: '77701', code: '000000' })).toThrow('TOTP_LOCKED')

    const row = db.prepare("SELECT totp_locked_until, totp_failed_attempts FROM artists WHERE qq_number = '77701'").get()
    expect(row.totp_locked_until).toBeGreaterThan(Date.now())
    expect(row.totp_failed_attempts).toBe(0) // 锁定后计数清零

    // 锁定期内即使正确码也拒绝
    const rightCode = computeTotp(secret, Date.now())
    expect(() => confirmTotpAndComplete({ qqNumber: '77701', code: rightCode })).toThrow('TOTP_LOCKED')
  })

  it('TC-GUARD-02: 邀请码入驻确认——同款计数与锁定口径', () => {
    makeUnverifiedArtist('77702', 'guard-invite')

    for (let i = 0; i < 4; i++) {
      expect(() => confirmInviteTotp({ qqNumber: '77702', code: '000000' })).toThrow('TOTP_BIND_INVALID')
    }
    expect(() => confirmInviteTotp({ qqNumber: '77702', code: '000000' })).toThrow('TOTP_LOCKED')

    const rightCode = computeTotp(secret, Date.now())
    expect(() => confirmInviteTotp({ qqNumber: '77702', code: rightCode })).toThrow('TOTP_LOCKED')
  })

  it('TC-GUARD-03: 锁定期过后恢复可验证（正确码通过）', () => {
    const artist = makeUnverifiedArtist('77703', 'guard-expire')
    // 直接写入已过期的锁
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?').run(Date.now() - 1000, artist.id)

    const rightCode = computeTotp(secret, Date.now())
    const result = confirmTotpAndComplete({ qqNumber: '77703', code: rightCode })
    expect(result.isAdmin).toBe(true)
    const row = db.prepare("SELECT totp_verified, totp_locked_until FROM artists WHERE id = ?").get(artist.id)
    expect(row.totp_verified).toBe(1)
    expect(row.totp_locked_until).toBeNull()
  })
})
