import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { setHomeTakedown } from '../src/features/artist/artist-account.service.js'
import {
  isArtistHomeHidden,
  isArtistHomeInvisible,
  isArtworkVisible
} from '../src/features/artist/artist-visibility.service.js'
import { getFeedArtist } from '../src/features/artist/calendar-feed.service.js'
import { buildOgMeta, clearOgCache } from '../src/features/og/og-meta.service.js'

// ============================================
// v76 内容级下架：可见性判定接入 + 画师自助口不可解 + 日历订阅补漏
//   helper 真值表 / 公开端守卫 / 防「下架形同虚设」回归 / feed 修复
// ============================================

const OG_DEFAULT_TITLE = '拾绘 Inkglean — 画师约稿平台'

// ── ① helper 真值表（纯函数，不碰库/路由） ──
describe('v76 可见性 helper 真值表', () => {
  it('正常 open 画师：非 Hidden、非 Invisible', () => {
    expect(isArtistHomeHidden({ status: 'open' })).toBe(false)
    expect(isArtistHomeInvisible({ status: 'open' })).toBe(false)
  })

  it('自助隐身 hidden：Hidden=true 且 Invisible=true', () => {
    expect(isArtistHomeHidden({ status: 'hidden' })).toBe(true)
    expect(isArtistHomeInvisible({ status: 'hidden' })).toBe(true)
  })

  it('平台下架（status=open + home_takedown_at 非空）：Hidden=true 且 Invisible=true', () => {
    expect(isArtistHomeHidden({ status: 'open', home_takedown_at: '2026-09-13T00:00:00.000Z' })).toBe(true)
    expect(isArtistHomeInvisible({ status: 'open', home_takedown_at: '2026-09-13T00:00:00.000Z' })).toBe(true)
  })

  it('隐身 ∪ 下架叠加：仍 Hidden=true / Invisible=true', () => {
    const a = { status: 'hidden' as const, home_takedown_at: '2026-09-13T00:00:00.000Z' }
    expect(isArtistHomeHidden(a)).toBe(true)
    expect(isArtistHomeInvisible(a)).toBe(true)
  })

  it('封禁 is_banned：Hidden=false（下架不判封禁）但 Invisible=true（对外一律隐身）', () => {
    expect(isArtistHomeHidden({ status: 'open', is_banned: 1 })).toBe(false)
    expect(isArtistHomeInvisible({ status: 'open', is_banned: 1 })).toBe(true)
  })

  it('软删 deleted_at：Hidden=false 但 Invisible=true', () => {
    expect(isArtistHomeHidden({ status: 'open', deleted_at: '2026-09-13T00:00:00.000Z' })).toBe(false)
    expect(isArtistHomeInvisible({ status: 'open', deleted_at: '2026-09-13T00:00:00.000Z' })).toBe(true)
  })

  it('undefined：一律 Hidden=true / Invisible=true（缺行即不可见）', () => {
    expect(isArtistHomeHidden(undefined)).toBe(true)
    expect(isArtistHomeInvisible(undefined)).toBe(true)
  })

  it('isArtworkVisible：takedown_at 空=可见，非空=不可见，缺行=不可见', () => {
    expect(isArtworkVisible({ takedown_at: null })).toBe(true)
    expect(isArtworkVisible({ takedown_at: '2026-09-13T00:00:00.000Z' })).toBe(false)
    expect(isArtworkVisible(undefined)).toBe(false)
  })
})

// ── 路由守卫组 ──
describe('v76 平台下架画师：公开端一律不可见 + 画师自助口不可解', () => {
  let app: FastifyInstance | undefined

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  /** 补齐开业就绪要素（作品 + 启用画风带尺寸），让画师本应出现在目录——用于证明下架真的挡住了 */
  function makeReady(artistId: number): void {
    db.prepare("INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/v76/a.webp', '作品')").run(artistId)
    const styleRow = db.prepare('INSERT INTO art_styles (artist_id, name, is_active) VALUES (?, ?, 1)').run(artistId, '日系')
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)').run(Number(styleRow.lastInsertRowid), '头像', 10000)
  }

  it('TC-V76-CORE: 画师用 PUT /api/artist/profile 改 status=open，home_takedown_at 仍非空、公开主页仍走最小载荷不复活', async () => {
    const artist = seedArtist({ subdomain: 'td-core', status: 'open' })
    makeReady(artist.id)
    setHomeTakedown(artist.id, '涉嫌违规内容')

    // 画师登录尝试「自救」：把 status 写成 open
    const token = createSession(artist.id, artist.token_version)
    const put = await app!.inject({
      method: 'PUT', url: '/api/artist/profile',
      headers: { Authorization: `Bearer ${token}` },
      payload: { status: 'open' }
    })
    expect(put.statusCode).toBe(200)

    // 病根验证：自助口改不动下架态（home_takedown_at 不在白名单，仍非空）
    const row = db.prepare('SELECT status, home_takedown_at FROM artists WHERE id = ?')
      .get(artist.id) as { status: string; home_takedown_at: string | null }
    expect(row.status).toBe('open')
    expect(row.home_takedown_at).not.toBeNull()

    // 公开主页仍走最小载荷（不复活 bio/作品/价格），且不区分隐身/下架、不回传 reason
    const home = await app!.inject({ method: 'GET', url: '/api/artists/td-core' })
    expect(home.statusCode).toBe(200)
    const body = home.json()
    expect(body.status).toBe('hidden')
    expect(body.id).toBe(artist.id)
    expect(body.subdomain).toBe('td-core')
    expect(body.bio).toBeUndefined()
    expect(body.artworks).toBeUndefined()
    expect(body.home_takedown_reason).toBeUndefined()
    expect(body.reason).toBeUndefined()
  })

  it('TC-V76-DIR: 下架画师不出现在目录 /api/artists', async () => {
    const td = seedArtist({ qq_number: 'td-1', subdomain: 'td-dir', status: 'open' })
    makeReady(td.id)
    const ok = seedArtist({ qq_number: 'ok-1', subdomain: 'ok-dir', status: 'open' })
    makeReady(ok.id)
    setHomeTakedown(td.id, '违规')

    const res = await app!.inject({ method: 'GET', url: '/api/artists' })
    expect(res.statusCode).toBe(200)
    const subs = (res.json() as Array<{ subdomain: string }>).map(a => a.subdomain)
    expect(subs).not.toContain('td-dir')
    expect(subs).toContain('ok-dir')
  })

  it('TC-V76-GUARDS: 下架画师 workflow/价格/画风/画廊/公开作品/点赞 全部 404', async () => {
    const artist = seedArtist({ subdomain: 'td-guard', status: 'open' })
    makeReady(artist.id)
    const artworkId = Number(db.prepare(
      "INSERT INTO artworks (artist_id, image_path, title) VALUES (?, 'images/v76/g.webp', '作品')"
    ).run(artist.id).lastInsertRowid)
    setHomeTakedown(artist.id, '违规')

    const workflow = await app!.inject({ method: 'GET', url: '/api/artists/td-guard/workflow' })
    expect(workflow.statusCode).toBe(404)

    const pricing = await app!.inject({ method: 'GET', url: '/api/public/pricing/td-guard' })
    expect(pricing.statusCode).toBe(404)

    const styles = await app!.inject({ method: 'GET', url: '/api/public/styles/td-guard' })
    expect(styles.statusCode).toBe(404)

    const gallery = await app!.inject({ method: 'GET', url: '/api/public/gallery/td-guard' })
    expect(gallery.statusCode).toBe(404)

    const publicArt = await app!.inject({ method: 'GET', url: `/api/public/artworks/${artist.id}` })
    expect(publicArt.statusCode).toBe(404)

    // 作品本身未被下架，但画师主页已下架 → 点赞守卫（isArtistVisibleById→Invisible）拦截
    const like = await app!.inject({ method: 'POST', url: `/api/public/artworks/${artworkId}/like` })
    expect(like.statusCode).toBe(404)
  })

  it('TC-V76-OG: 下架画师 OG 回退平台默认（不注入个人标题）', () => {
    const artist = seedArtist({ subdomain: 'td-og', name: '下架画师小王', status: 'open' })
    clearOgCache()
    // 未下架前：注入个人标题
    expect(buildOgMeta('td-og').title).toBe('下架画师小王｜拾绘')

    setHomeTakedown(artist.id, '违规')
    clearOgCache()
    // 下架后：回退默认
    expect(buildOgMeta('td-og').title).toBe(OG_DEFAULT_TITLE)
  })
})

// ── ④ 日历订阅修复例（顺带修既存漏判：hidden 画师此前未挡） ──
describe('v76 日历订阅：hidden 与下架画师 feed 均不出数据（修既存漏判）', () => {
  beforeEach(() => cleanDb())

  function enableFeed(artistId: number): void {
    db.prepare("UPDATE artists SET calendar_feed_enabled = 1, calendar_feed_token = 'feedtok123' WHERE id = ?")
      .run(artistId)
  }

  it('TC-V76-FEED-NORMAL: 正常 open 画师可订阅', () => {
    const artist = seedArtist({ subdomain: 'feed-ok', status: 'open' })
    enableFeed(artist.id)
    expect(getFeedArtist('feed-ok')?.subdomain).toBe('feed-ok')
  })

  it('TC-V76-FEED-HIDDEN: hidden 画师订阅被挡（此前 SQL 只过 is_banned 的既存 bug）', () => {
    const artist = seedArtist({ subdomain: 'feed-hidden', status: 'open' })
    enableFeed(artist.id)
    db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artist.id)
    expect(getFeedArtist('feed-hidden')).toBeUndefined()
  })

  it('TC-V76-FEED-TAKEDOWN: 平台下架画师订阅被挡', () => {
    const artist = seedArtist({ subdomain: 'feed-td', status: 'open' })
    enableFeed(artist.id)
    setHomeTakedown(artist.id, '违规')
    expect(getFeedArtist('feed-td')).toBeUndefined()
  })
})
