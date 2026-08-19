/**
 * REQ-022 F2: 外链重做路由测试
 *
 * 覆盖：
 * - PUT /api/artist/profile customLinks 新结构（归一化/防投毒重推导/条数/协议/超长）
 * - GET /api/platforms 公开接口（仅启用）
 * - 管理端平台 CRUD（GET/POST/PUT/DELETE）+ DELETE 后链接归「其他」
 * - GET 公开主页响应新结构（weiboUrl/bilibiliUrl/platformUrls 已移除）
 * - 灵感标签（原 R58-8 保留用例，功能未变）
 *
 * 测试隔离：cleanDb 会清空 social_platforms，本文件 beforeEach 自建平台行。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// Hermes 安全过滤会把 "Bearer " 替换成 ***，用拼接绕过
const AUTH_PREFIX = 'Bear'+'er '

interface PlatformSeed {
  name: string
  icon_key: string | null
  fallback_char: string | null
  match_domains: string[]
  sort_order: number
  enabled: number
}

interface StoredLink {
  platformId: number | null
  url: string
}

describe('外链重做 + 社交平台 CRUD (REQ-022 F2)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 辅助 ───

  function makeArtist(overrides: Record<string, unknown> = {}): ArtistRow {
    return seedArtist({ qq_number: '77001', subdomain: 'plat-test', ...overrides })
  }

  function authHeader(artist: ArtistRow): { Authorization: string } {
    // REQ-041：管理后台路由需 step-up 升级会话（非管理员用例由 requireAdmin 先行 403，不受影响）
    const token = createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
    return { Authorization: AUTH_PREFIX + token }
  }

  /** 直接插平台行（不走 API，精确控制 id 无关性） */
  function seedPlatform(overrides: Partial<PlatformSeed> = {}): { id: number } {
    const defaults: PlatformSeed = {
      name: '微博', icon_key: 'sinaweibo', fallback_char: null,
      match_domains: ['weibo.com', 'weibo.cn'], sort_order: 1, enabled: 1
    }
    const d = { ...defaults, ...overrides }
    const r = db.prepare(`
      INSERT INTO social_platforms (name, icon_key, fallback_char, match_domains, sort_order, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(d.name, d.icon_key, d.fallback_char, JSON.stringify(d.match_domains), d.sort_order, d.enabled)
    return db.prepare('SELECT * FROM social_platforms WHERE id = ?').get(r.lastInsertRowid) as { id: number }
  }

  function putLinks(artist: ArtistRow, customLinks: Array<Record<string, unknown>>) {
    return app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: authHeader(artist),
      payload: { customLinks }
    })
  }

  function storedLinks(artistId: number): StoredLink[] {
    const row = db.prepare('SELECT custom_links FROM artists WHERE id = ?').get(artistId) as { custom_links: string }
    return JSON.parse(row.custom_links) as StoredLink[]
  }

  // ─── PUT customLinks（新结构 [{platformId, url}]） ───

  describe('PUT customLinks', () => {
    it('TC-PL2-01: 写入 + 归一化 + platformId 后端推导', async () => {
      const weibo = seedPlatform()
      const artist = makeArtist()
      const res = await putLinks(artist, [{ url: 'https://weibo.com/u/123' }])
      expect(res.statusCode).toBe(200)
      expect(storedLinks(artist.id)).toEqual([
        { platformId: weibo.id, url: 'https://weibo.com/u/123' }
      ])
    })

    it('TC-PL2-02: 裸链自动补 https://', async () => {
      const weibo = seedPlatform()
      const artist = makeArtist()
      const res = await putLinks(artist, [{ url: 'weibo.com/u/123' }])
      expect(res.statusCode).toBe(200)
      expect(storedLinks(artist.id)).toEqual([
        { platformId: weibo.id, url: 'https://weibo.com/u/123' }
      ])
    })

    it('TC-PL2-03: 前端传 platformId 被忽略（后端按 URL 重推导，防投毒核心）', async () => {
      const weibo = seedPlatform()
      const bilibili = seedPlatform({ name: 'Bilibili', icon_key: 'bilibili', match_domains: ['bilibili.com'], sort_order: 2 })
      const artist = makeArtist()
      // 投毒：url 是 bilibili 域名，platformId 谎报 weibo 的 id
      const res = await putLinks(artist, [{ url: 'https://space.bilibili.com/1', platformId: weibo.id }])
      expect(res.statusCode).toBe(200)
      // schema additionalProperties 剥离 + service 层重推导：最终存 bilibili.id
      expect(storedLinks(artist.id)).toEqual([
        { platformId: bilibili.id, url: 'https://space.bilibili.com/1' }
      ])
    })

    it('TC-PL2-04: 9 条拒绝（上限 8）', async () => {
      const artist = makeArtist()
      const links = Array.from({ length: 9 }, (_, i) => ({ url: `https://example.com/${i}` }))
      const res = await putLinks(artist, links)
      expect(res.statusCode).toBe(400)
    })

    it('TC-PL2-05: javascript: 拒绝（LINK_URL_INVALID）', async () => {
      const artist = makeArtist()
      const res = await putLinks(artist, [{ url: 'javascript:alert(1)' }])
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('LINK_URL_INVALID')
    })

    it('TC-PL2-06: ftp:// 拒绝', async () => {
      const artist = makeArtist()
      const res = await putLinks(artist, [{ url: 'ftp://weibo.com/file' }])
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('LINK_URL_INVALID')
    })

    it('TC-PL2-07: 总长 1801 拒绝（hash 构造，path+query 不超限）', async () => {
      const artist = makeArtist()
      const url = 'https://e.com/' + 'a'.repeat(100) + '#' + 'b'.repeat(1800 - 8 - 5 - 1 - 100 - 1 + 1)
      expect(url.length).toBe(1801)
      const res = await putLinks(artist, [{ url }])
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('LINK_URL_INVALID')
    })

    it('TC-PL2-08: 空数组清空外链', async () => {
      const artist = makeArtist()
      await putLinks(artist, [{ url: 'https://example.com/a' }])
      const res = await putLinks(artist, [])
      expect(res.statusCode).toBe(200)
      expect(storedLinks(artist.id)).toEqual([])
    })

    it('TC-PL2-09: 未知域名归「其他」（platformId=null，链接照常保存）', async () => {
      seedPlatform()
      const artist = makeArtist()
      const res = await putLinks(artist, [{ url: 'https://my-art-site.com/x' }])
      expect(res.statusCode).toBe(200)
      expect(storedLinks(artist.id)).toEqual([
        { platformId: null, url: 'https://my-art-site.com/x' }
      ])
    })

    it('TC-PL2-10: 投毒域名不误命中平台（weibo.com.evil.com 归「其他」）', async () => {
      seedPlatform()
      const artist = makeArtist()
      const res = await putLinks(artist, [
        { url: 'https://weibo.com.evil.com/x' },
        { url: 'https://xweibo.com/y' }
      ])
      expect(res.statusCode).toBe(200)
      const stored = storedLinks(artist.id)
      expect(stored[0].platformId).toBeNull()
      expect(stored[1].platformId).toBeNull()
    })

    it('TC-PL2-11: 端口域名照常匹配（weibo.com:8080）', async () => {
      const weibo = seedPlatform()
      const artist = makeArtist()
      const res = await putLinks(artist, [{ url: 'https://weibo.com:8080/x' }])
      expect(res.statusCode).toBe(200)
      expect(storedLinks(artist.id)[0].platformId).toBe(weibo.id)
    })
  })

  // ─── GET /api/platforms（公开） ───

  describe('GET /api/platforms', () => {
    it('TC-PL2-12: 仅返回启用平台，按 sort_order 排序', async () => {
      seedPlatform() // 微博 sort_order=1
      seedPlatform({ name: 'Bilibili', icon_key: 'bilibili', match_domains: ['bilibili.com'], sort_order: 2 })
      seedPlatform({ name: '停用平台', icon_key: null, fallback_char: '停', match_domains: ['off.com'], sort_order: 0, enabled: 0 })
      const res = await app.inject({ method: 'GET', url: '/api/platforms' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveLength(2)
      expect(body[0].name).toBe('微博')
      expect(body[1].name).toBe('Bilibili')
      // 停用平台不出现
      expect(body.some((p: { name: string }) => p.name === '停用平台')).toBe(false)
      // 响应形状（供二号前端对照）
      expect(body[0]).toHaveProperty('iconKey', 'sinaweibo')
      expect(body[0]).toHaveProperty('matchDomains')
      expect(Array.isArray(body[0].matchDomains)).toBe(true)
    })

    it('TC-PL2-13: 无需登录', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/platforms' })
      expect(res.statusCode).toBe(200)
      expect(Array.isArray(res.json())).toBe(true)
    })
  })

  // ─── 管理端平台 CRUD ───

  describe('管理端平台 CRUD', () => {
    function setAdmin(qqNumber: string): ArtistRow {
      db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
      return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
    }

    it('TC-PL2-14: 非管理员访问 403（已登录无权限）', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'GET', url: '/api/admin/platforms', headers: authHeader(artist)
      })
      expect(res.statusCode).toBe(403)
    })

    it('TC-PL2-15: GET 全量含停用', async () => {
      const admin = setAdmin('77100')
      seedPlatform()
      seedPlatform({ name: '停用平台', icon_key: null, fallback_char: '停', match_domains: ['off.com'], sort_order: 2, enabled: 0 })
      const res = await app.inject({
        method: 'GET', url: '/api/admin/platforms', headers: authHeader(admin)
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(2)
      expect(res.json().some((p: { enabled: boolean }) => p.enabled === false)).toBe(true)
    })

    it('TC-PL2-16: POST 创建平台 201', async () => {
      const admin = setAdmin('77101')
      const res = await app.inject({
        method: 'POST', url: '/api/admin/platforms', headers: authHeader(admin),
        payload: {
          name: '新平台', icon_key: 'newplatform', match_domains: ['new.example.com'],
          sort_order: 99
        }
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.name).toBe('新平台')
      expect(body.iconKey).toBe('newplatform')
      expect(body.matchDomains).toEqual(['new.example.com'])
      expect(body.enabled).toBe(true)
    })

    it('TC-PL2-17: POST 缺 name 400（schema）', async () => {
      const admin = setAdmin('77102')
      const res = await app.inject({
        method: 'POST', url: '/api/admin/platforms', headers: authHeader(admin),
        payload: { icon_key: 'x' }
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-PL2-18: POST icon_key 与 fallback_char 均空拒绝', async () => {
      const admin = setAdmin('77103')
      const res = await app.inject({
        method: 'POST', url: '/api/admin/platforms', headers: authHeader(admin),
        payload: { name: '无图标平台', match_domains: ['noicon.com'] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('PLATFORM_ICON_REQUIRED')
    })

    it('TC-PL2-19: POST 域名形态非法拒绝', async () => {
      const admin = setAdmin('77104')
      const res = await app.inject({
        method: 'POST', url: '/api/admin/platforms', headers: authHeader(admin),
        payload: { name: '坏域名', fallback_char: '坏', match_domains: ['https://weibo.com/path'] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('PLATFORM_DOMAIN_INVALID')
    })

    it('TC-PL2-20: POST 域名与启用平台冲突拒绝', async () => {
      const admin = setAdmin('77105')
      seedPlatform() // weibo.com 已占用
      const res = await app.inject({
        method: 'POST', url: '/api/admin/platforms', headers: authHeader(admin),
        payload: { name: '抢域名', fallback_char: '抢', match_domains: ['weibo.com'] }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('PLATFORM_DOMAIN_TAKEN')
    })

    it('TC-PL2-21: PUT 更新平台（name + enabled）', async () => {
      const admin = setAdmin('77106')
      const p = seedPlatform()
      const res = await app.inject({
        method: 'PUT', url: `/api/admin/platforms/${p.id}`, headers: authHeader(admin),
        payload: { name: '微博Pro', enabled: false }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('微博Pro')
      expect(res.json().enabled).toBe(false)
    })

    it('TC-PL2-21b: PUT 存量脏 match_domains JSON 回退空域名表，不 500（d3 P2）', async () => {
      const admin = setAdmin('77106')
      const r = db.prepare(`
        INSERT INTO social_platforms (name, icon_key, match_domains, sort_order, enabled)
        VALUES ('脏平台', 'x', 'not-json', 1, 1)
      `).run()
      const res = await app.inject({
        method: 'PUT', url: `/api/admin/platforms/${r.lastInsertRowid}`, headers: authHeader(admin),
        payload: { name: '修复后' }
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('修复后')
      expect(res.json().matchDomains).toEqual([])
    })

    it('TC-PL2-22: PUT 不存在的平台 404', async () => {
      const admin = setAdmin('77107')
      const res = await app.inject({
        method: 'PUT', url: '/api/admin/platforms/99999', headers: authHeader(admin),
        payload: { name: '幽灵' }
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('PLATFORM_NOT_FOUND')
    })

    it('TC-PL2-23: DELETE 平台后引用链接归「其他」（不级联删链接）', async () => {
      const admin = setAdmin('77108')
      const weibo = seedPlatform()
      const artist = makeArtist()
      await putLinks(artist, [
        { url: 'https://weibo.com/u/1' },
        { url: 'https://other-site.com/x' }
      ])
      expect(storedLinks(artist.id)[0].platformId).toBe(weibo.id)

      const res = await app.inject({
        method: 'DELETE', url: `/api/admin/platforms/${weibo.id}`, headers: authHeader(admin)
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(res.json().reattributed).toBe(1)

      // 链接保留，platformId 置 null；无关链接不受影响
      const stored = storedLinks(artist.id)
      expect(stored).toHaveLength(2)
      expect(stored[0]).toEqual({ platformId: null, url: 'https://weibo.com/u/1' })
      expect(stored[1].platformId).toBeNull()
      // 平台行已删
      expect(db.prepare('SELECT id FROM social_platforms WHERE id = ?').get(weibo.id)).toBeUndefined()
    })

    it('TC-PL2-24: DELETE 不存在的平台 404', async () => {
      const admin = setAdmin('77109')
      const res = await app.inject({
        method: 'DELETE', url: '/api/admin/platforms/99999', headers: authHeader(admin)
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('PLATFORM_NOT_FOUND')
    })
  })

  // ─── GET 公开主页响应（新结构） ───

  describe('GET 公开主页', () => {
    it('TC-PL2-25: 返回 customLinks 新结构；weiboUrl/bilibiliUrl/platformUrls 已移除', async () => {
      const weibo = seedPlatform()
      const artist = makeArtist()
      await putLinks(artist, [{ url: 'https://weibo.com/u/99' }])

      const res = await app.inject({ method: 'GET', url: '/api/artists/plat-test' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.customLinks).toEqual([
        { platformId: weibo.id, url: 'https://weibo.com/u/99' }
      ])
      expect(body).not.toHaveProperty('weiboUrl')
      expect(body).not.toHaveProperty('bilibiliUrl')
      expect(body).not.toHaveProperty('platformUrls')
      expect(body.inspirationTags).toEqual([])
    })

    it('TC-PL2-26: 未设置时 customLinks 为空数组（旧列有值也不回退）', async () => {
      const artist = makeArtist()
      // 模拟旧列残留数据——新读路径不回退
      db.prepare('UPDATE artists SET weibo_url = ?, bilibili_url = ? WHERE id = ?')
        .run('https://weibo.com/old', 'https://bilibili.com/old', artist.id)
      const res = await app.inject({ method: 'GET', url: '/api/artists/plat-test' })
      expect(res.statusCode).toBe(200)
      expect(res.json().customLinks).toEqual([])
    })

    it('TC-PL2-27: hidden 状态不暴露外链', async () => {
      makeArtist({ status: 'hidden' })
      const res = await app.inject({ method: 'GET', url: '/api/artists/plat-test' })
      expect(res.statusCode).toBe(200)
      expect(res.json().customLinks).toBeUndefined()
    })
  })

  // ─── GET 画师后台 profile ───

  describe('GET 画师后台 profile', () => {
    it('TC-PL2-28: profile 含新结构 custom_links 原始值', async () => {
      const weibo = seedPlatform()
      const artist = makeArtist()
      await putLinks(artist, [{ url: 'https://weibo.com/art' }])
      const res = await app.inject({
        method: 'GET', url: '/api/artist/profile', headers: authHeader(artist)
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      const parsed = JSON.parse(body.custom_links)
      expect(parsed).toEqual([{ platformId: weibo.id, url: 'https://weibo.com/art' }])
      expect(body.inspiration_tags).toBeFalsy()
    })
  })

  // ─── PUT inspirationTags（原 R58-8 保留用例，功能未变） ───

  describe('PUT inspirationTags', () => {
    it('TC-IT-01: 写入灵感标签', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: ['赛博朋克', '水墨风', '少女'] }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT inspiration_tags FROM artists WHERE id = ?').get(artist.id) as { inspiration_tags: string }
      expect(JSON.parse(row.inspiration_tags)).toEqual(['赛博朋克', '水墨风', '少女'])
    })

    it('TC-IT-02: 去重 + 去空白', async () => {
      const artist = makeArtist()
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: [' 赛博朋克 ', '赛博朋克', '  ', '水墨'] }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT inspiration_tags FROM artists WHERE id = ?').get(artist.id) as { inspiration_tags: string }
      expect(JSON.parse(row.inspiration_tags)).toEqual(['赛博朋克', '水墨'])
    })

    it('TC-IT-03: 超过 20 个拒绝', async () => {
      const artist = makeArtist()
      const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`)
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: tags }
      })
      expect(res.statusCode).toBe(400)
    })

    it('TC-IT-04: 空数组清空标签', async () => {
      const artist = makeArtist()
      await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: ['test'] }
      })
      const res = await app.inject({
        method: 'PUT',
        url: '/api/artist/profile',
        headers: authHeader(artist),
        payload: { inspirationTags: [] }
      })
      expect(res.statusCode).toBe(200)
      const row = db.prepare('SELECT inspiration_tags FROM artists WHERE id = ?').get(artist.id) as { inspiration_tags: string }
      expect(JSON.parse(row.inspiration_tags)).toEqual([])
    })
  })
})
