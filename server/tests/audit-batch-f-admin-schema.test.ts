import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// 审计批 F-3（P3-22）: 管理端路由 schema 补齐
// 无 schema 的路由补 params/query/body schema，删除被取代的手工 parseInt 兜底
// 非法入参 → 400；合法入参行为不变（既有测试回归）
// ============================================

function setAdmin(qqNumber: string): ArtistRow {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

describe('审计批 F-3 管理端 schema 校验', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
    admin = setAdmin('88401')
    artist = seedArtist({ qq_number: '88402', subdomain: 'f3-target' })
  })

  afterEach(() => app.close())

  function auth(): { Authorization: string } {
    // REQ-041：管理后台路由需 step-up 升级会话
    return { Authorization: `Bearer ${createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
  }

  it('TC-F3-01: 非法路径参数 → 400（DELETE /artists/:id、bind-init、greetings/:id）', async () => {
    const delBad = await app.inject({ method: 'DELETE', url: '/api/admin/artists/abc', headers: auth() })
    expect(delBad.statusCode).toBe(400)

    const delFloat = await app.inject({ method: 'DELETE', url: '/api/admin/artists/1.5', headers: auth() })
    expect(delFloat.statusCode).toBe(400)

    const bindBad = await app.inject({ method: 'POST', url: '/api/admin/artists/abc/totp/bind-init', headers: auth() })
    expect(bindBad.statusCode).toBe(400)

    const greetingBad = await app.inject({ method: 'PUT', url: '/api/admin/greetings/abc', headers: auth(), payload: { text: 'x' } })
    expect(greetingBad.statusCode).toBe(400)

    const artistGreetingBad = await app.inject({ method: 'DELETE', url: '/api/admin/artists/1/greetings/abc', headers: auth() })
    expect(artistGreetingBad.statusCode).toBe(400)
  })

  it('TC-F3-02: 非法 query 参数 → 400（orders 分页：page=abc / pageSize=0 / pageSize=500）', async () => {
    for (const q of ['page=abc', 'page=0', 'pageSize=0', 'pageSize=500', 'pageSize=abc']) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/artists/${artist.id}/orders?${q}`,
        headers: auth()
      })
      expect(res.statusCode).toBe(400)
    }
  })

  it('TC-F3-03: 非法 body → 400（status 缺字段 / 非法枚举）', async () => {
    const missing = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/status`,
      headers: auth(),
      payload: {}
    })
    expect(missing.statusCode).toBe(400)

    const bogus = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/status`,
      headers: auth(),
      payload: { status: 'bogus' }
    })
    expect(bogus.statusCode).toBe(400)
  })

  it('TC-F3-04: 合法入参行为不变——路径数字串正常强转、分页正常返回', async () => {
    seedOrder(artist.id, { order_no: 'F3-ORDER-01', client_qq: '88403' })
    const orders = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${artist.id}/orders?page=1&pageSize=10`,
      headers: auth()
    })
    expect(orders.statusCode).toBe(200)
    expect(orders.json().items).toHaveLength(1)
    expect(orders.json().page).toBe(1)
    expect(orders.json().pageSize).toBe(10)

    const status = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/status`,
      headers: auth(),
      payload: { status: 'full' }
    })
    expect(status.statusCode).toBe(200)
    expect(status.json().status).toBe('full')

    const del = await app.inject({ method: 'DELETE', url: `/api/admin/artists/${artist.id}`, headers: auth() })
    expect(del.statusCode).toBe(200)
    expect(del.json().success).toBe(true)
  })

  it('TC-F3-05: totp bind-init/reset 合法路径 200（bind-confirm 保留 body schema）', async () => {
    const init = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/bind-init`,
      headers: auth()
    })
    expect(init.statusCode).toBe(200)
    expect(init.json().otpauthUri).toContain('otpauth://totp/')

    const reset = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/totp/reset`,
      headers: auth()
    })
    expect(reset.statusCode).toBe(200)
  })

  it('TC-F3-06: 工作流/问候语子资源路径合法 200、非法 400', async () => {
    const wf = await app.inject({
      method: 'GET',
      url: `/api/admin/artists/${artist.id}/workflow`,
      headers: auth()
    })
    expect(wf.statusCode).toBe(200)

    const wfBad = await app.inject({
      method: 'GET',
      url: '/api/admin/artists/abc/workflow',
      headers: auth()
    })
    expect(wfBad.statusCode).toBe(400)

    const addG = await app.inject({
      method: 'POST',
      url: `/api/admin/artists/${artist.id}/greetings`,
      headers: auth(),
      payload: { text: '早上好' }
    })
    expect(addG.statusCode).toBe(200)
    const gid = addG.json().id

    const editG = await app.inject({
      method: 'PUT',
      url: `/api/admin/artists/${artist.id}/greetings/${gid}`,
      headers: auth(),
      payload: { text: '改了' }
    })
    expect(editG.statusCode).toBe(200)

    const delGBad = await app.inject({
      method: 'DELETE',
      url: `/api/admin/artists/${artist.id}/greetings/abc`,
      headers: auth()
    })
    expect(delGBad.statusCode).toBe(400)
  })

  it('TC-F3-07: 回收站分页合法参数 200，非法 400', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/recycle-bin?page=1&pageSize=20',
      headers: auth()
    })
    expect(ok.statusCode).toBe(200)

    for (const q of ['page=0', 'pageSize=0', 'pageSize=abc', 'pageSize=500']) {
      const bad = await app.inject({
        method: 'GET',
        url: `/api/admin/recycle-bin?${q}`,
        headers: auth()
      })
      expect(bad.statusCode).toBe(400)
    }
  })
})
