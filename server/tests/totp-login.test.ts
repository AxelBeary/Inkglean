// REQ-027 端到端登录流程测试（验收标准 2）：
// 管理员建号 → 生成二维码 → 模拟绑定 → QQ+动态码登录成功；输错 5 次锁定；重置后旧密钥失效
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession, TOTP_LOCK_DURATION_MS } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { buildApp } from '../src/app.js'

describe('TOTP 登录端到端 (REQ-027)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 设置管理员 + 返回管理员行与 token */
  function setupAdmin(qq: string = '10001') {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qq)
    const admin = seedArtist({ qq_number: qq, subdomain: 'admin-totp' })
    // REQ-041：管理后台路由需 step-up 升级会话
    return { admin, token: createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string }) }
  }

  /** 管理员生成绑定二维码，返回密钥 */
  async function bindInit(adminToken: string, artistId: number): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artistId}/totp/bind-init`,
      headers: { Authorization: `Bearer ${adminToken}` }
    })
    expect(res.statusCode).toBe(200)
    const uri = res.json().otpauthUri
    return uri.match(/secret=([A-Z2-7]+)/)[1]
  }

  /** 管理员确认绑定 */
  async function bindConfirm(adminToken: string, artistId: number, code: string) {
    return app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artistId}/totp/bind-confirm`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { code }
    })
  }

  it('TC-TLOG-01: 完整链路 — 建号→绑码→QQ+动态码登录成功', async () => {
    const { token } = setupAdmin()
    // 建号（模拟管理员后台创建画师）
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${token}` },
      payload: { qqNumber: '77111', name: '端到端画师', subdomain: 'e2eartist' }
    })
    expect(created.statusCode).toBe(200)
    const artist = created.json()

    // 生成二维码
    const secret = await bindInit(token, artist.id)
    // 模拟绑定：管理员输入画师报的码
    const confirmRes = await bindConfirm(token, artist.id, computeTotp(secret, Date.now()))
    expect(confirmRes.statusCode).toBe(200)

    // 未登录状态下用 QQ + 动态码登录
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '77111', code: computeTotp(secret, Date.now()) }
    })
    expect(loginRes.statusCode).toBe(200)
    const body = loginRes.json()
    expect(body.isAdmin).toBe(false)
    expect(body.artist.name).toBe('端到端画师')
    // 登录后 set-cookie 包含 artist_token
    expect(loginRes.headers['set-cookie']).toBeTruthy()
  })

  it('TC-TLOG-02: 连续输错 5 次锁定，第 6 次正确码也被拒', async () => {
    const { token } = setupAdmin()
    const artist = seedArtist({ qq_number: '77112', subdomain: 'e2e-lock' })
    const secret = await bindInit(token, artist.id)
    await bindConfirm(token, artist.id, computeTotp(secret, Date.now()))

    // 连续错 5 次：前 4 次普通失败（401 TOTP_INVALID），第 5 次触发锁定
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { qqNumber: '77112', code: '000000' }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('TOTP_INVALID')
    }

    // 第 5 次：登录路径锁定语义（路由对 !valid 固定 401，锁定以 code + remainingLockMs 区分）
    const fifth = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '77112', code: '000000' }
    })
    expect(fifth.statusCode).toBe(401)
    expect(fifth.json().code).toBe('TOTP_LOCKED')
    expect(fifth.json().detail.remainingLockMs).toBe(TOTP_LOCK_DURATION_MS)

    // 锁定后正确码也被拒
    const locked = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '77112', code: computeTotp(secret, Date.now()) }
    })
    expect(locked.statusCode).toBe(401)
    expect(locked.json().code).toBe('TOTP_LOCKED')
    expect(locked.json().detail.remainingLockMs).toBeGreaterThan(0)
  })

  it('TC-TLOG-03: 重置后旧密钥失效，需重新绑定才能登录', async () => {
    const { token } = setupAdmin()
    const artist = seedArtist({ qq_number: '77113', subdomain: 'e2e-reset' })
    const secret = await bindInit(token, artist.id)
    await bindConfirm(token, artist.id, computeTotp(secret, Date.now()))

    // 重置绑定
    const resetRes = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/reset`,
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(resetRes.statusCode).toBe(200)

    // 旧密钥登录失败（未绑定）
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '77113', code: computeTotp(secret, Date.now()) }
    })
    expect(loginRes.statusCode).toBe(401)
    expect(loginRes.json().code).toBe('TOTP_INVALID')

    // 重新绑定后可登录
    const secret2 = await bindInit(token, artist.id)
    await bindConfirm(token, artist.id, computeTotp(secret2, Date.now()))
    const relogin = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '77113', code: computeTotp(secret2, Date.now()) }
    })
    expect(relogin.statusCode).toBe(200)
  })

  it('TC-TLOG-04: 登录返回 isAdmin 标记（管理员走同一 TOTP 登录）', async () => {
    // 会话门禁批：不再用「管理员对自己 bind-init/confirm」的方式造绑定态——
    // bind-init 会把管理员置为未绑定态并踢掉其全部会话，而 bind-confirm 挂在 requireAdmin 后，
    // 未绑定门禁会拦截，形成死锁（此为门禁批预期语义：管理员给自己下发重绑后需 CLI 兜底）。
    // 改用 seedArtist 默认已绑定态（占位密钥）直接验证管理员登录路径。
    setupAdmin()

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '10001', code: computeTotp('JBSWY3DPEHPK3PXP', Date.now()) }
    })
    expect(loginRes.statusCode).toBe(200)
    expect(loginRes.json().isAdmin).toBe(true)
  })
})
