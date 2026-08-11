import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as dashboard from '../src/features/artist/dashboard.service.js'

// ============================================
// REQ-043 I2: 开张任务卡测试
// 动态任务判定 / 自然达成写 onboarded_at / dismiss 后端标记 / 接口鉴权与 schema
// ============================================

describe('REQ-043 I2 开张任务卡（服务层）', () => {
  beforeEach(() => cleanDb())

  it('TC-ONB-01: 新画师——三项任务未完成，share 恒 false（建议项）', () => {
    const artist = seedArtist()
    const state = dashboard.getOnboarding(artist.id)
    expect(state.dismissed).toBe(false)
    expect(state.tasks).toEqual([
      { key: 'artwork', done: false },
      { key: 'tier', done: false },
      { key: 'share', done: false }
    ])
  })

  it('TC-ONB-02: 传作品 → artwork done', () => {
    const artist = seedArtist()
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/1/a.webp', '作品')")
      .run(artist.id)
    const state = dashboard.getOnboarding(artist.id)
    expect(state.tasks.find(t => t.key === 'artwork')?.done).toBe(true)
    expect(state.tasks.find(t => t.key === 'tier')?.done).toBe(false)
  })

  it('TC-ONB-03: 设画风 → tier done（有画风即有定价骨架）', () => {
    const artist = seedArtist()
    db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artist.id, '日系')
    const state = dashboard.getOnboarding(artist.id)
    expect(state.tasks.find(t => t.key === 'tier')?.done).toBe(true)
  })

  it('TC-ONB-04: 必做项全完成 → 自然达成写 onboarded_at（share 为建议项不阻塞）', () => {
    const artist = seedArtist()
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/1/a.webp', '作品')")
      .run(artist.id)
    db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artist.id, '厚涂')

    dashboard.getOnboarding(artist.id)
    const row = db.prepare('SELECT onboarded_at FROM artists WHERE id = ?').get(artist.id)
    expect(row.onboarded_at).not.toBeNull()
  })

  it('TC-ONB-05: dismiss → 后端标记；重复 dismiss 不覆盖原时间戳', () => {
    const artist = seedArtist()
    const first = dashboard.dismissOnboarding(artist.id)
    expect(first).toEqual({ dismissed: true })
    const ts = db.prepare('SELECT onboarding_dismissed_at FROM artists WHERE id = ?').get(artist.id).onboarding_dismissed_at
    expect(ts).not.toBeNull()

    dashboard.dismissOnboarding(artist.id)
    const again = db.prepare('SELECT onboarding_dismissed_at FROM artists WHERE id = ?').get(artist.id).onboarding_dismissed_at
    expect(again).toBe(ts)
  })

  it('TC-ONB-06: 已 dismiss 的画师即使任务完成也不再写 onboarded_at', () => {
    const artist = seedArtist()
    dashboard.dismissOnboarding(artist.id)
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/1/a.webp', '作品')")
      .run(artist.id)
    db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artist.id, '像素')

    const state = dashboard.getOnboarding(artist.id)
    expect(state.dismissed).toBe(true)
    const row = db.prepare('SELECT onboarded_at FROM artists WHERE id = ?').get(artist.id)
    expect(row.onboarded_at).toBeNull()
  })
})

describe('REQ-043 I2 开张任务卡（路由层）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  function token(artist) {
    return createSession(artist.id, artist.token_version)
  }

  it('TC-ONB-07: GET 需登录（未登录 401），登录后返回契约形状', async () => {
    const artist = seedArtist()
    const anon = await app.inject({ method: 'GET', url: '/api/artist/onboarding' })
    expect(anon.statusCode).toBe(401)

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/onboarding',
      headers: { Authorization: `Bearer ${token(artist)}` }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      dismissed: false,
      tasks: [
        { key: 'artwork', done: false },
        { key: 'tier', done: false },
        { key: 'share', done: false }
      ]
    })
  })

  it('TC-ONB-08: POST dismiss 写标记；带附加字段被 schema 拒绝（400）', async () => {
    const artist = seedArtist()
    const headers = { Authorization: `Bearer ${token(artist)}` }

    const ok = await app.inject({ method: 'POST', url: '/api/artist/onboarding/dismiss', headers, payload: {} })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ dismissed: true })
    const row = db.prepare('SELECT onboarding_dismissed_at FROM artists WHERE id = ?').get(artist.id)
    expect(row.onboarding_dismissed_at).not.toBeNull()

    const bad = await app.inject({
      method: 'POST',
      url: '/api/artist/onboarding/dismiss',
      headers,
      payload: { extra: 1 }
    })
    expect(bad.statusCode).toBe(400)
  })

  it('TC-ONB-09: 路由层自然达成——任务完成后 GET 即落库 onboarded_at', async () => {
    const artist = seedArtist()
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/1/a.webp', '作品')")
      .run(artist.id)
    db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artist.id, '水彩')

    const res = await app.inject({
      method: 'GET',
      url: '/api/artist/onboarding',
      headers: { Authorization: `Bearer ${token(artist)}` }
    })
    expect(res.statusCode).toBe(200)
    const row = db.prepare('SELECT onboarded_at FROM artists WHERE id = ?').get(artist.id)
    expect(row.onboarded_at).not.toBeNull()
  })
})
