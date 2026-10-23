// ============================================
// 815 审计 P1-5 回归：绑定/确认类 TOTP 路径防爆破（对齐登录路径口径）
// 覆盖：setup 向导 totp-confirm 与 邀请码入驻 totp-confirm
// 口径：连续错 5 次 → 锁 15 分钟；锁定期内任何尝试（含正确码）拒绝
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import { confirmTotpAndComplete } from '../src/features/setup/setup.service.js'
import { confirmInviteTotp } from '../src/features/invite/invite.service.js'

describe('P1-5 确认类 TOTP 防爆破', () => {
  let secret: string

  beforeEach(() => {
    cleanDb()
    secret = generateSecret()
  })

  /** 建一个已绑密钥未验证的画师（setup/invite 确认前置态） */
  function makeUnverifiedArtist(qq: string, subdomain: string): ArtistRow {
    const artist = seedArtist({ qq_number: qq, subdomain })
    db.prepare('UPDATE artists SET totp_secret = ?, totp_verified = 0 WHERE id = ?').run(secret, artist.id)
    return artist
  }

  it('TC-GUARD-01: setup 向导确认——连错 5 次锁定，锁定期正确码也拒绝', () => {
    makeUnverifiedArtist('77701', 'guard-setup')
    // GHSA-6pf3-g4xq-854w Wave1（S3）后 confirmTotpAndComplete 只认管理员本人 QQ：
    // 把 77701 设为 admin_qq，本用例测的才是「防爆破计数」这一段（而非新增的 QQ 校验）
    db.prepare("UPDATE platform_config SET value = '77701' WHERE key = 'admin_qq'").run()

    for (let i = 0; i < 4; i++) {
      expect(() => confirmTotpAndComplete({ qqNumber: '77701', code: '000000' })).toThrow('TOTP_BIND_INVALID')
    }
    // 第 5 次触发锁定
    expect(() => confirmTotpAndComplete({ qqNumber: '77701', code: '000000' })).toThrow('TOTP_LOCKED')

    const row = db.prepare("SELECT totp_locked_until, totp_failed_attempts FROM artists WHERE qq_number = '77701'").get() as { totp_locked_until: number; totp_failed_attempts: number }
    expect(row.totp_locked_until).toBeGreaterThan(Date.now())
    expect(row.totp_failed_attempts).toBe(0) // 锁定后计数清零

    // 锁定期内即使正确码也拒绝
    const rightCode = computeTotp(secret, Date.now())
    expect(() => confirmTotpAndComplete({ qqNumber: '77701', code: rightCode })).toThrow('TOTP_LOCKED')
  })

  it('TC-GUARD-02: 邀请码入驻确认——同款计数与锁定口径（对外统一 TOTP_INVALID）', () => {
    const artist = makeUnverifiedArtist('77702', 'guard-invite')
    // P0-1 纵深校验后 confirmInviteTotp 要求账号经邀请流程入库（有 invite_code_uses 记录）；
    // 补邀请码 + 使用明细模拟合法邀请注册产物，才能测到防爆破计数逻辑（非改软，是跟随 P0-1 新前置校验）
    const codeRow = db.prepare("INSERT INTO invite_codes (code, expires_at) VALUES (?, ?)").run('GUARD-INVITE-02', new Date(Date.now() + 86400000).toISOString())
    db.prepare('INSERT INTO invite_code_uses (invite_code_id, artist_id, used_at) VALUES (?, ?, ?)').run(codeRow.lastInsertRowid, artist.id, new Date().toISOString())

    // GHSA-6pf3 修复④：首绑失败对外一律 TOTP_INVALID（不再区分 TOTP_BIND_INVALID / TOTP_LOCKED）；
    // 但防爆破计数与锁定仍在库内真实生效——连错 5 次后 totp_locked_until 被写入，锁定期内正确码也拒绝（对外同码）。
    for (let i = 0; i < 5; i++) {
      expect(() => confirmInviteTotp({ qqNumber: '77702', code: '000000' })).toThrow('TOTP_INVALID')
    }
    const row = db.prepare("SELECT totp_locked_until, totp_failed_attempts FROM artists WHERE qq_number = '77702'").get() as { totp_locked_until: number; totp_failed_attempts: number }
    expect(row.totp_locked_until).toBeGreaterThan(Date.now())
    expect(row.totp_failed_attempts).toBe(0) // 锁定后计数清零

    // 锁定期内即使正确码也拒绝（对外同 TOTP_INVALID，不泄露锁定态）
    const rightCode = computeTotp(secret, Date.now())
    expect(() => confirmInviteTotp({ qqNumber: '77702', code: rightCode })).toThrow('TOTP_INVALID')
  })

  it('TC-GUARD-03: 锁定期过后恢复可验证（正确码通过）', () => {
    const artist = makeUnverifiedArtist('77703', 'guard-expire')
    // S3 口径：setup 完成只由管理员 QQ 触发，本用例测「锁定过期后可验证」，故把 77703 设为 admin_qq
    db.prepare("UPDATE platform_config SET value = '77703' WHERE key = 'admin_qq'").run()
    // 直接写入已过期的锁
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?').run(Date.now() - 1000, artist.id)

    const rightCode = computeTotp(secret, Date.now())
    const result = confirmTotpAndComplete({ qqNumber: '77703', code: rightCode })
    expect(result.isAdmin).toBe(true)
    const row = db.prepare("SELECT totp_verified, totp_locked_until FROM artists WHERE id = ?").get(artist.id) as { totp_verified: number; totp_locked_until: number | null }
    expect(row.totp_verified).toBe(1)
    expect(row.totp_locked_until).toBeNull()
  })
})
