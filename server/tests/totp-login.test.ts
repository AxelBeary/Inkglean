// REQ-027 端到端登录流程测试（验收标准 2）：
// 管理员建号 → 生成二维码 → 模拟绑定 → QQ+动态码登录成功；输错 5 次锁定；重置后旧密钥失效
// GHSA-6pf3-854w P1 口径：匿名登录失败五态对外统一 401+TOTP_INVALID+同文案（测试同改）
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Writable } from 'stream'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession, resetTotpLoginAttemptStore } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'
import { buildApp } from '../src/app.js'

describe('TOTP 登录端到端 (REQ-027)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    // IP 维度限流桶与 (IP,账号) 防爆破态均为进程内存：逐例清空防跨用例残留误伤
    resetRateLimitBuckets()
    resetTotpLoginAttemptStore()
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

  it('TC-TLOG-02: 连续输错 5 次锁定该 (IP,账号) 组合，第 6 次正确码也被拒；对外全程同码同文案无明细', async () => {
    const { token } = setupAdmin()
    const artist = seedArtist({ qq_number: '77112', subdomain: 'e2e-lock' })
    const secret = await bindInit(token, artist.id)
    await bindConfirm(token, artist.id, computeTotp(secret, Date.now()))

    // 5 次错误：每次都应收到与「不存在 QQ」完全一致的对外响应（P1 口径，无剩余次数、无 detail）
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { qqNumber: '77112', code: '000000' }
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('TOTP_INVALID')
      expect(res.json().error).toBe('QQ号或动态口令错误')
      expect(res.json().detail).toBeUndefined()
    }

    // 锁定生效：本 IP 正确码也被拒，对外响应仍逐字一致（不再透出 TOTP_LOCKED/remainingLockMs）
    const locked = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: { qqNumber: '77112', code: computeTotp(secret, Date.now()) }
    })
    expect(locked.statusCode).toBe(401)
    expect(locked.json().code).toBe('TOTP_INVALID')
    expect(locked.json().error).toBe('QQ号或动态口令错误')
    expect(locked.json().detail).toBeUndefined()

    // 单 IP 锁不死账号：另一 IP 的正确码照常登录（IP+账号联合键，不互锁）
    const otherIp = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: '203.0.113.140',
      payload: { qqNumber: '77112', code: computeTotp(secret, Date.now()) }
    })
    expect(otherIp.statusCode).toBe(200)
  })

  it('TC-TLOG-05: 路由层五态统一——不存在/码错/未绑定/封禁/锁定对外逐字节一致（GHSA-6pf3 P1）', async () => {
    const { token } = setupAdmin()
    const bound = seedArtist({ qq_number: '77115', subdomain: 'e2e-unify' })
    const secret = await bindInit(token, bound.id)
    await bindConfirm(token, bound.id, computeTotp(secret, Date.now()))
    const unbound = seedArtist({ qq_number: '77116', subdomain: 'e2e-unbound', totp_secret: null, totp_verified: 0 })

    // 态1 QQ 不存在；态2 码错；态3 未绑定
    const r1 = await app.inject({ method: 'POST', url: '/api/auth/verify', remoteAddress: '203.0.113.151', payload: { qqNumber: '999999999', code: '123456' } })
    const r2 = await app.inject({ method: 'POST', url: '/api/auth/verify', remoteAddress: '203.0.113.152', payload: { qqNumber: '77115', code: '000000' } })
    const r3 = await app.inject({ method: 'POST', url: '/api/auth/verify', remoteAddress: '203.0.113.153', payload: { qqNumber: String(unbound.qq_number), code: '123456' } })
    // 态4 封禁（直接置位，语义见 compliance TC-CMP-08 的 admin 路由面）
    db.prepare('UPDATE artists SET is_banned = 1 WHERE id = ?').run(bound.id)
    const r4 = await app.inject({ method: 'POST', url: '/api/auth/verify', remoteAddress: '203.0.113.154', payload: { qqNumber: '77115', code: computeTotp(secret, Date.now()) } })
    // 态5 账号级锁定（登录态防爆破路径写入的 DB 锁）
    db.prepare('UPDATE artists SET is_banned = 0, totp_locked_until = ? WHERE id = ?').run(Date.now() + 15 * 60_000, bound.id)
    const r5 = await app.inject({ method: 'POST', url: '/api/auth/verify', remoteAddress: '203.0.113.155', payload: { qqNumber: '77115', code: computeTotp(secret, Date.now()) } })

    const bodies = [r1, r2, r3, r4, r5].map(res => ({
      status: res.statusCode,
      json: res.json()
    }))
    for (const b of bodies) {
      expect(b.status).toBe(401)
      expect(b.json.code).toBe('TOTP_INVALID')
      expect(b.json.error).toBe('QQ号或动态口令错误')
      expect(b.json.detail).toBeUndefined()
      // 不泄露封禁/锁定/注册状态的关键字
      expect(JSON.stringify(b.json)).not.toMatch(/封禁|锁定|注册|剩余|次/)
    }
    // 五份响应逐字节一致（对外不可区分的最强断言）
    const texts = [r1, r2, r3, r4, r5].map(res => res.body)
    expect(new Set(texts).size).toBe(1)
  })

  it('TC-TLOG-06: 管理员账号连续失败达阈值 → 审计日志落盘（对外仍统一，内部供告警）', async () => {
    // 日志捕获流（routes.test.ts 823 组同款模式）：审计面断言
    const lines: string[] = []
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString())
        cb()
      }
    })
    const captureApp = await buildApp({ logger: stream })
    await captureApp.ready()
    try {
      db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10009')
      seedArtist({ qq_number: '10009', subdomain: 'admin-brute' }) // 默认已绑定（占位密钥）
      // 同 IP 打满 5 次错误（锁定跃迁发生）
      for (let i = 0; i < 5; i++) {
        const res = await captureApp.inject({
          method: 'POST',
          url: '/api/auth/verify',
          remoteAddress: '203.0.113.161',
          payload: { qqNumber: '10009', code: '000000' }
        })
        expect(res.statusCode).toBe(401)
        expect(res.json().code).toBe('TOTP_INVALID')
      }
      const joined = lines.join('')
      // 1) 每次拒绝都有 reason 归因的内部日志（对外不可辨 ≠ 内部不可查）
      expect(joined).toContain('auth_login_denied')
      // 2) 达阈值跃迁时管理员账号单独审计行（供告警订阅）
      expect(joined).toContain('audit_admin_totp_bruteforce')
      expect(joined).toContain('AUDIT 管理员账号登录爆破触发锁定')
    } finally {
      await captureApp.close()
    }
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
