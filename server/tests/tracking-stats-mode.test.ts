import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import { getStatsMode } from '../src/features/tracking/tracking.service.js'

/** 设置管理员：写 platform_config.admin_qq + 返回管理员行 */
function setAdmin(qqNumber: string): ArtistRow {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

function adminToken(artist: ArtistRow): string {
  // REQ-041：管理后台路由需 step-up 升级会话
  return createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
}

describe('埋点三态后端 (Tracking Stats Mode)', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow
  let artistToken: string

  beforeEach(async () => {
    cleanDb()
    // 三态开关在 platform_config（cleanDb 不清，避免用例间泄漏）
    db.prepare("DELETE FROM platform_config WHERE key = 'stats_mode' OR key = 'artist_stats_visible'").run()
    admin = setAdmin('10001')
    artist = seedArtist({ qq_number: '20002', subdomain: 'bob' })
    artistToken = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function summaryReq() {
    return app.inject({
      method: 'GET',
      url: '/api/artist/tracking/summary',
      headers: { Authorization: `Bearer ${artistToken}` }
    })
  }

  function putMode(statsMode: string) {
    return app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { statsMode }
    })
  }

  function getConfig() {
    return app.inject({
      method: 'GET',
      url: '/api/admin/tracking-config',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
  }

  let anonIpCounter = 0
  async function postEvent() {
    // 事件上报需有效匿名凭证（anon-token），每用例独立 IP 避开签发限流
    anonIpCounter += 1
    const tokRes = await app.inject({ method: 'POST', url: '/api/anon-token', remoteAddress: `10.9.0.${anonIpCounter}` })
    const token = tokRes.json().token
    return app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { token, events: [{ name: 'theme_accent_change', ts: Date.now() }] }
    })
  }

  it('TC-SM-01: 默认 hidden（用户拍板：默认不显），画师 summary 不可见', async () => {
    expect(getStatsMode()).toBe('hidden')
    const cfg = await getConfig()
    expect(cfg.statusCode).toBe(200)
    expect(cfg.json().statsMode).toBe('hidden')
    expect(cfg.json().artistStatsVisible).toBe(false)

    const sum = await summaryReq()
    expect(sum.statusCode).toBe(200)
    expect(sum.json().mode).toBe('hidden')
    expect(sum.json().enabled).toBe(false)
    expect(sum.json().total).toBeUndefined()
  })

  it('TC-SM-02: PUT on → 画师 summary 可见且含统计', async () => {
    const res = await putMode('on')
    expect(res.statusCode).toBe(200)
    expect(res.json().statsMode).toBe('on')

    const sum = await summaryReq()
    const b = sum.json()
    expect(b.mode).toBe('on')
    expect(b.enabled).toBe(true)
    expect(typeof b.total).toBe('number')
  })

  it('TC-SM-03: off 时事件静默丢弃（返回 ok 不落库）', async () => {
    await putMode('off')
    const res = await postEvent()
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, received: 0 })
    expect((db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c).toBe(0)
  })

  it('TC-SM-04: on 时事件落库', async () => {
    await putMode('on')
    const res = await postEvent()
    expect(res.json().received).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c).toBe(1)
  })

  it('TC-SM-05: hidden 时事件仍落库但画师 summary 不可见（管理员可看全局）', async () => {
    await putMode('hidden')
    const res = await postEvent()
    expect(res.json().received).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }).c).toBe(1)

    const sum = await summaryReq()
    expect(sum.json().mode).toBe('hidden')
    expect(sum.json().enabled).toBe(false)

    const adminSum = await app.inject({
      method: 'GET',
      url: '/api/admin/tracking/summary',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(adminSum.statusCode).toBe(200)
    expect(adminSum.json().total).toBe(1)
  })

  it('TC-SM-06: 非法 statsMode 被 schema 拒（400）', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { statsMode: 'weird' }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-SM-07: 兼容旧 key——只写 artist_stats_visible=false → 读回 hidden（事件仍收集）', async () => {
    db.prepare("INSERT INTO platform_config (key, value) VALUES ('artist_stats_visible', 'false') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run()
    expect(getStatsMode()).toBe('hidden')
    const sum = await summaryReq()
    expect(sum.json().mode).toBe('hidden')
    // 事件仍落库（hidden 语义）
    const res = await postEvent()
    expect(res.json().received).toBe(1)
  })
})
