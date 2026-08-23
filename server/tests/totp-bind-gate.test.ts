// ============================================
// 会话门禁批：动态口令未绑定（totp_verified=0）的画师不允许持有任何有效会话
// 覆盖场景：
//   a. 管理员 reset 口令后，该画师既有会话请求 → 401 TOTP_BIND_REQUIRED
//   b. 管理员 bind-init（重绑）后同样踢掉既有会话
//   c. requireAuth / requireAdmin：有效 token 但 verified=0 → 401 TOTP_BIND_REQUIRED
//   f. 自助重绑完成后画师会话仍然有效（重签新 cookie，不被踢）
// ============================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

/** 契约文案：与前端共享，不得更改 */
const BIND_REQUIRED_MSG = '你的动态口令绑定已失效（可能刚被重置或绑定未完成），请重新完成绑定流程，或联系管理员处理'

/** seedArtist 默认占位密钥（tests/setup.ts 同款） */
const SEED_SECRET = 'JBSWY3DPEHPK3PXP'

describe('会话门禁批：未绑定画师不得持有有效会话', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  /** 设置管理员：写 platform_config + 返回管理员画师行（seedArtist 默认已绑定） */
  function setAdmin(qqNumber: string): ArtistRow {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
    return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
  }

  /** 管理员 token（REQ-041 step-up 升级会话） */
  function adminToken(artist: ArtistRow): string {
    return createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
  }

  it('TC-GATE-A: 管理员 reset 口令后，该画师既有会话请求返回 401 TOTP_BIND_REQUIRED', async () => {
    const admin = setAdmin('10101')
    const artist = seedArtist({ qq_number: '20101', subdomain: 'gate-reset' })
    const artistToken = createSession(artist.id, artist.token_version)

    // 前置：既有会话当前可用
    const before = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${artistToken}` } })
    expect(before.statusCode).toBe(200)

    // 管理员重置该画师动态口令
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/reset`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(resetRes.statusCode).toBe(200)

    // 既有会话立即失效：未绑定门禁码（而非 TOKEN_REVOKED）+ 契约文案
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${artistToken}` } })
    expect(after.statusCode).toBe(401)
    expect(after.json().code).toBe('TOTP_BIND_REQUIRED')
    expect(after.json().error).toBe(BIND_REQUIRED_MSG)

    // token_version 确实 +1（重置瞬间踢人）
    const row = db.prepare('SELECT token_version FROM artists WHERE id = ?').get(artist.id) as { token_version: number }
    expect(row.token_version).toBe((artist.token_version || 1) + 1)
  })

  it('TC-GATE-B: 管理员 bind-init（重绑）后同样踢掉既有会话', async () => {
    const admin = setAdmin('10102')
    const artist = seedArtist({ qq_number: '20102', subdomain: 'gate-bindinit' })
    const artistToken = createSession(artist.id, artist.token_version)

    const before = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${artistToken}` } })
    expect(before.statusCode).toBe(200)

    const initRes = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-init`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(initRes.statusCode).toBe(200)
    expect(initRes.json().otpauthUri).toContain('secret=')

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${artistToken}` } })
    expect(after.statusCode).toBe(401)
    expect(after.json().code).toBe('TOTP_BIND_REQUIRED')
    expect(after.json().error).toBe(BIND_REQUIRED_MSG)
  })

  it('TC-GATE-C: requireAuth/requireAdmin——有效 token 但 verified=0 → 401 TOTP_BIND_REQUIRED', async () => {
    // 手工造一个未绑定但持有效 token 的画师（门禁批之前的存量态/被重置态）
    const artist = seedArtist({ qq_number: '20103', subdomain: 'gate-unbound', totp_secret: null, totp_verified: 0 })
    const token = createSession(artist.id, artist.token_version)

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${token}` } })
    expect(me.statusCode).toBe(401)
    expect(me.json().code).toBe('TOTP_BIND_REQUIRED')
    expect(me.json().error).toBe(BIND_REQUIRED_MSG)

    // requireAdmin 同款门禁：即使 QQ 命中管理员，未绑定同样拦截（且先于 403 ADMIN_REQUIRED 判定）
    db.prepare("UPDATE platform_config SET value = '20103' WHERE key = 'admin_qq'").run()
    const adminRes = await app.inject({ method: 'GET', url: '/api/admin/artists', headers: { Authorization: `Bearer ${token}` } })
    expect(adminRes.statusCode).toBe(401)
    expect(adminRes.json().code).toBe('TOTP_BIND_REQUIRED')
  })

  it('TC-GATE-F: 自助重绑完成后画师会话仍然有效（重签新 cookie，不被踢）', async () => {
    const artist = seedArtist({ qq_number: '20104', subdomain: 'gate-rebind' })
    const token = createSession(artist.id, artist.token_version)

    // Step1：重绑初始化（无 Passkey → 旧码路径）
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-init',
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(initRes.statusCode).toBe(200)
    const initBody = initRes.json()
    expect(initBody.verifyMethod).toBe('code')
    const newSecret = (initBody.otpauthUri as string).match(/secret=([A-Z2-7]+)/)?.[1]
    expect(newSecret).toBeTruthy()

    // Step2：旧码 + 新码确认重绑
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/auth/totp/rebind-confirm',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        code: computeTotp(SEED_SECRET, Date.now()),
        tempKey: initBody.tempKey,
        newCode: computeTotp(newSecret as string, Date.now())
      }
    })
    expect(confirmRes.statusCode).toBe(200)

    // confirm 响应必须重签并下发新会话 cookie
    const setCookie = confirmRes.headers['set-cookie']
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
    expect(cookieHeader).toContain('artist_token=')
    const newCookie = (cookieHeader as string).split(';')[0]

    // 新 cookie 立即可用——画师本人会话无缝续接（未被踢）
    // /api/auth/me 返回 publicArtistDTO 平铺形状（原始列名，非嵌套）
    const meNew = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: newCookie } })
    expect(meNew.statusCode).toBe(200)
    expect(meNew.json().qq_number).toBe('20104')

    // 旧 token 已被 bump 作废（其他设备被踢，本人靠新 cookie 续接）
    const meOld = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { Authorization: `Bearer ${token}` } })
    expect(meOld.statusCode).toBe(401)
    expect(meOld.json().code).toBe('TOKEN_REVOKED')
  })
})
