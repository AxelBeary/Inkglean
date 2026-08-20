// 自定义首页批一（v70）：仪表盘布局偏好 prefs 端点测试
// 覆盖：默认回读 / 旧开关吞并 / 保存归一化 / 非法输入逐字段落默认 / 坏 JSON 鲁棒
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { cleanDb, seedArtist, db, type ArtistRow } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { CORE_MODULES, OPTIONAL_MODULES, PREFS_SCHEMA_VERSION } from '../src/features/artist/dashboard-prefs.service.js'

describe('仪表盘布局偏好 dashboard prefs（自定义首页批一 v70）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
  })
  afterEach(async () => { await app.close() })

  function authed(): { artist: ArtistRow; headers: { authorization: string } } {
    const artist = seedArtist({ qq_number: '888', subdomain: 'dash-prefs' })
    const token = createSession(artist.id, artist.token_version)
    return { artist, headers: { authorization: 'Bearer ' + token } }
  }

  it('TC-DP-01 未设置时 GET 返回完整默认值（可选板块默认藏起在库）', async () => {
    const { headers } = authed()
    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/prefs', headers })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.v).toBe(PREFS_SCHEMA_VERSION)
    expect(body.order).toEqual([...CORE_MODULES])
    expect(body.hidden).toEqual([...OPTIONAL_MODULES])
    expect(body.width.greet).toBe('half')   // 用户 2026-08-21 拍板：问候卡默认半行
    expect(body.width.schedule).toBe('full')
    expect(body.width.todo).toBe('half')
    expect(body.density).toEqual({ todo: 0, guestbook: 0, activity: 0, ddlSoon: 0 })
    expect(body.scheduleStyle).toBe('bars')
    expect(body.greetStyle).toBe('plain')
    expect(body.pageAlign).toBe('center')
    expect(body.pageMax).toBe(1200)
  })

  it('TC-DP-02 旧 dashboard_modules 开关在读路径被吞并（false→hidden）', async () => {
    const { artist, headers } = authed()
    db.prepare('UPDATE artists SET dashboard_modules = ? WHERE id = ?')
      .run(JSON.stringify({ schedule: false, guestbook: false, activity: true }), artist.id)

    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/prefs', headers })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.hidden).toEqual(['schedule', 'guestbook'])
    expect(body.order).toEqual([...CORE_MODULES])
  })

  it('TC-DP-03 PUT 合法完整偏好 → 回读一致，且旧列置 NULL 完成吞并', async () => {
    const { artist, headers } = authed()
    db.prepare('UPDATE artists SET dashboard_modules = ? WHERE id = ?')
      .run(JSON.stringify({ schedule: false }), artist.id)

    const custom = {
      order: ['stats', 'greet', 'plaque', 'todo', 'schedule', 'guestbook', 'activity', 'announcement', 'onboarding', 'quick'],
      hidden: ['activity'],
      width: { todo: 'full', stats: 'half' },
      density: { todo: 3 },
      scheduleStyle: 'ptags',
      greetStyle: 'seal',
      pageAlign: 'left',
      pageMax: 1400
    }
    const put = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', headers, payload: custom })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({ method: 'GET', url: '/api/artist/dashboard/prefs', headers })
    expect(get.json()).toMatchObject(custom)

    // 吞并完成：旧列 NULL（经 profile 回读验证）
    const profile = await app.inject({ method: 'GET', url: '/api/artist/profile', headers })
    expect(profile.json().dashboard_modules).toBeNull()
  })

  it('TC-DP-04 非法输入逐字段归一化：未知 id 剔除、缺失补齐、枚举落默认、页宽钳制', async () => {
    const { headers } = authed()
    const dirty = {
      order: ['todo', 'hacker', 'todo', 'greet'],           // 未知剔除 + 去重，缺 6 个补尾部
      hidden: ['nope', 'guestbook'],                        // 未知剔除
      width: { todo: 'huge', stats: 'half', hacker: 'full' }, // 非法值/未知键剔除
      density: { todo: 7, guestbook: 5, quick: 3 },         // 7 非法、quick 非列表卡
      scheduleStyle: 'inkline',                             // 已下架款式 → 落默认
      greetStyle: 'inkwash',                                // 已删款式 → 落默认
      pageAlign: 'middle',                                  // 非法 → 落默认
      pageMax: 9999                                         // 超上限 → 钳到 1680
    }
    const put = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', headers, payload: dirty })
    expect(put.statusCode).toBe(200)
    const body = put.json()

    expect(body.order.slice(0, 3)).toEqual(['todo', 'greet', 'plaque'])
    expect(body.order).toHaveLength(CORE_MODULES.length)
    expect(new Set(body.order).size).toBe(CORE_MODULES.length)
    expect(body.hidden).toEqual(['guestbook'])
    expect(body.width.todo).toBe('half')   // 'huge' 被剔除，保持默认
    expect(body.width.stats).toBe('half')
    expect(body.width.hacker).toBeUndefined()
    expect(body.density.todo).toBe(0)      // 7 非法落默认
    expect(body.density.guestbook).toBe(5)
    expect(body.density.quick).toBeUndefined()
    expect(body.scheduleStyle).toBe('bars')
    expect(body.greetStyle).toBe('plain')
    expect(body.pageAlign).toBe('center')
    expect(body.pageMax).toBe(1680)
  })

  it('TC-DP-05 库内 prefs 被写坏（坏 JSON / 非对象）→ GET 全落默认不 500', async () => {
    const { artist, headers } = authed()
    db.prepare('UPDATE artists SET dashboard_prefs = ? WHERE id = ?').run('not-json{{{', artist.id)
    let res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/prefs', headers })
    expect(res.statusCode).toBe(200)
    expect(res.json().order).toEqual([...CORE_MODULES])

    db.prepare('UPDATE artists SET dashboard_prefs = ? WHERE id = ?').run('"just a string"', artist.id)
    res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/prefs', headers })
    expect(res.statusCode).toBe(200)
    expect(res.json().pageMax).toBe(1200)
  })

  it('TC-DP-06 PUT 空对象 = 全默认落库；PUT 非对象 body → 400', async () => {
    const { headers } = authed()
    const empty = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', headers, payload: {} })
    expect(empty.statusCode).toBe(200)
    expect(empty.json().order).toEqual([...CORE_MODULES])

    const bad = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', headers, payload: [1, 2, 3] })
    expect(bad.statusCode).toBe(400)
  })

  it('TC-DP-07 未登录访问 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/artist/dashboard/prefs' })
    expect(res.statusCode).toBe(401)
    const put = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', payload: {} })
    expect(put.statusCode).toBe(401)
  })

  it('TC-DP-08 pageMax 下界钳制与取整', async () => {
    const { headers } = authed()
    const low = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', headers, payload: { pageMax: 100 } })
    expect(low.json().pageMax).toBe(1000)
    const frac = await app.inject({ method: 'PUT', url: '/api/artist/dashboard/prefs', headers, payload: { pageMax: 1234.6 } })
    expect(frac.json().pageMax).toBe(1235)
  })

  it('TC-DP-09 可选板块（板块库）：order 中保留不自动补，缺失不自动上首页', async () => {
    const { headers } = authed()
    // 添加 incomeMonth 上首页（从库里拿出）：order 含它 + hidden 去掉它
    const add = await app.inject({
      method: 'PUT', url: '/api/artist/dashboard/prefs', headers,
      payload: { order: [...CORE_MODULES, 'incomeMonth'], hidden: ['incomeChart', 'ddlSoon'] }
    })
    expect(add.statusCode).toBe(200)
    expect(add.json().order).toEqual([...CORE_MODULES, 'incomeMonth'])
    expect(add.json().hidden).toEqual(['incomeChart', 'ddlSoon'])

    // 只传基础 order：可选板块不自动补进 order（未添加即不在首页）；hidden 缺省落默认（可选板块回库）
    const bare = await app.inject({
      method: 'PUT', url: '/api/artist/dashboard/prefs', headers,
      payload: { order: [...CORE_MODULES] }
    })
    expect(bare.json().order).toEqual([...CORE_MODULES])
    expect(bare.json().hidden).toEqual([...OPTIONAL_MODULES])

    // 未知可选 id 剔除
    const junk = await app.inject({
      method: 'PUT', url: '/api/artist/dashboard/prefs', headers,
      payload: { order: [...CORE_MODULES, 'moonBase'], hidden: ['moonBase', 'incomeChart'] }
    })
    expect(junk.json().order).toEqual([...CORE_MODULES])
    expect(junk.json().hidden).toEqual(['incomeChart'])
  })
})
