// 安全加固批 F1: TOTP 密钥不泄露（DTO 投影回归测试）
// 4 个端点断言不含 totp_secret 等敏感列；前端消费字段（quick_actions/totp_verified 等）不缺失
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

const SENSITIVE = ['totp_secret', 'totp_failed_attempts', 'totp_locked_until', 'token_version', 'deleted_at']
const BEARER = 'Bear' + 'er ' // 拼接避免写坏语法

describe('安全加固批 F1: TOTP 密钥 DTO 投影', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 设置管理员 + 普通画师（含已绑定 TOTP 密钥），返回各自 token */
  function setup() {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-sec' })
    const artist = seedArtist({ qq_number: '20001', subdomain: 'alice-sec' })
    // 模拟已绑定 TOTP + 有快捷操作配置（真实生产库 41 列）
    db.prepare("UPDATE artists SET totp_secret = 'JBSWY3DPEHPK3PXP', totp_verified = 1, totp_failed_attempts = 0 WHERE id = ?").run(artist.id)
    db.prepare("UPDATE artists SET quick_actions = '[\"slot\",\"tier\"]' WHERE id = ?").run(artist.id)
    return {
      // REQ-041：管理后台路由需 step-up 升级会话
      adminToken: createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() }),
      artistToken: createSession(artist.id, artist.token_version),
      artist
    }
  }

  /** 断言响应体不含任何敏感字段 */
  function expectNoSensitive(body) {
    const json = JSON.stringify(body)
    for (const key of SENSITIVE) {
      expect(json).not.toContain(`"${key}"`)
    }
  }

  it('TC-SEC-01: GET /api/auth/me 不含 totp_secret 等敏感列', async () => {
    const { artistToken } = setup()
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: BEARER + artistToken }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    // 前端消费字段不缺失
    expect(body.id).toBeTruthy()
    expect(body.name).toBeTruthy()
    expect(body.subdomain).toBeTruthy()
    expect(body.qq_number).toBeTruthy()
  })

  it('TC-SEC-02: GET /api/admin/artists 每项不含敏感列，保留 totp_verified/quick_actions', async () => {
    const { adminToken } = setup()
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: BEARER + adminToken }
    })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(Array.isArray(list)).toBe(true)
    for (const item of list) {
      expectNoSensitive(item)
    }
    // 管理后台「绑定/重绑」按钮依赖 totp_verified（ArtistManage.vue）
    const alice = list.find(a => a.qq_number === '20001')
    expect(alice).toBeTruthy()
    expect(alice.totp_verified).toBe(1)
    // quick_actions 保留（画师 profile 消费）
    expect(alice.quick_actions).toBeTruthy()
    // 基本展示字段
    expect(alice.name).toBeTruthy()
    expect(alice.subdomain).toBeTruthy()
  })

  it('TC-SEC-03: GET /api/admin/artists/:id/profile 不含敏感列', async () => {
    const { adminToken, artist } = setup()
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${artist.id}/profile`,
      headers: { Authorization: BEARER + adminToken }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    expect(body.totp_verified).toBe(1) // 管理端仍需绑定状态
    expect(body.name).toBeTruthy()
  })

  it('TC-SEC-04: GET /api/artist/profile（对方 patch 漏的第 4 端点）不含敏感列，保留 quick_actions', async () => {
    const { artistToken } = setup()
    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/profile',
      headers: { Authorization: BEARER + artistToken }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    // quick_actions 是前端 Preferences/QuickActions 的 profile 数据源（QuickActions.vue L68）
    expect(body.quick_actions).toBeTruthy()
    expect(body.name).toBeTruthy()
  })

  // ─── F1 补全：写路径回显（改读路径漏写路径）───
  // updateArtist()/createArtist() 内部 return getArtistById() = SELECT * 完整行，
  // 4 个写端点直接回显响应体，与读路径同级泄露面。前端对响应体零消费，DTO 包裹无破坏。

  it('TC-SEC-05: PUT /api/artist/profile 写路径回显不含敏感列', async () => {
    const { artistToken } = setup()
    const res = await app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: { Authorization: BEARER + artistToken, 'content-type': 'application/json' },
      payload: { bio: '写路径回显测试' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    expect(body.bio).toBe('写路径回显测试') // 更新生效且字段正常回显
  })

  it('TC-SEC-06: PUT /api/admin/artists/:id/status 写路径回显不含敏感列', async () => {
    const { adminToken, artist } = setup()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/status`,
      headers: { Authorization: BEARER + adminToken, 'content-type': 'application/json' },
      payload: { status: 'full' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    expect(body.status).toBe('full')
  })

  it('TC-SEC-07: PUT /api/admin/artists/:id/profile 写路径回显不含敏感列', async () => {
    const { adminToken, artist } = setup()
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/profile`,
      headers: { Authorization: BEARER + adminToken, 'content-type': 'application/json' },
      payload: { name: '管理员改名' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    expect(body.name).toBe('管理员改名')
  })

  it('TC-SEC-08: POST /api/admin/artists 创建回显不含敏感列（第 4 泄露点，追加排查）', async () => {
    const { adminToken } = setup()
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: BEARER + adminToken, 'content-type': 'application/json' },
      payload: { qqNumber: '30001', name: '新画师', subdomain: 'newbiesec', artistCode: 'NEWB' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectNoSensitive(body)
    expect(body.qq_number).toBe('30001')
    expect(body.name).toBe('新画师')
  })
})
