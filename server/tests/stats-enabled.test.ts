import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { getStatsEnabled, setStatsEnabled } from '../src/features/tracking/tracking.service.js'

// 820-L 需求二：统计功能管理员开关（默认 0=关闭，未开则画师后台隐藏整个统计导航）
describe('统计功能总开关 (Stats Enabled)', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow

  beforeEach(async () => {
    cleanDb()
    // platform_config 不被 cleanDb 清理，先清统计相关键防用例间泄漏
    db.prepare("DELETE FROM platform_config WHERE key = 'stats_enabled' OR key = 'stats_mode' OR key = 'artist_stats_visible'").run()
    admin = seedArtist({ qq_number: '10001', subdomain: 'admin-se' })
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    artist = seedArtist({ qq_number: '20002', subdomain: 'bob-se' })
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function adminToken(): string {
    return createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
  }

  function configGet() {
    return app.inject({
      method: 'GET',
      url: '/api/admin/tracking-config',
      headers: { Authorization: `Bearer ${adminToken()}` }
    })
  }

  function configPut(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: { Authorization: `Bearer ${adminToken()}` },
      payload
    })
  }

  function artistProfile() {
    return app.inject({
      method: 'GET',
      url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
    })
  }

  it('TC-SE-01: 默认关闭（服务层/管理读接口/画师 profile 三处一致为 false）', async () => {
    expect(getStatsEnabled()).toBe(false)
    const cfg = await configGet()
    expect(cfg.statusCode).toBe(200)
    expect(cfg.json().statsEnabled).toBe(false)
    const profile = await artistProfile()
    expect(profile.statusCode).toBe(200)
    expect(profile.json().statsEnabled).toBe(false)
  })

  it('TC-SE-02: PUT statsEnabled=true → 管理读接口与画师 profile 均变 true', async () => {
    const put = await configPut({ statsEnabled: true })
    expect(put.statusCode).toBe(200)
    expect(put.json().statsEnabled).toBe(true)
    expect(getStatsEnabled()).toBe(true)

    const cfg = await configGet()
    expect(cfg.json().statsEnabled).toBe(true)
    const profile = await artistProfile()
    expect(profile.json().statsEnabled).toBe(true)
  })

  it('TC-SE-03: 关闭→开启→再关闭 可往返（默认关闭语义可逆）', async () => {
    await configPut({ statsEnabled: true })
    await configPut({ statsEnabled: false })
    expect(getStatsEnabled()).toBe(false)
    const profile = await artistProfile()
    expect(profile.json().statsEnabled).toBe(false)
  })

  it('TC-SE-04: 三态开关与总开关互不覆盖', async () => {
    await configPut({ statsEnabled: true })
    await configPut({ statsMode: 'on' })
    const cfg = await configGet()
    expect(cfg.json().statsEnabled).toBe(true)
    expect(cfg.json().statsMode).toBe('on')

    await configPut({ statsEnabled: false })
    const cfg2 = await configGet()
    expect(cfg2.json().statsEnabled).toBe(false)
    expect(cfg2.json().statsMode).toBe('on')
  })

  it('TC-SE-05: 空 body / 非法 statsEnabled 类型被拒 400', async () => {
    const empty = await configPut({})
    expect(empty.statusCode).toBe(400)
    const wrong = await configPut({ statsEnabled: 'yes' })
    expect(wrong.statusCode).toBe(400)
  })

  it('TC-SE-06: setStatsEnabled 服务层往返', () => {
    expect(setStatsEnabled(true)).toBe(true)
    expect((db.prepare("SELECT value FROM platform_config WHERE key = 'stats_enabled'").get() as { value: string }).value).toBe('1')
    expect(getStatsEnabled()).toBe(true)
    expect(setStatsEnabled(false)).toBe(false)
    expect(getStatsEnabled()).toBe(false)
  })
})
