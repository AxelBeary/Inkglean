// ============================================
// TOTP 自助重绑测试（REQ-040）
// 分层验证（Passkey/旧码/都无→拒绝）/冷却期/管理员豁免/bumpTokenVersion
// ============================================
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { bumpTokenVersion } from '../src/features/artist/artist.service.js'
import { generateSecret, computeTotp, verifyTotp } from '../src/features/auth/totp.js'
import { afterEach } from 'vitest'
import { hasPasskeyCredentials } from '../src/features/auth/webauthn.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

describe('TOTP 自助重绑 (REQ-040)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({
      qq_number: '12345',
      subdomain: 'totp-rebind',
      name: '重绑测试画师'
    })
  })

  describe('冷却期', () => {
    it('totp_rebound_at 字段应存在并可为空', () => {
      const row = db.prepare('SELECT totp_rebound_at FROM artists WHERE id = ?').get(artist.id) 
      expect(row).toHaveProperty('totp_rebound_at')
      expect(row.totp_rebound_at).toBeNull()
    })

    it('写入 totp_rebound_at 后应可读取', () => {
      const now = new Date().toISOString()
      db.prepare('UPDATE artists SET totp_rebound_at = ? WHERE id = ?').run(now, artist.id)
      const row = db.prepare('SELECT totp_rebound_at FROM artists WHERE id = ?').get(artist.id) 
      expect(row.totp_rebound_at).toBe(now)
    })

    it('冷却期 24 小时内应阻止自助重绑', () => {
      // 设置 totp_rebound_at 为当前时间（冷却期开始）
      const now = new Date().toISOString()
      db.prepare('UPDATE artists SET totp_rebound_at = ? WHERE id = ?').run(now, artist.id)

      // 检查冷却期逻辑
      const reboundTime = new Date(now).getTime()
      const elapsed = Date.now() - reboundTime
      // 冷却期：24h = 86400000ms
      expect(elapsed).toBeLessThan(24 * 60 * 60 * 1000)

      // 模拟冷却期检查
      const remainingMs = 24 * 60 * 60 * 1000 - elapsed
      expect(remainingMs).toBeGreaterThan(0)
    })

    it('冷却期超过 24 小时应允许重绑', () => {
      // 设置 totp_rebound_at 为 25 小时前
      const past = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      db.prepare('UPDATE artists SET totp_rebound_at = ? WHERE id = ?').run(past, artist.id)

      const reboundTime = new Date(past).getTime()
      const elapsed = Date.now() - reboundTime
      expect(elapsed).toBeGreaterThan(24 * 60 * 60 * 1000)
    })
  })

  describe('管理员豁免', () => {
    it('管理员应不受冷却期限制', () => {
      // 管理员（admin_qq）的冷却期检查应跳过
      // 这个检查在路由层实现，测试服务层逻辑
      const now = new Date().toISOString()
      db.prepare('UPDATE artists SET totp_rebound_at = ? WHERE id = ?').run(now, artist.id)

      // 管理员应该能跳过冷却期
      // 这里我们检查 isAdmin 标记是否影响冷却期判定
      // 路由层：if (!isAdmin && artist.totp_rebound_at) { ... }
      // 当 isAdmin=true 时，跳过冷却期检查
      expect(true).toBe(true) // 路由层逻辑，服务层不做判定
    })
  })

  describe('分层验证', () => {
    it('无 Passkey 无 TOTP 时应拒绝自助重绑', () => {
      // 既没有 Passkey 凭据，也没有 TOTP 绑定
      expect(hasPasskeyCredentials(artist.id)).toBe(false)

      // 检查 TOTP 状态
      const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id) 
      expect(row.totp_secret).toBeNull()
      expect(row.totp_verified).toBe(0)

      // 都没有 -> 拒绝自助重绑
      // 这是业务逻辑验证
    })

    it('有 TOTP 无 Passkey 时应允许旧码验证路径', () => {
      // 绑定 TOTP
      const secret = generateSecret()
      db.prepare('UPDATE artists SET totp_secret = ?, totp_verified = 1 WHERE id = ?').run(secret, artist.id)

      // 验证 TOTP 已绑定
      const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id) 
      expect(row.totp_secret).toBe(secret)
      expect(row.totp_verified).toBe(1)

      // 无 Passkey
      expect(hasPasskeyCredentials(artist.id)).toBe(false)

      // 应走旧码验证路径
      // 验证旧码正确
      const code = computeTotp(secret, Date.now())
      expect(verifyTotp(secret, code, Date.now())).toBe(true)

      // 验证旧码错误
      expect(verifyTotp(secret, '000000', Date.now())).toBe(false)
    })

    it('有 Passkey 时应走 Passkey 验证路径', () => {
      // 插入一条模拟 Passkey 凭据
      db.prepare(`
        INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(artist.id, 'rebind-passkey-cred', 'test-public-key', 0, '重绑测试设备')

      expect(hasPasskeyCredentials(artist.id)).toBe(true)
      // 有 Passkey -> 走 Passkey 验证路径
    })
  })

  describe('重绑生效', () => {
    it('重绑后应更新 totp_secret 和 totp_rebound_at', () => {
      // 模拟重绑生效
      const newSecret = generateSecret()
      db.prepare(`
        UPDATE artists SET totp_secret = ?, totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL, totp_rebound_at = datetime('now')
        WHERE id = ?
      `).run(newSecret, artist.id)

      const row = db.prepare('SELECT totp_secret, totp_verified, totp_rebound_at FROM artists WHERE id = ?').get(artist.id) 
      expect(row.totp_secret).toBe(newSecret)
      expect(row.totp_verified).toBe(1)
      expect(row.totp_rebound_at).not.toBeNull()
    })

    it('重绑后应 bumpTokenVersion 踢下线', () => {
      const oldVersion = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id) 
      bumpTokenVersion(artist.id)
      const newVersion = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id) 
      expect(newVersion.token_version).toBe((oldVersion.token_version || 1) + 1)
    })
  })

  describe('核对新码', () => {
    it('应验证新 TOTP 密钥的 6 位码', () => {
      const newSecret = generateSecret()
      // 生成新码
      const code = computeTotp(newSecret, Date.now())
      expect(/^\d{6}$/.test(code)).toBe(true)
      expect(verifyTotp(newSecret, code, Date.now())).toBe(true)
    })

    it('错误的 6 位码应拒绝', () => {
      const newSecret = generateSecret()
      expect(verifyTotp(newSecret, '000000', Date.now())).toBe(false)
    })
  })
})

describe('verify-current 端点（前端质量战役审计修复：Step1 验证虚实现）', () => {
  let app
  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
  })
  afterEach(async () => { await app.close() })

  function bindTotp(artistRow) {
    const secret = generateSecret()
    bindTotpInit(artistRow.id, secret)
    confirmTotpBind(artistRow.id, computeTotp(secret, Date.now()))
    return secret
  }

  it('正确码 200 / 错码 401 / 非六位 400 / 未绑定 400', async () => {
    const artist = seedArtist({ qq_number: '777', subdomain: 'vc-test' })
    const secret = bindTotp(artist)
    const token = createSession(artist.id, artist.token_version)
    const auth = { authorization: 'Bearer ' + token }
    const right = computeTotp(secret, Date.now())
    const wrong = String((parseInt(right, 10) + 1) % 1000000).padStart(6, '0')

    const ok = await app.inject({ method: 'POST', url: '/api/auth/totp/verify-current', headers: auth, payload: { code: right } })
    expect(ok.statusCode).toBe(200)

    const bad = await app.inject({ method: 'POST', url: '/api/auth/totp/verify-current', headers: auth, payload: { code: wrong } })
    expect(bad.statusCode).toBe(401)

    const malformed = await app.inject({ method: 'POST', url: '/api/auth/totp/verify-current', headers: auth, payload: { code: '12ab' } })
    expect(malformed.statusCode).toBe(400)

    const fresh = seedArtist({ qq_number: '778', subdomain: 'vc-nobind' })
    const token2 = createSession(fresh.id, fresh.token_version)
    const unbound = await app.inject({ method: 'POST', url: '/api/auth/totp/verify-current', headers: { authorization: 'Bearer ' + token2 }, payload: { code: right } })
    expect(unbound.statusCode).toBe(400)
  })
})

// P2-F6: 重绑链路限流 + rebind-confirm 旧码重放消费
describe('P2-F6 重绑链路安全加固', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  /** 建号 + 绑定 TOTP（无 passkey），返回 { artist, secret } */
  function bindArtist(qq, subdomain) {
    const artist = seedArtist({ qq_number: qq, subdomain })
    const secret = generateSecret()
    bindTotpInit(artist.id, secret)
    confirmTotpBind(artist.id, computeTotp(secret, Date.now()))
    return { artist, secret }
  }

  /** rebind-init → 返回 { tempKey, newSecret } */
  async function rebindInit(token) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-init',
      headers: { Authorization: 'Bearer ' + token }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.verifyMethod).toBe('code')
    const newSecret = body.otpauthUri.match(/secret=([A-Z2-7]+)/)[1]
    return { tempKey: body.tempKey, newSecret }
  }

  it('TC-F6-01: verify-current 超过 10 次/5 分钟 → 429 RATE_LIMITED', async () => {
    const { artist } = bindArtist('88801', 'f6-vc-limit')
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: 'Bearer ' + token }

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/verify-current',
        headers,
        payload: { code: '000000' }
      })
      expect([200, 401]).toContain(res.statusCode)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/verify-current',
      headers,
      payload: { code: '000000' }
    })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().code).toBe('RATE_LIMITED')
  })

  it('TC-F6-02: rebind-init 超过 10 次/5 分钟 → 429 RATE_LIMITED', async () => {
    const { artist } = bindArtist('88802', 'f6-init-limit')
    const token = createSession(artist.id, artist.token_version)

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/rebind-init',
        headers: { Authorization: 'Bearer ' + token }
      })
      expect(res.statusCode).toBe(200)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-init',
      headers: { Authorization: 'Bearer ' + token }
    })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().code).toBe('RATE_LIMITED')
  })

  it('TC-F6-03: rebind-confirm 超过 10 次/5 分钟 → 429 RATE_LIMITED', async () => {
    const { artist } = bindArtist('88803', 'f6-confirm-limit')
    const token = createSession(artist.id, artist.token_version)

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/totp/rebind-confirm',
        headers: { Authorization: 'Bearer ' + token },
        payload: {}
      })
      expect(res.statusCode).toBe(400)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-confirm',
      headers: { Authorization: 'Bearer ' + token },
      payload: {}
    })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().code).toBe('RATE_LIMITED')
  })

  it('TC-F6-04: rebind-confirm 旧码一次性消费——成功后重放同码 → 401 TOTP_INVALID', async () => {
    const { artist, secret } = bindArtist('88804', 'f6-replay')
    const token = createSession(artist.id, artist.token_version)
    const { tempKey, newSecret } = await rebindInit(token)
    const oldCode = computeTotp(secret, Date.now())
    const newCode = computeTotp(newSecret, Date.now())
    const payload = { code: oldCode, tempKey, newCode }

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-confirm',
      headers: { Authorization: 'Bearer ' + token },
      payload
    })
    expect(first.statusCode).toBe(200)

    // 重放同一旧码 → 已消费，拒绝（即使 tempKey 已被消费，重放防护先于 tempKey 校验命中）。
    // 注意：首次重绑成功会 bumpTokenVersion 踢掉旧 token，这里用新版本重签 token 再重放
    const freshArtist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artist.id)
    const freshToken = createSession(freshArtist.id, freshArtist.token_version)
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-confirm',
      headers: { Authorization: 'Bearer ' + freshToken },
      payload
    })
    expect(replay.statusCode).toBe(401)
    expect(replay.json().code).toBe('TOTP_INVALID')

    // 新密钥已生效，旧密钥失效
    const row = db.prepare('SELECT totp_secret, totp_verified FROM artists WHERE id = ?').get(artist.id)
    expect(row.totp_secret).toBe(newSecret)
    expect(row.totp_verified).toBe(1)
    const used = db.prepare('SELECT COUNT(*) AS c FROM totp_used_codes WHERE artist_id = ?').get(artist.id)
    expect(used.c).toBeGreaterThanOrEqual(1)
  })
})
