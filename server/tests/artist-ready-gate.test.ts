import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createArtist, getReadyArtistIds, isArtistReady } from '../src/features/artist/artist.service.js'

// ============================================
// 方案 A（2026-08-21 用户拍板）：首页目录开业就绪门槛
// 就绪口径 = 至少 1 张作品 + 至少 1 个启用画风且其下至少 1 个尺寸；
// 未达标小店不上首页目录，直接访问 /artist/:subdomain 不受影响；
// 管理员建号默认 hidden（与邀请注册/初始化向导同口径）
// ============================================

/** 造「启用画风 + 尺寸」（就绪的最小价格数据） */
function seedStyleWithSize(artistId: number, opts: { name?: string; active?: boolean } = {}) {
  const r = db.prepare('INSERT INTO art_styles (artist_id, name, is_active) VALUES (?, ?, ?)')
    .run(artistId, opts.name ?? '日系', opts.active === false ? 0 : 1)
  db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)')
    .run(Number(r.lastInsertRowid), '头像', 50)
}

function seedArtwork(artistId: number) {
  db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/1/a.webp', '作品')")
    .run(artistId)
}

describe('方案 A 开业就绪判定（服务层）', () => {
  beforeEach(() => cleanDb())

  it('TC-RG-01: 作品+启用画风尺寸齐全 → 就绪', () => {
    const artist = seedArtist()
    seedArtwork(artist.id)
    seedStyleWithSize(artist.id)
    expect(isArtistReady(artist.id)).toBe(true)
    expect(getReadyArtistIds().has(artist.id)).toBe(true)
  })

  it('TC-RG-02: 只有作品无价格 → 未就绪', () => {
    const artist = seedArtist()
    seedArtwork(artist.id)
    expect(isArtistReady(artist.id)).toBe(false)
  })

  it('TC-RG-03: 只有价格无作品 → 未就绪', () => {
    const artist = seedArtist()
    seedStyleWithSize(artist.id)
    expect(isArtistReady(artist.id)).toBe(false)
  })

  it('TC-RG-04: 画风被停用（is_active=0）时即使挂了尺寸 → 未就绪', () => {
    const artist = seedArtist()
    seedArtwork(artist.id)
    seedStyleWithSize(artist.id, { active: false })
    expect(isArtistReady(artist.id)).toBe(false)
  })

  it('TC-RG-05: 画风无尺寸（仅定价骨架）→ 未就绪', () => {
    const artist = seedArtist()
    seedArtwork(artist.id)
    db.prepare('INSERT INTO art_styles (artist_id, name) VALUES (?, ?)').run(artist.id, '草稿')
    expect(isArtistReady(artist.id)).toBe(false)
  })

  it('TC-RG-06: getReadyArtistIds 批量口径与单画师口径一致（多画师混合）', () => {
    const ready = seedArtist({ qq_number: '88911', subdomain: 'rg-ready' })
    const noPrice = seedArtist({ qq_number: '88912', subdomain: 'rg-noprice' })
    const noArt = seedArtist({ qq_number: '88913', subdomain: 'rg-noart' })
    seedArtwork(ready.id)
    seedStyleWithSize(ready.id)
    seedArtwork(noPrice.id)
    seedStyleWithSize(noArt.id)

    const ids = getReadyArtistIds()
    expect(ids.has(ready.id)).toBe(true)
    expect(ids.has(noPrice.id)).toBe(false)
    expect(ids.has(noArt.id)).toBe(false)
  })

  it('TC-RG-07: 管理员建号（createArtist）默认 hidden——空店不对外可见', async () => {
    const artist = await createArtist({ qqNumber: '88901', name: '新画师', subdomain: 'rgnew' })
    expect(artist?.status).toBe('hidden')
  })
})

describe('方案 A 首页目录门槛（路由层）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('TC-RG-08: GET /api/artists 只列就绪且可见画师；未就绪 open 画师被目录排除', async () => {
    const ready = seedArtist({ qq_number: '88921', subdomain: 'rg-open-ready', status: 'open' })
    // 空店画师：只建号不备数据，验证其被目录排除（不需引用返回值）
    seedArtist({ qq_number: '88922', subdomain: 'rg-open-empty', status: 'open' })
    seedArtwork(ready.id)
    seedStyleWithSize(ready.id)

    const res = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(res.statusCode).toBe(200)
    const subs = res.json().map((a: { subdomain: string }) => a.subdomain)
    expect(subs).toContain('rg-open-ready')
    expect(subs).not.toContain('rg-open-empty')
  })

  it('TC-RG-09: 就绪但 hidden 的画师仍不上目录（门槛与展示开关并存）', async () => {
    const artist = seedArtist({ qq_number: '88923', subdomain: 'rg-hidden-ready', status: 'hidden' })
    seedArtwork(artist.id)
    seedStyleWithSize(artist.id)

    const res = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(res.json().some((a: { subdomain: string }) => a.subdomain === 'rg-hidden-ready')).toBe(false)
  })

  it('TC-RG-10: 未就绪画师直接访问主页不受门槛影响（门槛只管目录）', async () => {
    const artist = seedArtist({ qq_number: '88924', subdomain: 'rg-direct', status: 'open' })

    const profile = await app.inject({ method: 'GET', url: '/api/artists/rg-direct' })
    expect(profile.statusCode).toBe(200)
    expect(profile.json().subdomain).toBe('rg-direct')

    const dir = await app.inject({ method: 'GET', url: '/api/artists' })
    expect(dir.json().some((a: { subdomain: string }) => a.subdomain === 'rg-direct')).toBe(false)
    expect(artist.subdomain).toBe('rg-direct')
  })
})
