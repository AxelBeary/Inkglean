import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { cleanDb, seedArtist, seedOrder, db } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// oimimo 吸纳批一：日历订阅（ICS）——手机日历同步排期与截稿日
// 画师端开关/旋转（Bearer 会话）+ 公开订阅端点（令牌即凭证）
describe('日历订阅 ICS (Calendar Feed)', () => {
  let app: FastifyInstance
  let artist: ArtistRow
  let token: string

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist({ qq_number: '89100', subdomain: 'feedme', name: '订阅画师' })
    token = createSession(artist.id, artist.token_version)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function feedGet() {
    return app.inject({
      method: 'GET',
      url: '/api/artist/calendar-feed',
      headers: { Authorization: `Bearer ${token}` }
    })
  }

  function feedPut(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      url: '/api/artist/calendar-feed',
      headers: { Authorization: `Bearer ${token}` },
      payload
    })
  }

  function feedRotate() {
    return app.inject({
      method: 'POST',
      url: '/api/artist/calendar-feed/rotate',
      headers: { Authorization: `Bearer ${token}` }
    })
  }

  function publicIcs(feedUrl: string | null, ifNoneMatch?: string) {
    return app.inject({
      method: 'GET',
      url: feedUrl ?? '/api/public/artist/feedme/calendar.ics',
      headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}
    })
  }

  /** seedOrder 不含 deadline/start_date 列，种子后 UPDATE 补齐 */
  function seedScheduledOrder(overrides: { status?: string; start_date?: string | null; deadline: string; client_name?: string }) {
    const order = seedOrder(artist.id, { status: overrides.status ?? 'wip', client_name: overrides.client_name ?? null })
    db.prepare('UPDATE orders SET deadline = ?, start_date = ? WHERE id = ?')
      .run(overrides.deadline, overrides.start_date ?? null, order.id)
    return order
  }

  it('TC-CF-01: 默认关闭（enabled=false url=null），开启后回含令牌订阅路径', async () => {
    const before = await feedGet()
    expect(before.statusCode).toBe(200)
    expect(before.json()).toEqual({ enabled: false, url: null })

    const put = await feedPut({ enabled: true })
    expect(put.statusCode).toBe(200)
    const body = put.json()
    expect(body.enabled).toBe(true)
    expect(body.url).toMatch(/^\/api\/public\/artist\/feedme\/calendar\.ics\?token=.+$/)

    const after = await feedGet()
    expect(after.json().url).toBe(body.url)
  })

  it('TC-CF-02: 开启后公开端点返回合法 ICS（无订单时零事件）', async () => {
    const { url } = (await feedPut({ enabled: true })).json()
    const res = await publicIcs(url)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/calendar')
    const text = res.body
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('END:VCALENDAR')
    expect(text).toContain('订阅画师 的排期')
    expect(text).not.toContain('BEGIN:VEVENT')
  })

  it('TC-CF-03: 排期单生成跨日事件、仅截稿单生成单日截稿事件，终态/无截稿日单不进历', async () => {
    seedScheduledOrder({ deadline: '2026-09-01', start_date: '2026-08-20', client_name: '星野' })
    seedScheduledOrder({ deadline: '2026-09-10', start_date: null })
    seedScheduledOrder({ deadline: '2026-09-11', start_date: '2026-09-01', status: 'delivered' })
    seedScheduledOrder({ deadline: '2026-09-12', start_date: '2026-09-01', status: 'cancelled' })
    seedOrder(artist.id, { status: 'wip' }) // 无截稿日

    const { url } = (await feedPut({ enabled: true })).json()
    const text = (await publicIcs(url)).body

    // 跨日事件：DTSTART=开始日，DTEND=截稿日+1（全天事件排他日）
    expect(text).toContain('DTSTART;VALUE=DATE:20260820')
    expect(text).toContain('DTEND;VALUE=DATE:20260902')
    expect(text).toContain('星野｜')
    // 仅截稿日：单日事件 + 「截稿」前缀
    expect(text).toContain('DTSTART;VALUE=DATE:20260910')
    expect(text).toContain('DTEND;VALUE=DATE:20260911')
    expect(text).toContain('截稿｜')
    // 终态与无截稿日单不进历（共 2 个事件）
    expect(text.match(/BEGIN:VEVENT/g)?.length).toBe(2)
  })

  it('TC-CF-04: 错误令牌/缺令牌/画师不存在/未启用一律 404（不泄露差异）', async () => {
    const { url } = (await feedPut({ enabled: true })).json()
    const wrong = url.replace(/token=.+$/, 'token=wrongtoken123')
    expect((await publicIcs(wrong)).statusCode).toBe(404)
    expect((await publicIcs('/api/public/artist/feedme/calendar.ics')).statusCode).toBe(404)
    expect((await publicIcs('/api/public/artist/nobody/calendar.ics?token=abc')).statusCode).toBe(404)

    await feedPut({ enabled: false })
    expect((await publicIcs(url)).statusCode).toBe(404)
  })

  it('TC-CF-05: 旋转令牌——新链接可用、旧链接立即失效', async () => {
    const oldUrl = (await feedPut({ enabled: true })).json().url
    const newUrl = (await feedRotate()).json().url
    expect(newUrl).not.toBe(oldUrl)
    expect((await publicIcs(newUrl)).statusCode).toBe(200)
    expect((await publicIcs(oldUrl)).statusCode).toBe(404)
  })

  it('TC-CF-06: 关闭再开启沿用原链接（令牌不清）', async () => {
    const firstUrl = (await feedPut({ enabled: true })).json().url
    await feedPut({ enabled: false })
    const againUrl = (await feedPut({ enabled: true })).json().url
    expect(againUrl).toBe(firstUrl)
  })

  it('TC-CF-07: ETag 协商——带 If-None-Match 命中返回 304', async () => {
    const { url } = (await feedPut({ enabled: true })).json()
    const first = await publicIcs(url)
    const etag = first.headers['etag'] as string
    expect(etag).toBeTruthy()
    const second = await publicIcs(url, etag)
    expect(second.statusCode).toBe(304)
  })

  it('TC-CF-08: 封禁画师即使令牌正确也 404（对齐公开路由隐身口径）', async () => {
    const { url } = (await feedPut({ enabled: true })).json()
    db.prepare('UPDATE artists SET is_banned = 1 WHERE id = ?').run(artist.id)
    expect((await publicIcs(url)).statusCode).toBe(404)
  })

  it('TC-CF-09: ICS 文本转义——逗号/分号转义，客户名缺省回落 QQ', async () => {
    seedScheduledOrder({ deadline: '2026-09-05', start_date: '2026-09-01', client_name: '甲方,公司;分号' })
    seedScheduledOrder({ deadline: '2026-09-06', start_date: null, client_name: '' })
    const { url } = (await feedPut({ enabled: true })).json()
    const text = (await publicIcs(url)).body
    expect(text).toContain('甲方\\,公司\\;分号')
    expect(text).toContain('截稿｜99999｜') // 无名回落 client_qq
  })

  it('TC-CF-10: 参数与会话守卫——非法 body 400 / 未登录 401', async () => {
    expect((await feedPut({ enabled: 'yes' })).statusCode).toBe(400)
    expect((await feedPut({})).statusCode).toBe(400)
    const anon = await app.inject({ method: 'GET', url: '/api/artist/calendar-feed' })
    expect(anon.statusCode).toBe(401)
  })
})
