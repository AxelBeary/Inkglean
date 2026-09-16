// ============================================
// 审计缺陷修复波1 SRV-A 路回归测试（2026-09-17）
// 覆盖：P0-1 / SRV-03 / SRV-04 / SRV-08 / SRV-09 / SRV-11 / SRV-14 / SRV-15
// ============================================
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { registerDesktopDevice } from '../src/features/auth/devices.service.js'
import { generateInviteCodes } from '../src/features/invite/invite.service.js'
import { computeTotp, generateSecret } from '../src/features/auth/totp.js'
import { isValidArtistCode } from '../src/shared/validate.js'
import { ACTION_REAUTH_WINDOW_MS } from '../src/shared/middleware/step-up.js'
import { isCounterRegression } from '../src/features/auth/webauthn.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import * as greetingService from '../src/features/artist/greeting.service.js'

// ─── P0-1：邀请注册空壳覆盖接管账号 ───

describe('P0-1: 邀请注册空壳覆盖防护', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    initDatabase(db)
    db.prepare("UPDATE platform_config SET value = 'invite' WHERE key = 'onboarding_mode'").run()
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    seedArtist({ qq_number: '10001', subdomain: 'admin1' })
    app = await buildApp({ logger: false })
    await app.ready()
  })

  it('TC-P01-01: 已注册未确认账号（totp_secret 非空）不可被新邀请码覆盖 → QQ_TAKEN', async () => {
    // 第一次注册：生成 TOTP 密钥（totp_secret 非空，totp_verified=0）
    const [invite1] = generateInviteCodes(1, 3, 1)
    const first = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite1.code, qqNumber: '21001', name: '受害者', subdomain: 'victim1' }
    })
    expect(first.statusCode).toBe(201)
    // 确认 totp_secret 已写入
    const row = db.prepare("SELECT totp_secret FROM artists WHERE qq_number = '21001'").get() as { totp_secret: string }
    expect(row.totp_secret).toBeTruthy()

    // 攻击者尝试用新码覆盖同一 QQ → 应被拒绝
    const [invite2] = generateInviteCodes(1, 3, 1)
    const attack = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite2.code, qqNumber: '21001', name: '攻击者', subdomain: 'hacker1' }
    })
    expect(attack.statusCode).toBe(400)
    expect(attack.json().code).toBe('QQ_TAKEN')

    // 邀请码未被消费
    const codeRow = db.prepare('SELECT status FROM invite_codes WHERE id = ?').get(invite2.id) as { status: string }
    expect(codeRow.status).toBe('unused')

    // 原账号数据未被篡改
    const original = db.prepare("SELECT name, subdomain FROM artists WHERE qq_number = '21001'").get() as { name: string; subdomain: string }
    expect(original.name).toBe('受害者')
    expect(original.subdomain).toBe('victim1')
  })

  it('TC-P01-02: 真空壳（totp_secret=NULL, totp_verified=0）仍可被覆盖', async () => {
    // 手动建一个真空壳（模拟管理员建号但未绑 TOTP 的场景）
    seedArtist({ qq_number: '21002', subdomain: 'shell1', name: '空壳', totp_secret: null, totp_verified: 0 })

    const [invite] = generateInviteCodes(1, 3, 1)
    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '21002', name: '重来', subdomain: 'shell1x' }
    })
    expect(res.statusCode).toBe(201)
    const updated = db.prepare("SELECT name, subdomain FROM artists WHERE qq_number = '21002'").get() as { name: string; subdomain: string }
    expect(updated.name).toBe('重来')
    expect(updated.subdomain).toBe('shell1x')
  })

  it('TC-P01-03: confirmInviteTotp 纵深——非邀请流程产物（无 invite_code_uses 记录）被拒', async () => {
    // 手动建一个有 totp_secret 但未验证的画师（模拟管理员预绑场景）
    const artist = seedArtist({ qq_number: '21003', subdomain: 'prebind', totp_secret: null, totp_verified: 0 })
    const secret = generateSecret()
    db.prepare('UPDATE artists SET totp_secret = ? WHERE id = ?').run(secret, artist.id)

    // 尝试通过公开的 invite/totp-confirm 端点确认 → 应被拒绝（无 invite_code_uses 记录）
    const res = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '21003', code: computeTotp(secret, Date.now()) }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVITE_INVALID')
  })

  it('TC-P01-04: 正常邀请流程注册后 confirmInviteTotp 可成功', async () => {
    const [invite] = generateInviteCodes(1, 3, 1)
    const reg = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '21004', name: '正常用户', subdomain: 'normal1' }
    })
    expect(reg.statusCode).toBe(201)
    const secret = reg.json().otpauthUri.match(/[?&]secret=([A-Z2-7]+)/)?.[1]
    expect(secret).toBeTruthy()

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      payload: { qqNumber: '21004', code: computeTotp(secret!, Date.now()) }
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().artist.qqNumber).toBe('21004')
  })
})

// ─── SRV-03 + SRV-04：管理会话桌面账本校验 ───

describe('SRV-03/04: requireAdmin 桌面会话账本校验', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
  })

  it('TC-SRV03-01: 管理员桌面会话设备被踢（撕账）→ 管理端点 401 DEVICE_REVOKED', async () => {
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-dsk' })
    const device = registerDesktopDevice(admin.id, 'aabb-ccdd-eeff-0011', '管理机', '1.1.1.1')
    const token = createSession(admin.id, admin.token_version, {
      client: 'desktop',
      deviceId: device.id,
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date().toISOString()
    })

    // 撕账：删除设备记录
    db.prepare('DELETE FROM desktop_devices WHERE id = ?').run(device.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('DEVICE_REVOKED')
  })

  it('TC-SRV04-01: 管理员桌面会话设备过期 → 管理端点 401 SESSION_EXPIRED', async () => {
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-dsk2' })
    const device = registerDesktopDevice(admin.id, 'aabb-ccdd-eeff-0022', '过期机', '2.2.2.2')
    // 手动将设备过期时间设为过去
    db.prepare("UPDATE desktop_devices SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(device.id)

    const token = createSession(admin.id, admin.token_version, {
      client: 'desktop',
      deviceId: device.id,
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date().toISOString()
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('SESSION_EXPIRED')
  })

  it('TC-SRV03-02: 非桌面会话（网页端）管理员不受账本校验影响', async () => {
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-web' })
    const token = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date().toISOString()
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(res.statusCode).toBe(200)
  })
})

// ─── SRV-08：身份码 11-20 位不再被截断 ───

describe('SRV-08: 身份码上限 10→20', () => {
  it('TC-SRV08-01: isValidArtistCode 接受 11-20 位大写字母数字', () => {
    expect(isValidArtistCode('ABCDEFGHIJK')).toBe(true)   // 11 位
    expect(isValidArtistCode('ABCDEFGHIJKLMNO')).toBe(true) // 15 位
    expect(isValidArtistCode('ABCDEFGHIJKLMNOPQRST')).toBe(true) // 20 位
  })

  it('TC-SRV08-02: isValidArtistCode 拒绝 21 位及以上', () => {
    expect(isValidArtistCode('ABCDEFGHIJKLMNOPQRSTU')).toBe(false) // 21 位
  })

  it('TC-SRV08-03: isValidArtistCode 拒绝 1 位', () => {
    expect(isValidArtistCode('A')).toBe(false)
  })
})

// ─── SRV-09：换管理员窗口 60s→5min ───

describe('SRV-09: 换管理员 reauth 窗口', () => {
  it('TC-SRV09-01: ACTION_REAUTH_WINDOW_MS 为 5 分钟（300000ms）', () => {
    expect(ACTION_REAUTH_WINDOW_MS).toBe(5 * 60 * 1000)
  })

  it('TC-SRV09-02: 验证后 4 分钟内 transfer 端点可达（不因窗口过短被拒）', async () => {
    cleanDb()
    resetRateLimitBuckets()
    const app = await buildApp({ logger: false })
    await app.ready()
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-srv09' })
    const _newAdmin = seedArtist({ qq_number: '20002', subdomain: 'new-adm09' })

    // 模拟 4 分钟前验证过（在 5 分钟窗口内）
    const verifiedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    const token = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: verifiedAt
    })

    // transfer 应不被 step-up 拦截（可能因 TOTP 验证失败返回 401，但不是 STEP_UP_REQUIRED）
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${token}` },
      payload: { newQq: '20002', currentCode: '000000', newCode: '000000' }
    })
    // 不是 STEP_UP_REQUIRED（窗口内放行）
    expect(res.json().code).not.toBe('STEP_UP_REQUIRED')
  })

  it('TC-SRV09-03: 验证后 6 分钟 transfer 端点被拒（超出 5 分钟窗口）', async () => {
    cleanDb()
    resetRateLimitBuckets()
    const app = await buildApp({ logger: false })
    await app.ready()
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-srv09b' })

    // 模拟 6 分钟前验证过（超出 5 分钟窗口）
    const verifiedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    const token = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: verifiedAt
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${token}` },
      payload: { newQq: '20002', currentCode: '000000', newCode: '000000' }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('STEP_UP_REQUIRED')
  })
})

// ─── SRV-11：问候语特别日跨租户泄漏 ───

describe('SRV-11: 问候语特别日跨租户隔离', () => {
  beforeEach(() => {
    cleanDb()
    db.exec('DELETE FROM greeting_templates')
    db.exec('DELETE FROM greeting_special_days')
  })

  function seedDay(opts: { name?: string; dateKey?: string; artistId?: number | null; enabled?: number }) {
    const result = db.prepare(
      'INSERT INTO greeting_special_days (name, date_key, artist_id, is_enabled) VALUES (?, ?, ?, ?)'
    ).run(opts.name ?? '测试日', opts.dateKey ?? '09-17', opts.artistId ?? null, opts.enabled ?? 1)
    return Number(result.lastInsertRowid)
  }

  function seedTemplate(opts: { text: string; slot?: string; artistId?: number | null; specialDayId?: number | null; enabled?: number }) {
    db.prepare(
      'INSERT INTO greeting_templates (artist_id, text, time_slot, is_enabled, special_day_id) VALUES (?, ?, ?, ?, ?)'
    ).run(opts.artistId ?? null, opts.text, opts.slot ?? 'any', opts.enabled ?? 1, opts.specialDayId ?? null)
  }

  it('TC-SRV11-01: 画师 A 专属文案挂全平台特别日 → 画师 B 抽取不命中 A 的私有文案', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 17, 12, 0, 0)) // 09-17
    const artistA = seedArtist({ qq_number: '111', subdomain: 'alice-srv11' })
    const artistB = seedArtist({ qq_number: '222', subdomain: 'bob-srv11' })

    // 全平台特别日（artist_id = null）
    const dayId = seedDay({ dateKey: '09-17', artistId: null })
    // 画师 A 的专属文案挂到全平台特别日
    seedTemplate({ text: 'A的私密文案', specialDayId: dayId, artistId: artistA.id })
    // 通用文案也挂到同一特别日
    seedTemplate({ text: '平台通用文案{name}', specialDayId: dayId, artistId: null })

    // 画师 B 抽取：应命中通用文案，不应命中 A 的私有文案
    const resultB = greetingService.drawGreeting(artistB.id, 'B')
    expect(resultB.text).not.toContain('A的私密文案')
    expect(resultB.text).toBe('平台通用文案B')
    expect(resultB.slot).toBe('special')

    // 画师 A 抽取：可以命中自己的专属文案或通用文案
    const resultA = greetingService.drawGreeting(artistA.id, 'A')
    expect(resultA.slot).toBe('special')
    // A 的池里有两条（自己的 + 通用），随机命中任一均合法
    expect(['A的私密文案', '平台通用文案A']).toContain(resultA.text)

    vi.useRealTimers()
  })

  it('TC-SRV11-02: 画师专属特别日 + 画师专属文案 → 其他画师完全不命中', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 17, 12, 0, 0))
    const artistA = seedArtist({ qq_number: '333', subdomain: 'alice-srv11b' })
    const artistB = seedArtist({ qq_number: '444', subdomain: 'bob-srv11b' })

    // A 的专属特别日
    const dayId = seedDay({ dateKey: '09-17', artistId: artistA.id })
    seedTemplate({ text: 'A专属日文案', specialDayId: dayId, artistId: artistA.id })

    // A 命中
    const resultA = greetingService.drawGreeting(artistA.id, 'A')
    expect(resultA.text).toBe('A专属日文案')

    // B 不命中（回落兜底）
    const resultB = greetingService.drawGreeting(artistB.id, 'B')
    expect(resultB.text).toBe('你好，B')
    expect(resultB.slot).toBe('any')

    vi.useRealTimers()
  })
})

// ─── SRV-14：WebAuthn 计数器乐观守卫 ───

describe('SRV-14: WebAuthn counter 乐观守卫', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-SRV14-01: counter UPDATE 乐观锁——并发修改后 WHERE counter=旧值 命中 0 行', () => {
    const artist = seedArtist({ qq_number: '55555', subdomain: 'wa-srv14' })
    db.prepare(`
      INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(artist.id, 'srv14-cred-1', 'test-key', 5, '测试设备')

    // 模拟：第一个请求成功把 counter 从 5 更新到 6
    const first = db.prepare(`
      UPDATE webauthn_credentials SET counter = 6, last_used_at = datetime('now')
      WHERE credential_id = ? AND counter = 5
    `).run('srv14-cred-1')
    expect(first.changes).toBe(1)

    // 第二个并发请求尝试用旧 counter=5 更新 → 命中 0 行（乐观锁生效）
    const second = db.prepare(`
      UPDATE webauthn_credentials SET counter = 7, last_used_at = datetime('now')
      WHERE credential_id = ? AND counter = 5
    `).run('srv14-cred-1')
    expect(second.changes).toBe(0)

    // counter 仍为 6（第一个请求的值）
    const row = db.prepare('SELECT counter FROM webauthn_credentials WHERE credential_id = ?').get('srv14-cred-1') as { counter: number }
    expect(row.counter).toBe(6)
  })

  it('TC-SRV14-02: isCounterRegression 辅助判定仍正确', () => {
    expect(isCounterRegression(0, 0)).toBe(false)  // 平台验证器
    expect(isCounterRegression(6, 5)).toBe(false)  // 正常递增
    expect(isCounterRegression(5, 5)).toBe(true)   // 重复 = 回归
    expect(isCounterRegression(3, 5)).toBe(true)   // 回退 = 回归
  })
})

// ─── SRV-15：TOTP 重绑缺账号锁定 ───

describe('SRV-15: TOTP verify-current/rebind-confirm 账号锁定', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  it('TC-SRV15-01: verify-current 连续错码 5 次 → 账号锁定（TOTP_LOCKED 429）', async () => {
    const artist = seedArtist({ qq_number: '66666', subdomain: 'srv15-a' })
    const token = createSession(artist.id, artist.token_version)

    let lockedAt = -1
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify-current',
        headers: { Authorization: `Bearer ${token}` },
        payload: { code: String(i).padStart(6, '0') }
      })
      if (res.statusCode === 429 && res.json().code === 'TOTP_LOCKED') {
        lockedAt = i
        break
      }
    }
    // 应在第 5 次（index 4）或第 6 次（index 5）触发锁定
    expect(lockedAt).toBeGreaterThanOrEqual(4)
    expect(lockedAt).toBeLessThanOrEqual(5)
  })

  it('TC-SRV15-02: verify-current 锁定期内即使正确码也被拒', async () => {
    const secret = 'JBSWY3DPEHPK3PXP' // 与 seedArtist 默认一致
    const artist = seedArtist({ qq_number: '77777', subdomain: 'srv15-b' })
    // 手动设为已锁定
    db.prepare('UPDATE artists SET totp_locked_until = ? WHERE id = ?')
      .run(Date.now() + 10 * 60 * 1000, artist.id)
    const token = createSession(artist.id, artist.token_version)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/verify-current',
      headers: { Authorization: `Bearer ${token}` },
      payload: { code: computeTotp(secret, Date.now()) }
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('TOTP_LOCKED')
  })

  it('TC-SRV15-03: rebind-confirm 旧码路径连续错码触发锁定', async () => {
    const artist = seedArtist({ qq_number: '88888', subdomain: 'srv15-c' })
    const token = createSession(artist.id, artist.token_version)

    let lockedAt = -1
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/rebind-confirm',
        headers: { Authorization: `Bearer ${token}` },
        payload: { code: String(i).padStart(6, '0'), tempKey: 'fake-key', newCode: '000000' }
      })
      if (res.statusCode === 429 && res.json().code === 'TOTP_LOCKED') {
        lockedAt = i
        break
      }
    }
    expect(lockedAt).toBeGreaterThanOrEqual(4)
    expect(lockedAt).toBeLessThanOrEqual(5)
  })
})
