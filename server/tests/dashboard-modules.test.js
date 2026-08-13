// 视觉批 P2：看板模块开关 dashboard_modules 端点测试
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import { createSession } from '../src/features/auth/auth.service.js'

describe('看板模块开关 dashboardModules（视觉批 P2）', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
  })
  afterEach(async () => { await app.close() })

  function authed() {
    const artist = seedArtist({ qq_number: '888', subdomain: 'dash-mods' })
    const token = createSession(artist.id, artist.token_version)
    return { artist, headers: { authorization: 'Bearer ' + token } }
  }

  it('写入合法开关 → GET profile 回读一致；null 清除', async () => {
    const { headers } = authed()

    const put = await app.inject({
      method: 'PUT', url: '/api/artist/profile', headers,
      payload: { dashboardModules: { schedule: false, guestbook: true } }
    })
    expect(put.statusCode).toBe(200)

    const get = await app.inject({ method: 'GET', url: '/api/artist/profile', headers })
    expect(get.statusCode).toBe(200)
    const mods = JSON.parse(get.json().dashboard_modules)
    expect(mods).toEqual({ schedule: false, guestbook: true })

    // null 清除 → 回读 null（全部显示）
    const clear = await app.inject({
      method: 'PUT', url: '/api/artist/profile', headers,
      payload: { dashboardModules: null }
    })
    expect(clear.statusCode).toBe(200)
    const get2 = await app.inject({ method: 'GET', url: '/api/artist/profile', headers })
    expect(get2.json().dashboard_modules).toBeNull()
  })

  it('未知键被 schema/service 双层过滤不入库；非布尔值被 schema 拦截', async () => {
    const { headers } = authed()

    // 未知键：app 层 ajv removeAdditional 语义（静默剔除）+ service 白名单双保险
    const bad = await app.inject({
      method: 'PUT', url: '/api/artist/profile', headers,
      payload: { dashboardModules: { hacker: true, schedule: false } }
    })
    expect(bad.statusCode).toBe(200)
    const get = await app.inject({ method: 'GET', url: '/api/artist/profile', headers })
    const mods = JSON.parse(get.json().dashboard_modules)
    expect(mods.hacker).toBeUndefined()
    expect(mods.schedule).toBe(false)

    // activity 传非布尔 → schema 布尔约束拦截 400
    const mixed = await app.inject({
      method: 'PUT', url: '/api/artist/profile', headers,
      payload: { dashboardModules: { activity: 'yes', onboarding: false } }
    })
    expect(mixed.statusCode).toBe(400)
  })
})
