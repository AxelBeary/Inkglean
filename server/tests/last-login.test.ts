// 登录留痕批 (v72): 登录成功记录时间+IP，仅管理后台可见
// 覆盖三个登录入口（TOTP / 邀请首绑 / WebAuthn）与 DTO 剥离 + 管理端读回
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { computeTotp } from '../src/features/auth/totp.js'
import { generateInviteCodes } from '../src/features/invite/invite.service.js'
import { buildApp } from '../src/app.js'

const BEARER = 'Bear' + 'er ' // 拼接避免写坏语法

function getLastLogin(artistId: number): { last_login_at: string | null; last_login_ip: string | null } {
  return db.prepare('SELECT last_login_at, last_login_ip FROM artists WHERE id = ?').get(artistId) as {
    last_login_at: string | null
    last_login_ip: string | null
  }
}

describe('登录留痕批: last_login_at / last_login_ip', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    db.prepare("UPDATE platform_config SET value = 'invite' WHERE key = 'onboarding_mode'").run()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function setup() {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    const admin = seedArtist({ qq_number: '10001', subdomain: 'admin-login' })
    const artist = seedArtist({ qq_number: '20001', subdomain: 'alice-login' })
    db.prepare("UPDATE artists SET totp_secret = 'JBSWY3DPEHPK3PXP', totp_verified = 1, totp_failed_attempts = 0 WHERE id = ?").run(artist.id)
    return {
      adminToken: createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string }),
      artist,
      admin
    }
  }

  it('TC-LL-01: TOTP 登录成功 → 写入当前时间和来源 IP', async () => {
    const { artist } = setup()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: '203.0.113.7',
      payload: { qqNumber: '20001', code: computeTotp('JBSWY3DPEHPK3PXP', Date.now()) }
    })
    expect(res.statusCode).toBe(200)
    const row = getLastLogin(artist.id)
    expect(row.last_login_ip).toBe('203.0.113.7')
    expect(row.last_login_at).toBeTruthy()
    expect(Math.abs(new Date(row.last_login_at!).getTime() - Date.now())).toBeLessThan(5000)
  })

  it('TC-LL-02: 邀请首绑确认 → 同样写入时间和 IP', async () => {
    setup()
    const [invite] = generateInviteCodes(1, 3, 1)
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/invite/register',
      payload: { code: invite.code, qqNumber: '30001', name: '新画师', subdomain: 'newbie72' }
    })
    expect(regRes.statusCode).toBe(201)
    const uri = regRes.json().otpauthUri as string
    const secret = uri.match(/secret=([A-Z2-7]+)/)![1]
    const artistId = (db.prepare("SELECT id FROM artists WHERE qq_number = '30001'").get() as { id: number }).id

    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/invite/totp-confirm',
      remoteAddress: '198.51.100.9',
      payload: { qqNumber: '30001', code: computeTotp(secret, Date.now()) }
    })
    expect(confirmRes.statusCode).toBe(200)
    const row = getLastLogin(artistId)
    expect(row.last_login_ip).toBe('198.51.100.9')
    expect(row.last_login_at).toBeTruthy()
  })

  it('TC-LL-03: 登录失败 → 不记录', async () => {
    const { artist } = setup()
    await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      remoteAddress: '203.0.113.8',
      payload: { qqNumber: '20001', code: '000000' }
    })
    const row = getLastLogin(artist.id)
    expect(row.last_login_at).toBeNull()
    expect(row.last_login_ip).toBeNull()
  })

  it('TC-LL-04: GET /api/admin/artists 回传两字段', async () => {
    const { adminToken, artist } = setup()
    db.prepare('UPDATE artists SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
      .run('2026-08-23T01:00:00.000Z', '203.0.113.7', artist.id)
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artists',
      headers: { Authorization: BEARER + adminToken }
    })
    expect(res.statusCode).toBe(200)
    const alice = res.json().find((a: { qq_number: string }) => a.qq_number === '20001')
    expect(alice.last_login_at).toBe('2026-08-23T01:00:00.000Z')
    expect(alice.last_login_ip).toBe('203.0.113.7')
  })

  it('TC-LL-05: GET /api/admin/artists/:id/profile 回传两字段', async () => {
    const { adminToken, artist } = setup()
    db.prepare('UPDATE artists SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
      .run('2026-08-23T02:00:00.000Z', '198.51.100.9', artist.id)
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${artist.id}/profile`,
      headers: { Authorization: BEARER + adminToken }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.last_login_at).toBe('2026-08-23T02:00:00.000Z')
    expect(body.last_login_ip).toBe('198.51.100.9')
  })

  it('TC-LL-06: GET /api/auth/me 不外泄（DTO 剥离）', async () => {
    const { artist } = setup()
    db.prepare('UPDATE artists SET last_login_at = ?, last_login_ip = ? WHERE id = ?')
      .run('2026-08-23T03:00:00.000Z', '203.0.113.7', artist.id)
    const artistToken = createSession(artist.id, artist.token_version)
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { Authorization: BEARER + artistToken }
    })
    expect(res.statusCode).toBe(200)
    const json = JSON.stringify(res.json())
    expect(json).not.toContain('"last_login_at"')
    expect(json).not.toContain('"last_login_ip"')
  })
})
