// ============================================
// GHSA-6pf3-g4xq-854w Wave1（S3）生产链路集成回归：管理员自指 bind-init/reset 守卫 × REQ-038 全站 503 门
// 背景：vitest.config.ts 把 NODE_ENV 钉在 test，app.ts 的开箱守门（仅 production 生效）在全部
// 既有单测里早退——「管理员把自己置未绑定 → isSetupCompleted()=false → 全站 503」这条高危链路
// 零覆盖。本文件按 app-cookie-secret/init-failfast 既有先例，在测试内临时切 NODE_ENV=production
// 起完整 app（SESSION_SECRET 换强值以通过 815 #12 弱密钥 fail-fast），实测：
//   1. 503 门在本环境真实生效（直接 bindTotpInit 复现修复前后果 → 503 SETUP_REQUIRED）；
//   2. 守卫上线后：管理员对自己行 bind-init/reset 被 403 ADMIN_TOTP_SELF_FORBIDDEN 拒绝，
//      isSetupCompleted() 保持 true，/api/ 不被 503（未登录请求到达处理器得 401）；
//   3. 非管理员行 bind-init/reset 行为不变（不回归）。
// ============================================
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession, bindTotpInit, confirmTotpBind } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { isSetupCompleted } from '../src/features/setup/setup.service.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

/** seedArtist 的占位密钥（tests/setup.ts 默认列），造/恢复绑定态用 */
const SEED_SECRET = 'JBSWY3DPEHPK3PXP'

/** 815 #12：production 下 SESSION_SECRET 弱值（dev- 前缀/已知默认/<32 位）拒绝启动——测试用强随机长度值 */
const STRONG_SESSION_SECRET = 's3-wave1-production-integration-secret-0123456789ABCDEF'

describe('GHSA-6pf3-g4xq-854w Wave1 S3：生产 503 门下的管理员自指守卫', () => {
  const savedEnv = {
    nodeEnv: process.env.NODE_ENV,
    sessionSecret: process.env.SESSION_SECRET,
    cookieSecret: process.env.COOKIE_SECRET,
    webauthnRpId: process.env.WEBAUTHN_RP_ID,
    webauthnOrigin: process.env.WEBAUTHN_ORIGIN
  }

  beforeAll(() => {
    process.env.NODE_ENV = 'production'
    process.env.SESSION_SECRET = STRONG_SESSION_SECRET
    // cookie 密钥兜底链：COOKIE_SECRET 未设时回落 SESSION_SECRET——删掉避免继承外层弱值
    delete process.env.COOKIE_SECRET
    // S1 新增 assertWebauthnConfig：production 缺 WEBAUTHN_RP_ID/ORIGIN 拒起（auth.routes 注册期）——本文件测 503 门非测 WebAuthn，给占位值放行
    process.env.WEBAUTHN_RP_ID = 'example.test'
    process.env.WEBAUTHN_ORIGIN = 'https://example.test'
  })

  afterAll(() => {
    if (savedEnv.nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = savedEnv.nodeEnv
    if (savedEnv.sessionSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = savedEnv.sessionSecret
    if (savedEnv.cookieSecret === undefined) delete process.env.COOKIE_SECRET
    else process.env.COOKIE_SECRET = savedEnv.cookieSecret
    if (savedEnv.webauthnRpId === undefined) delete process.env.WEBAUTHN_RP_ID
    else process.env.WEBAUTHN_RP_ID = savedEnv.webauthnRpId
    if (savedEnv.webauthnOrigin === undefined) delete process.env.WEBAUTHN_ORIGIN
    else process.env.WEBAUTHN_ORIGIN = savedEnv.webauthnOrigin
  })

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

  /** 管理员：admin_qq 落库 + 已绑定画师行 + REQ-041 step-up 会话 */
  function makeAdmin(qq: string): { admin: ArtistRow; headers: { Authorization: string } } {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    const admin = seedArtist({ qq_number: qq, subdomain: `s3-admin-${qq.slice(-4)}` })
    const token = createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
    return { admin, headers: { Authorization: `Bearer ${token}` } }
  }

  it('TC-S3-PROD-01: 503 门真实生效——管理员对自己行 bind-init/reset 被 403 拒，isSetupCompleted 保持 true、全站不瘫', async () => {
    const { admin, headers } = makeAdmin('11001')
    expect(isSetupCompleted()).toBe(true)

    // ① 门活性证明：绕过路由直接调 bindTotpInit（= 修复前 bind-init 的后果），管理员置未绑定态
    bindTotpInit(admin.id, SEED_SECRET)
    expect(isSetupCompleted()).toBe(false)
    const down = await app.inject({ method: 'GET', url: '/api/admin/artists' })
    expect(down.statusCode).toBe(503)
    expect(down.json().code).toBe('SETUP_REQUIRED') // ← 生产守门确实拦在这里（本文件 NODE_ENV=production 有效）

    // 恢复绑定态（模拟事故修复），再测守卫的正式行为
    confirmTotpBind(admin.id, computeTotp(SEED_SECRET, Date.now()))
    expect(isSetupCompleted()).toBe(true)
    const up = await app.inject({ method: 'GET', url: '/api/admin/artists' })
    expect(up.statusCode).toBe(401) // 门放行、到达鉴权（未登录）——非 503

    // ② bind-init 对自己 → 403 ADMIN_TOTP_SELF_FORBIDDEN，任何绑定态/会话版本不动
    const selfInit = await app.inject({ method: 'POST', url: `/api/admin/artists/${admin.id}/totp/bind-init`, headers })
    expect(selfInit.statusCode).toBe(403)
    expect(selfInit.json().code).toBe('ADMIN_TOTP_SELF_FORBIDDEN')
    expect(isSetupCompleted()).toBe(true)

    // ③ reset 对自己 → 403，totp_secret 未被清 NULL（硬锁死通道关闭）
    const selfReset = await app.inject({ method: 'POST', url: `/api/admin/artists/${admin.id}/totp/reset`, headers })
    expect(selfReset.statusCode).toBe(403)
    expect(selfReset.json().code).toBe('ADMIN_TOTP_SELF_FORBIDDEN')
    const row = db.prepare('SELECT totp_secret, totp_verified, token_version FROM artists WHERE id = ?').get(admin.id) as { totp_secret: string | null; totp_verified: number; token_version: number }
    expect(row.totp_secret).toBe(SEED_SECRET)
    expect(row.totp_verified).toBe(1)
    expect(row.token_version).toBe(admin.token_version)

    // ④ 全程未因守卫自身触发 503：未登录 /api 请求仍是 401（门放行态）
    const stillUp = await app.inject({ method: 'GET', url: '/api/admin/artists' })
    expect(stillUp.statusCode).toBe(401)
  })

  it('TC-S3-PROD-02: 非管理员行 bind-init/reset 在生产门下行为不变（不回归）', async () => {
    const { headers } = makeAdmin('11002')
    const target = seedArtist({ qq_number: '11003', subdomain: 's3-target' })

    const init = await app.inject({ method: 'POST', url: `/api/admin/artists/${target.id}/totp/bind-init`, headers })
    expect(init.statusCode).toBe(200)
    expect(init.json().otpauthUri).toContain('secret=')

    const reset = await app.inject({ method: 'POST', url: `/api/admin/artists/${target.id}/totp/reset`, headers })
    expect(reset.statusCode).toBe(200)

    // 全站不瘫：管理员绑定态从未被触碰
    expect(isSetupCompleted()).toBe(true)
    const probe = await app.inject({ method: 'GET', url: '/api/admin/artists' })
    expect(probe.statusCode).toBe(401) // 401（鉴权层）而非 503（守门层）
  })

  it('TC-S3-PROD-03: setup/totp-confirm 非管理员 QQ 被拒且向导窗口不产生管理员会话', async () => {
    // 向导中途（admin_qq 已建、TOTP 未确认）：手建画师行用自己正确动态码打 confirm 接管
    db.prepare("UPDATE platform_config SET value = '11004' WHERE key = 'admin_qq'").run()
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'setup_completed'").run()
    seedArtist({ qq_number: '11004', subdomain: 's3-wizard-admin', totp_secret: SEED_SECRET, totp_verified: 0 })
    const intruder = seedArtist({ qq_number: '11005', subdomain: 's3-wizard-intruder', totp_secret: SEED_SECRET, totp_verified: 0 })

    const code = computeTotp(SEED_SECRET, Date.now())
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup/totp-confirm',
      payload: { qqNumber: intruder.qq_number, code }
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('SETUP_ADMIN_MISMATCH')
    // 未落任何完成态/验证态，也无会话 cookie 下发
    const done = db.prepare("SELECT value FROM platform_config WHERE key = 'setup_completed'").get() as { value: string }
    expect(done.value).not.toBe('1')
    const row = db.prepare('SELECT totp_verified FROM artists WHERE id = ?').get(intruder.id) as { totp_verified: number }
    expect(row.totp_verified).toBe(0)
    const rawSetCookie = res.headers['set-cookie']
    expect(String(Array.isArray(rawSetCookie) ? rawSetCookie.join(';') : rawSetCookie ?? '')).not.toContain('artist_token=')

    // 管理员本人 QQ 同码 → 正常完成（正向链路不回归）
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/setup/totp-confirm',
      payload: { qqNumber: '11004', code: computeTotp(SEED_SECRET, Date.now()) }
    })
    expect(adminRes.statusCode).toBe(200)
    expect(adminRes.json().isAdmin).toBe(true)
    expect(isSetupCompleted()).toBe(true)
  })
})
