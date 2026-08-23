// 823 标识/身份码规则对齐批: 主页标识去连字符 + 身份码上限放宽 2-20
// 拍板背景：身份码由标识大写派生（订单号前缀），旧规则「标识许连字符/20位、码只认字母数字/10位」
// 互斥——带连字符或超 10 位的标识注册必 400。新规则两形同构：小写字母+数字 2-20 ⇔ 大写码 2-20。
// 覆盖：建号/邀请两入口的长短边界 + 连字符拒绝 + 自定义码 20 位合法 / 21 位拒绝。
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { generateInviteCodes } from '../src/features/invite/invite.service.js'
import { buildApp } from '../src/app.js'

const BEARER = 'Bear' + 'er ' // 拼接避免写坏语法

describe('标识/身份码规则对齐批（823）', () => {
  let app: FastifyInstance
  let qqSeq = 40000 // 用例内建号递增取号，避随机撞车

  beforeEach(async () => {
    cleanDb()
    qqSeq = 40000
    db.prepare("UPDATE platform_config SET value = 'invite' WHERE key = 'onboarding_mode'").run()
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    seedArtist({ qq_number: '10001', subdomain: 'adminrule' })
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 管理员 step-up 会话（管理端写入口同其他管理测试口径） */
  function adminToken(): string {
    const admin = db.prepare("SELECT id, token_version FROM artists WHERE qq_number = '10001'").get() as { id: number; token_version: number }
    return createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
  }

  /** 管理员建号 */
  async function adminCreate(subdomain: string, artistCode?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: BEARER + adminToken(), 'content-type': 'application/json' },
      payload: { qqNumber: String(qqSeq++), name: '规则批画师', subdomain, ...(artistCode ? { artistCode } : {}) }
    })
  }

  /** 邀请注册（每次独立码） */
  async function inviteRegister(subdomain: string) {
    const [invite] = generateInviteCodes(1, 3, 1)
    return app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: String(qqSeq++), name: '入驻画师', subdomain }
    })
  }

  it('TC-RC-01: 20 位标识建号通过（旧死角：派生码超 10 位必 400）', async () => {
    const res = await adminCreate('abcdefghijklmnopqrst') // 20 位
    expect(res.statusCode).toBe(200)
    const row = db.prepare("SELECT artist_code FROM artists WHERE subdomain = 'abcdefghijklmnopqrst'").get() as { artist_code: string }
    expect(row.artist_code).toBe('ABCDEFGHIJKLMNOPQRST') // 派生码同长 20 位
  })

  it('TC-RC-02: 带连字符标识建号拒绝（SUBDOMAIN_FORMAT）', async () => {
    const res = await adminCreate('xiao-ming')
    expect(res.statusCode).toBe(400)
  })

  it('TC-RC-03: 21 位标识建号拒绝（超长）', async () => {
    const res = await adminCreate('abcdefghijklmnopqrstu') // 21 位
    expect(res.statusCode).toBe(400)
  })

  it('TC-RC-04: 邀请注册 11 位标识通过（旧死角解除：11-20 位标识不再被派生码长度拦死）', async () => {
    const res = await inviteRegister('longnameart') // 11 位
    expect(res.statusCode).toBe(201)
    const row = db.prepare("SELECT artist_code FROM artists WHERE subdomain = 'longnameart'").get() as { artist_code: string }
    expect(row.artist_code).toBe('LONGNAMEART')
  })

  it('TC-RC-05: 邀请注册带连字符标识拒绝（连字符不再入标识，派生死角根除）', async () => {
    const res = await inviteRegister('xiao-ming')
    // 路由 schema pattern 先拦（VALIDATION）；服务层同款正则兑底——两层均拒绝即达标，不钉死拦截层错误码
    expect(res.statusCode).toBe(400)
  })

  it('TC-RC-06: 自定义身份码 20 位合法 / 21 位拒绝', async () => {
    const ok = await adminCreate('codeok', 'ABCDEFGHIJKLMNOPQRST') // 20 位
    expect(ok.statusCode).toBe(200)
    const bad = await adminCreate('codebad', 'ABCDEFGHIJKLMNOPQRSTU') // 21 位
    expect(bad.statusCode).toBe(400)
  })
})
