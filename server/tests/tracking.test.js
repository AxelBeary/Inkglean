import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// REQ-033 业务埋点后端测试（Tracking）
// POST /api/anon-token + POST /api/events
// ============================================

describe('REQ-033 业务埋点后端 (Tracking)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  async function fetchToken() {
    const res = await app.inject({ method: 'POST', url: '/api/anon-token' })
    expect(res.statusCode).toBe(200)
    return res.json().token
  }

  it('TC-TR-01: anon-token 签发 64 位 hex 凭证并落库', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/anon-token' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.token).toBe('string')
    expect(body.token).toMatch(/^[0-9a-f]{64}$/)
    const row = db.prepare('SELECT token FROM anon_tokens WHERE token = ?').get(body.token)
    expect(row).toBeTruthy()
  })

  it('TC-TR-02: events 携带有效凭证落库并返回 received', async () => {
    const token = await fetchToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        token,
        events: [
          { name: 'theme_accent_change', ts: Date.now(), version: 'natural-v2', accent: '3' },
          { name: 'order_form_start', ts: Date.now(), version: 'natural-v2', page: '/p/alice' }
        ]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, received: 2 })

    const rows = db.prepare('SELECT * FROM events ORDER BY id').all()
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('theme_accent_change')
    expect(rows[0].payload_json).toContain('"accent":"3"')
    expect(rows[0].anon_id).toBeTruthy()
    expect(rows[0].artist_id).toBeNull()
  })

  it('TC-TR-03: 白名单外事件名返回 400 且不落库', async () => {
    const token = await fetchToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { token, events: [{ name: 'hacker_event', ts: Date.now() }] }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_EVENT_NAME')
    expect(db.prepare('SELECT COUNT(*) AS c FROM events').get().c).toBe(0)
  })

  it('TC-TR-04: REQ-033 补充清单事件名可用（artist_page_enter/order_form_step_back）', async () => {
    const token = await fetchToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        token,
        events: [
          { name: 'artist_page_enter', ts: Date.now(), page: '/orders' },
          { name: 'order_form_step_back', ts: Date.now(), from_step: 2, to_step: 1 }
        ]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().received).toBe(2)
  })

  it('TC-TR-05: 无凭证返回 400 INVALID_ANON_TOKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { events: [{ name: 'theme_accent_change', ts: Date.now() }] }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_ANON_TOKEN')
    expect(db.prepare('SELECT COUNT(*) AS c FROM events').get().c).toBe(0)
  })

  it('TC-TR-06: 无效凭证返回 400 INVALID_ANON_TOKEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { token: 'deadbeef', events: [{ name: 'theme_accent_change', ts: Date.now() }] }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_ANON_TOKEN')
  })

  it('TC-TR-07: 单请求超 50 条被 JSON Schema 拒绝 400', async () => {
    const token = await fetchToken()
    const events = Array.from({ length: 51 }, (_, i) => ({ name: 'order_form_start', ts: Date.now() + i }))
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { token, events }
    })
    expect(res.statusCode).toBe(400)
    expect(db.prepare('SELECT COUNT(*) AS c FROM events').get().c).toBe(0)
  })

  it('TC-TR-08: 画师已登录可带 artist_id 上报（无需匿名凭证）', async () => {
    const artist = seedArtist({ qq_number: '12345', subdomain: 'alice' })
    const sessionToken = createSession(artist.id, artist.token_version)
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { Authorization: `Bearer ${sessionToken}` },
      payload: { events: [{ name: 'dashboard_view', ts: Date.now(), page: '/dashboard' }] }
    })
    expect(res.statusCode).toBe(200)
    const row = db.prepare('SELECT * FROM events').get()
    expect(row.artist_id).toBe(artist.id)
    expect(row.anon_id).toBeNull()
  })

  it('TC-TR-09: 限流——同凭证每分钟第 101 个请求被 429 且不落库', async () => {
    const token = await fetchToken()
    // rateLimit 为请求级限流：每分钟最多 100 次 POST /api/events（施工图 §2.2）
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: { token, events: [{ name: 'order_form_start', ts: Date.now() + i }] }
      })
      expect(res.statusCode).toBe(200)
    }
    // 第 101 个请求 → 429，不落库
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { token, events: [{ name: 'order_form_start', ts: Date.now() }] }
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().code).toBe('RATE_LIMITED')
    expect(db.prepare('SELECT COUNT(*) AS c FROM events').get().c).toBe(100)
  })
})