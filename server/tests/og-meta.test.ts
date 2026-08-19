import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildOgMeta, injectOgMeta, clearOgCache } from '../src/features/og/og-meta.service.js'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ============================================
// REQ-043 I1: OG 分享卡片测试
// 注入生效 / 恶意 bio 注入消毒 / 不存在 subdomain 不报错 / 缓存命中
// ============================================

const PREV_DOMAIN = process.env.DOMAIN

/** 构造带 OG 锚点区的 index.html（与 web/index.html 结构一致） */
const OG_INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="og-placeholder" />
  <meta property="og:title" content="拾绘 Inkglean — 画师约稿平台" />
  <meta property="og:description" content="开源，自部署，易操作。" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="拾绘 Inkglean" />
  <title>画师约稿平台</title>
</head>
<body><div id="app"></div></body>
</html>`

/** 建临时 dist + 应用实例（每个用例独立，避免 WEB_DIST 串扰） */
async function makeAppWithDist(): Promise<{ dist: string; app: FastifyInstance }> {
  const dist = mkdtempSync(join(tmpdir(), 'commission-og-dist-'))
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), OG_INDEX_HTML)
  writeFileSync(join(dist, 'assets', 'logo.webp'), 'logo')
  process.env.WEB_DIST = dist
  const app = await buildApp({ logger: false })
  await app.ready()
  return { dist, app }
}

describe('REQ-043 I1 OG 分享卡片', () => {
  let app: FastifyInstance
  let dist: string

  beforeEach(async () => {
    cleanDb()
    process.env.DOMAIN = 'inkglean.example'
    clearOgCache()
    const built = await makeAppWithDist()
    app = built.app
    dist = built.dist
  })

  afterEach(async () => {
    await app.close()
    delete process.env.WEB_DIST
    if (PREV_DOMAIN === undefined) delete process.env.DOMAIN
    else process.env.DOMAIN = PREV_DOMAIN
    rmSync(dist, { recursive: true, force: true })
  })

  it('TC-OG-01: 有头像画师——标题/描述/URL/图/ALT 按规格生成', () => {
    const artist = seedArtist({
      name: '墨鱼',
      subdomain: 'moyu'
    })
    db.prepare("UPDATE artists SET bio = ?, avatar = ? WHERE id = ?")
      .run('日系插画师，擅长氛围场景。', 'images/1/avatar.webp', artist.id)

    const og = (buildOgMeta as (subdomain: string, host?: string) => ReturnType<typeof buildOgMeta>)('moyu', 'localhost:3000')
    expect(og.title).toBe('墨鱼｜拾绘')
    expect(og.description).toBe('日系插画师，擅长氛围场景。')
    expect(og.url).toBe('https://inkglean.example/artist/moyu')
    expect(og.image).toBe('https://inkglean.example/uploads/images/1/avatar.webp')
    expect(og.imageAlt).toBe('墨鱼头像')
    expect(artist.id).toBeGreaterThan(0)
  })

  it('TC-OG-02: 无头像画师——logo 公开路径兜底', () => {
    const artist = seedArtist({ name: '无头像', subdomain: 'noavatar' })
    db.prepare('UPDATE artists SET bio = NULL WHERE id = ?').run(artist.id)
    const og = buildOgMeta('noavatar')
    expect(og.image).toBe('https://inkglean.example/assets/logo.webp')
  })

  it('TC-OG-03: 简介超过 100 字——截断并带省略号', () => {
    const artist = seedArtist({ subdomain: 'longbio' })
    db.prepare('UPDATE artists SET bio = ? WHERE id = ?').run('长'.repeat(200), artist.id)
    const og = buildOgMeta('longbio')
    expect([...og.description].length).toBe(100)
    expect(og.description.endsWith('…')).toBe(true)
  })

  it('TC-OG-04: 恶意 bio 注入——注入 HTML 前消毒（无 script/事件属性/原始尖括号）', () => {
    const artist = seedArtist({ name: '<script>alert(1)</script>画师', subdomain: 'evil' })
    db.prepare('UPDATE artists SET bio = ? WHERE id = ?')
      .run('<script>alert("x")</script><img src=x onerror=alert(1)>正常简介', artist.id)
    const og = buildOgMeta('evil')
    const html = injectOgMeta(OG_INDEX_HTML, og)

    // 无原始危险标签/事件属性（消毒 + 实体转义双保险）
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
    // 危险内容被实体转义为文本
    expect(html).toContain('&lt;script&gt;')
    // 占位锚点已被注入块替换，og:type/site_name 保留静态
    expect(html).not.toContain('og-placeholder')
    expect(html).toContain('og:image:alt')
  })

  it('TC-OG-05: 不存在 subdomain——返回默认 OG 不报错', () => {
    const og = buildOgMeta('ghost')
    expect(og.title).toBe('拾绘 Inkglean — 画师约稿平台')
    expect(og.url).toBe('https://inkglean.example/artist/ghost')
    expect(og.image).toContain('/assets/logo.webp')
  })

  it('TC-OG-06: 缓存命中——5 分钟内画师改名不刷新旧值', () => {
    const artist = seedArtist({ name: '原名', subdomain: 'cached' })
    const first = buildOgMeta('cached')
    expect(first.title).toBe('原名｜拾绘')

    // 改 DB 后再次读取：缓存窗口内仍返回旧值（证明走内存缓存）
    db.prepare('UPDATE artists SET name = ? WHERE id = ?').run('新名', artist.id)
    const second = buildOgMeta('cached')
    expect(second.title).toBe('原名｜拾绘')
    expect(second).toEqual(first)
  })

  it('TC-OG-07: 注入只替换锚点区——其余 HTML 原样保留', () => {
    seedArtist({ name: '锚点', subdomain: 'anchor', bio: '介绍' })
    const og = buildOgMeta('anchor')
    const html = injectOgMeta(OG_INDEX_HTML, og)
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<meta property="og:site_name" content="拾绘 Inkglean" />')
    expect(html).toContain('<div id="app"></div>')
    expect(html).not.toContain('og-placeholder')
  })

  it('TC-OG-08: 锚点缺失时注入函数原样返回（fail-open，静态默认兜底）', () => {
    const html = '<html><head><meta property="og:title" content="x" /></head></html>'
    const og = buildOgMeta('anyone')
    expect(injectOgMeta(html, og)).toBe(html)
  })

  // ─── 路由层：仅命中 /artist/:subdomain 的 HTML 请求 ───

  it('TC-OG-09: /artist/:subdomain 且 Accept 含 text/html → 注入 OG', async () => {
    seedArtist({ name: '路由画师', subdomain: 'alice', bio: '简介' })
    const res = await app.inject({
      method: 'GET',
      url: '/artist/alice',
      headers: { Accept: 'text/html,application/xhtml+xml' }
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    const body = res.body
    expect(body).toContain('content="路由画师｜拾绘"')
    expect(body).toContain('https://inkglean.example/artist/alice')
    expect(body).not.toContain('og-placeholder')
  })

  it('TC-OG-10: 非 HTML Accept / XHR / 子路径 → 不注入', async () => {
    seedArtist({ name: '不注入', subdomain: 'plain', bio: '简介' })

    // 非 HTML Accept（curl 默认 */*）
    const curlLike = await app.inject({ method: 'GET', url: '/artist/plain', headers: { Accept: '*/*' } })
    expect(curlLike.body).toContain('og-placeholder')
    expect(curlLike.body).not.toContain('og:image:alt')

    // XHR
    const xhr = await app.inject({
      method: 'GET',
      url: '/artist/plain',
      headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' }
    })
    expect(xhr.body).toContain('og-placeholder')
    expect(xhr.body).not.toContain('og:image:alt')

    // 子路径（/artist/:subdomain/order 等其余路由不动）
    const sub = await app.inject({ method: 'GET', url: '/artist/plain/order', headers: { Accept: 'text/html' } })
    expect(sub.body).toContain('og-placeholder')
    expect(sub.body).not.toContain('og:image:alt')
  })

  it('TC-OG-11: 首页/其他路由保持静态默认 meta（不注入 og:url/image）', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { Accept: 'text/html' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('content="拾绘 Inkglean — 画师约稿平台"')
    expect(res.body).not.toContain('og:image:alt')
    expect(res.body).toContain('og-placeholder')
  })

  it('TC-OG-12: 不存在 subdomain 的 HTML 请求 → 200 默认 OG 不报错', async () => {
    const res = await app.inject({ method: 'GET', url: '/artist/ghost', headers: { Accept: 'text/html' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('content="拾绘 Inkglean — 画师约稿平台"')
    expect(res.body).toContain('https://inkglean.example/artist/ghost')
    expect(res.body).not.toContain('og-placeholder')
  })
})
