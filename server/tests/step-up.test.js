// REQ-041 管理后台二次验证（会话升级）测试
// 覆盖：TOTP 升级成功/失败锁定/Passkey 升级（mock webauthn）/非管理员 403/
// 30 分钟窗口过期/动作级 60 秒强制/新会话未升级被拒/踢下线联动/旧 token 兼容
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession, verifySession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { generateSecret, computeTotp } from '../src/features/auth/totp.js'
import { verifyLogin } from '../src/features/auth/webauthn.js'
import { STEP_UP_REQUIRED } from '../src/shared/middleware/step-up.js'
import { AppError, E } from '../src/shared/errors.js'
import { buildApp } from '../src/app.js'

// REQ-041：Passkey 分支 mock webauthn 校验（真实校验链路已由 webauthn.test.js 覆盖）
vi.mock('../src/features/auth/webauthn.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, verifyLogin: vi.fn() }
})

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber = '10001') {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

/** 为画师完成 TOTP 绑定，返回密钥（算码用） */
function bindArtistTotp(artistRow) {
  const secret = generateSecret()
  bindTotpInit(artistRow.id, secret)
  confirmTotpBind(artistRow.id, computeTotp(secret, Date.now()))
  return secret
}

/** 从 inject 响应的 set-cookie 提取升级后的 artist_token */
function tokenFromCookie(res) {
  const setCookie = res.headers['set-cookie']
  const match = setCookie.match(/artist_token=([^;]+)/)
  if (!match) throw new Error('响应未设置 artist_token cookie')
  return match[1]
}

describe('REQ-041 管理后台二次验证（会话升级）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  it('TC-SU-01: TOTP 升级成功 — 重签升级 token 后可访问管理后台', async () => {
    const admin = setAdmin()
    const secret = bindArtistTotp(admin)
    const basicToken = createSession(admin.id, admin.token_version)

    // 升级前：管理后台被拒
    const before = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${basicToken}` }
    })
    expect(before.statusCode).toBe(401)
    expect(before.json().code).toBe(STEP_UP_REQUIRED)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      headers: { Authorization: `Bearer ${basicToken}` },
      payload: { method: 'totp', code: computeTotp(secret, Date.now()) }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ success: true })
    expect(res.json().verifiedAt).toBeTruthy()

    const upgradedToken = tokenFromCookie(res)
    const session = verifySession(upgradedToken)
    expect(session?.auth_level).toBe('admin_verified')
    expect(session?.admin_verified_at).toBeTruthy()

    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${upgradedToken}` }
    })
    expect(after.statusCode).toBe(200)

    // 探测接口同样放行
    const probe = await app.inject({
      method: 'GET',
      url: '/api/admin/stepup-status',
      headers: { Authorization: `Bearer ${upgradedToken}` }
    })
    expect(probe.statusCode).toBe(200)
    expect(probe.json()).toEqual({ verified: true })
  })

  it('TC-SU-02: TOTP 失败不升级，连续错误触发锁定（复用登录失败语义）', async () => {
    const admin = setAdmin()
    const secret = bindArtistTotp(admin)
    const basicToken = createSession(admin.id, admin.token_version)
    const headers = { Authorization: `Bearer ${basicToken}` }

    // 错误码 → 401 TOTP_INVALID
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      headers,
      payload: { method: 'totp', code: '000000' }
    })
    expect(bad.statusCode).toBe(401)
    expect(bad.json().code).toBe('TOTP_INVALID')

    // 再错 4 次 → 第 5 次触发锁定
    let locked
    for (let i = 0; i < 4; i++) {
      locked = await app.inject({
        method: 'POST',
        url: '/api/auth/step-up',
        headers,
        payload: { method: 'totp', code: '000000' }
      })
    }
    expect(locked.statusCode).toBe(401)
    expect(locked.json().code).toBe('TOTP_LOCKED')
    expect(locked.json().detail.remainingLockMs).toBeGreaterThan(0)

    // 锁定期间正确码也被拒
    const correctWhileLocked = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      headers,
      payload: { method: 'totp', code: computeTotp(secret, Date.now()) }
    })
    expect(correctWhileLocked.statusCode).toBe(401)
    expect(correctWhileLocked.json().code).toBe('TOTP_LOCKED')

    // 失败不升级：原 token 仍被管理后台拒绝
    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers
    })
    expect(after.statusCode).toBe(401)
    expect(after.json().code).toBe(STEP_UP_REQUIRED)
  })

  it('TC-SU-03: Passkey 升级 — 复用 webauthn 校验并限定当前管理员的凭据', async () => {
    const admin = setAdmin()
    const basicToken = createSession(admin.id, admin.token_version)
    verifyLogin.mockResolvedValue({ artist: admin, credentialRow: { id: 1 } })

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      headers: { Authorization: `Bearer ${basicToken}` },
      payload: {
        method: 'passkey',
        credentialId: 'cred-id',
        authenticatorData: 'auth-data',
        signature: 'sig',
        clientDataJSON: 'client-data'
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    // 校验对象 = 当前登录管理员（第三参 expectedArtistId）
    expect(verifyLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cred-id',
        response: expect.objectContaining({
          authenticatorData: 'auth-data',
          signature: 'sig',
          clientDataJSON: 'client-data'
        })
      }),
      'localhost',
      admin.id,
      // 812 OOBE 修复：verifyLogin 新增第四参请求协议（inject 无 X-Forwarded-Proto → http）
      'http'
    )

    const upgradedToken = tokenFromCookie(res)
    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${upgradedToken}` }
    })
    expect(after.statusCode).toBe(200)
  })

  it('TC-SU-04: Passkey 认证失败 → 401 统一失败语义，不升级', async () => {
    const admin = setAdmin()
    const basicToken = createSession(admin.id, admin.token_version)
    verifyLogin.mockRejectedValue(new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401))

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      headers: { Authorization: `Bearer ${basicToken}` },
      payload: {
        method: 'passkey',
        credentialId: 'cred-id',
        authenticatorData: 'auth-data',
        signature: 'sig',
        clientDataJSON: 'client-data'
      }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('WEBAUTHN_AUTHENTICATION_FAILED')

    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${basicToken}` }
    })
    expect(after.statusCode).toBe(401)
    expect(after.json().code).toBe(STEP_UP_REQUIRED)
  })

  it('TC-SU-05: 非管理员无 step-up 能力 → 403', async () => {
    setAdmin('10001')
    const pleb = seedArtist({ qq_number: '20002', subdomain: 'pleb' })
    const plebToken = createSession(pleb.id, pleb.token_version)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/step-up',
      headers: { Authorization: `Bearer ${plebToken}` },
      payload: { method: 'totp', code: '123456' }
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('ADMIN_REQUIRED')
  })

  it('TC-SU-06: 30 分钟窗口过期 — 升级会话超过 30 分钟需重新验证', async () => {
    const admin = setAdmin()
    const expiredAt = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    const expiredToken = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: expiredAt
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${expiredToken}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe(STEP_UP_REQUIRED)

    // 窗口内（刚验证）放行
    const freshToken = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date().toISOString()
    })
    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${freshToken}` }
    })
    expect(ok.statusCode).toBe(200)
  })

  it('TC-SU-07: 动作级 60 秒强制 — 更换管理员无视 30 分钟窗口', async () => {
    const admin = setAdmin()
    const target = seedArtist({ qq_number: '20002', subdomain: 'new-admin' })
    bindArtistTotp(target)

    // 2 分钟前验证（仍在 30 分钟入口窗口内，但动作级已过期）
    const staleToken = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString()
    })
    const staleRes = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${staleToken}` },
      payload: { newQq: '20002', currentCode: '123456', newCode: '123456' }
    })
    expect(staleRes.statusCode).toBe(401)
    expect(staleRes.json().code).toBe(STEP_UP_REQUIRED)

    // 30 秒内验证 → 动作级放行（业务校验先返回「不能与当前管理员相同」，证明中间件已通过）
    const freshToken = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date(Date.now() - 30 * 1000).toISOString()
    })
    const freshRes = await app.inject({
      method: 'POST',
      url: '/api/admin/transfer',
      headers: { Authorization: `Bearer ${freshToken}` },
      payload: { newQq: '10001', currentCode: '123456', newCode: '123456' }
    })
    expect(freshRes.statusCode).toBe(400)
    expect(freshRes.json().error).toContain('不能与当前管理员相同')
  })

  it('TC-SU-08: 新会话未升级访问管理后台读/写路由均被拒', async () => {
    const admin = setAdmin()
    const basicToken = createSession(admin.id, admin.token_version)
    const headers = { Authorization: `Bearer ${basicToken}` }

    // 读路由
    const read = await app.inject({ method: 'GET', url: '/api/admin/artists', headers })
    expect(read.statusCode).toBe(401)
    expect(read.json().code).toBe(STEP_UP_REQUIRED)
    // 写路由
    const write = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers,
      payload: { qqNumber: '30003', name: 'X', subdomain: 'newbie' }
    })
    expect(write.statusCode).toBe(401)
    expect(write.json().code).toBe(STEP_UP_REQUIRED)
    // 其他管理后台模块（guestbook/tracking/health）同样被拒
    const messages = await app.inject({ method: 'GET', url: '/api/admin/messages', headers })
    expect(messages.statusCode).toBe(401)
    expect(messages.json().code).toBe(STEP_UP_REQUIRED)
    const tracking = await app.inject({ method: 'GET', url: '/api/admin/tracking-config', headers })
    expect(tracking.statusCode).toBe(401)
    expect(tracking.json().code).toBe(STEP_UP_REQUIRED)
    const health = await app.inject({ method: 'GET', url: '/api/admin/health', headers })
    expect(health.statusCode).toBe(401)
    expect(health.json().code).toBe(STEP_UP_REQUIRED)
  })

  it('TC-SU-09: bumpTokenVersion 踢下线联动 — 升级会话自然失效', async () => {
    const admin = setAdmin()
    const upgradedToken = createSession(admin.id, admin.token_version, {
      authLevel: 'admin_verified',
      adminVerifiedAt: new Date().toISOString()
    })

    // 递增 token_version（模拟登出/权限变更）
    db.prepare('UPDATE artists SET token_version = token_version + 1 WHERE id = ?').run(admin.id)

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${upgradedToken}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('TOKEN_REVOKED')
  })

  it('TC-SU-10: 旧 token（无 auth_level 字段）兼容 — 视为 basic 拒绝升级访问', async () => {
    const admin = setAdmin()
    const legacyToken = createSession(admin.id, admin.token_version)
    const session = verifySession(legacyToken)
    expect(session?.auth_level).toBeUndefined()
    expect(session?.admin_verified_at).toBeUndefined()

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${legacyToken}` }
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe(STEP_UP_REQUIRED)
  })

  it('TC-SU-11: step-up 接口 IP 限流（10 次/5 分钟）', async () => {
    const admin = setAdmin()
    const basicToken = createSession(admin.id, admin.token_version)
    verifyLogin.mockRejectedValue(new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401))
    const headers = { Authorization: `Bearer ${basicToken}` }
    const payload = {
      method: 'passkey',
      credentialId: 'cred-id',
      authenticatorData: 'auth-data',
      signature: 'sig',
      clientDataJSON: 'client-data'
    }

    for (let i = 0; i < 10; i++) {
      // 独立 remoteAddress：避免同文件前序用例已消耗同 IP 限流计数
      const res = await app.inject({ method: 'POST', url: '/api/auth/step-up', headers, payload, remoteAddress: '198.51.100.77' })
      expect(res.statusCode).toBe(401)
    }
    const blocked = await app.inject({ method: 'POST', url: '/api/auth/step-up', headers, payload, remoteAddress: '198.51.100.77' })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().code).toBe('RATE_LIMITED')
  })
})
