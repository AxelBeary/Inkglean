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

  // ─── REQ-033 收尾：统计读接口 ───

  /** 设置管理员：写 platform_config.admin_qq + 创建管理员画师，返回画师行 */
  function setAdmin(qqNumber) {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
    return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
  }

  /** 匿名凭证上报一条事件 */
  async function reportEvent(event) {
    const token = await fetchToken()
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { token, events: [event] }
    })
    expect(res.statusCode).toBe(200)
  }

  it('TC-TR-10: 管理员 summary 聚合全局事件（total/byName/byDay/funnel）', async () => {
    const admin = setAdmin('10001')
    await reportEvent({ name: 'order_form_start', ts: Date.now() })
    await reportEvent({ name: 'order_form_step_view', ts: Date.now() })
    await reportEvent({ name: 'order_form_submit_success', ts: Date.now() })
    await reportEvent({ name: 'theme_accent_change', ts: Date.now(), accent: '3' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/tracking/summary?days=30',
      headers: { Authorization: `Bearer ${createSession(admin.id, admin.token_version)}` }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(4)
    const names = body.byName.map(r => r.name)
    expect(names).toContain('order_form_start')
    expect(names).toContain('theme_accent_change')
    const start = body.byName.find(r => r.name === 'order_form_start')
    expect(start.count).toBe(1)
    expect(Array.isArray(body.byDay)).toBe(true)
    expect(body.byDay.reduce((s, r) => s + r.count, 0)).toBe(4)
    // 漏斗固定 5 项顺序，无数据项补 0
    expect(body.funnel).toHaveLength(5)
    expect(body.funnel[0]).toEqual({ name: 'order_form_start', count: 1 })
    expect(body.funnel.find(r => r.name === 'order_form_submit_success').count).toBe(1)
    expect(body.funnel.find(r => r.name === 'order_submit_success').count).toBe(0)
  })

  it('TC-TR-11: 管理员 summary 未登录 401 / 普通画师 403', async () => {
    setAdmin('10001')

    const anon = await app.inject({ method: 'GET', url: '/api/admin/tracking/summary' })
    expect(anon.statusCode).toBe(401)

    const pleb = seedArtist({ qq_number: '20002', subdomain: 'pleb' })
    const plebToken = createSession(pleb.id, pleb.token_version)
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/tracking/summary',
      headers: { Authorization: `Bearer ${plebToken}` }
    })
    expect(forbidden.statusCode).toBe(403)
    expect(forbidden.json().code).toBe('ADMIN_REQUIRED')
  })

  it('TC-TR-12: 画师 summary 只统计自己的事件（未登录 401）', async () => {
    const alice = seedArtist({ qq_number: '12345', subdomain: 'alice' })
    const aliceToken = createSession(alice.id, alice.token_version)
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { Authorization: `Bearer ${aliceToken}` },
      payload: { events: [{ name: 'dashboard_view', ts: Date.now(), page: '/dashboard' }] }
    })
    expect(r1.statusCode).toBe(200)

    // 未登录访问 → 401
    const anon = await app.inject({ method: 'GET', url: '/api/artist/tracking/summary' })
    expect(anon.statusCode).toBe(401)

    // alice 自己看 → total=1
    const mine = await app.inject({
      method: 'GET',
      url: '/api/artist/tracking/summary?days=30',
      headers: { Authorization: `Bearer ${aliceToken}` }
    })
    expect(mine.statusCode).toBe(200)
    expect(mine.json().total).toBe(1)
    expect(mine.json().byName).toEqual([{ name: 'dashboard_view', count: 1 }])

    // 另一个画师看 → 看不到 alice 的事件
    const bob = seedArtist({ qq_number: '30003', subdomain: 'bob' })
    const bobToken = createSession(bob.id, bob.token_version)
    const other = await app.inject({
      method: 'GET',
      url: '/api/artist/tracking/summary?days=30',
      headers: { Authorization: `Bearer ${bobToken}` }
    })
    expect(other.statusCode).toBe(200)
    expect(other.json().total).toBe(0)
  })

  it('TC-TR-13: 开关 config 默认 true，PUT false 后读取 false，PUT true 恢复', async () => {
    const admin = setAdmin('10001')
    const adminToken = createSession(admin.id, admin.token_version)
    const auth = { Authorization: `Bearer ${adminToken}` }

    // 默认 true（未写入过）
    const initial = await app.inject({ method: 'GET', url: '/api/admin/tracking-config', headers: auth })
    expect(initial.statusCode).toBe(200)
    expect(initial.json()).toEqual({ artistStatsVisible: true })

    // PUT false → GET false
    const off = await app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: auth,
      payload: { artistStatsVisible: false }
    })
    expect(off.statusCode).toBe(200)
    expect(off.json()).toEqual({ artistStatsVisible: false })
    const afterOff = await app.inject({ method: 'GET', url: '/api/admin/tracking-config', headers: auth })
    expect(afterOff.json()).toEqual({ artistStatsVisible: false })

    // 画师侧 enabled 同步为 false
    const artist = seedArtist({ qq_number: '40004', subdomain: 'carl' })
    const artistToken = createSession(artist.id, artist.token_version)
    const artistView = await app.inject({
      method: 'GET',
      url: '/api/artist/tracking/summary',
      headers: { Authorization: `Bearer ${artistToken}` }
    })
    expect(artistView.json().enabled).toBe(false)

    // PUT true 恢复
    const on = await app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: auth,
      payload: { artistStatsVisible: true }
    })
    expect(on.json()).toEqual({ artistStatsVisible: true })
    const afterOn = await app.inject({ method: 'GET', url: '/api/admin/tracking-config', headers: auth })
    expect(afterOn.json()).toEqual({ artistStatsVisible: true })
  })

  it('TC-TR-14: 开关 PUT 缺字段 / 非布尔被 schema 拒绝 400', async () => {
    const admin = setAdmin('10001')
    const auth = { Authorization: `Bearer ${createSession(admin.id, admin.token_version)}` }

    const noField = await app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: auth,
      payload: {}
    })
    expect(noField.statusCode).toBe(400)

    const wrongType = await app.inject({
      method: 'PUT',
      url: '/api/admin/tracking-config',
      headers: auth,
      payload: { artistStatsVisible: 'yes' }
    })
    expect(wrongType.statusCode).toBe(400)
  })
})
