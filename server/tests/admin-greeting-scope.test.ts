import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// ============================================
// B7-F0108：全局问候语挂特别日的反向归属（租户）校验
// 全局端点（POST/PUT /api/admin/greetings）只许挂全平台特别日（artist_id IS NULL）；
// 此前仅查存在性，画师专属日可被全局文案污染（与画师侧 POST 的 SRV-11 校验镜像对称）
// ============================================

function setAdmin(qqNumber: string): ArtistRow {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

function auth(admin: ArtistRow): { Authorization: string } {
  // REQ-041：管理后台路由需 step-up 升级会话
  return { Authorization: `Bearer ${createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
}

/** 直插特别日（artistId=null 全平台 / 数字=画师专属） */
function seedDay(name: string, artistId: number | null): number {
  return Number(db.prepare(
    'INSERT INTO greeting_special_days (name, date_key, artist_id, is_enabled) VALUES (?, ?, ?, 1)'
  ).run(name, '08-14', artistId).lastInsertRowid)
}

describe('B7-F0108 全局问候语挂特别日反向归属校验', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow
  let artistDayId: number
  let globalDayId: number

  beforeEach(async () => {
    cleanDb()
    db.exec('DELETE FROM greeting_templates')
    db.exec('DELETE FROM greeting_special_days')
    app = await buildApp({ logger: false })
    await app.ready()
    admin = setAdmin('88410')
    artist = seedArtist({ qq_number: '88411', subdomain: 'f0108-artist' })
    artistDayId = seedDay('画师专属日', artist.id)
    globalDayId = seedDay('全平台日', null)
  })

  afterEach(async () => { await app.close() })

  it('TC-F0108-01: POST 全局文案挂画师专属特别日 → 400，不入库', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/greetings',
      headers: auth(admin),
      payload: { text: '全局污染文案', specialDayId: artistDayId }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('画师专属')
    const count = db.prepare('SELECT COUNT(*) AS c FROM greeting_templates').get() as { c: number }
    expect(count.c).toBe(0)
  })

  it('TC-F0108-02: POST 全局文案挂全平台特别日 → 200（既有合法路径不受影响）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/greetings',
      headers: auth(admin),
      payload: { text: '全平台节日文案', specialDayId: globalDayId }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().special_day_id).toBe(globalDayId)
  })

  it('TC-F0108-03: PUT 全局文案换挂画师专属特别日 → 400，原关联不动', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/greetings',
      headers: auth(admin),
      payload: { text: '先挂全平台日', specialDayId: globalDayId }
    })
    const id = created.json().id as number

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/greetings/${id}`,
      headers: auth(admin),
      payload: { specialDayId: artistDayId }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toContain('画师专属')
    // 换挂失败 → 仍挂在原全平台日
    const row = db.prepare('SELECT special_day_id FROM greeting_templates WHERE id = ?').get(id) as { special_day_id: number }
    expect(row.special_day_id).toBe(globalDayId)
  })

  it('TC-F0108-04: PUT 换挂另一个全平台特别日 / 解除关联 → 200（合法路径回归）', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/greetings',
      headers: auth(admin),
      payload: { text: '可换挂文案', specialDayId: globalDayId }
    })
    const id = created.json().id as number
    const anotherGlobalDay = seedDay('另一个全平台日', null)

    const moved = await app.inject({
      method: 'PUT',
      url: `/api/admin/greetings/${id}`,
      headers: auth(admin),
      payload: { specialDayId: anotherGlobalDay }
    })
    expect(moved.statusCode).toBe(200)
    expect(moved.json().special_day_id).toBe(anotherGlobalDay)

    const detached = await app.inject({
      method: 'PUT',
      url: `/api/admin/greetings/${id}`,
      headers: auth(admin),
      payload: { specialDayId: null }
    })
    expect(detached.statusCode).toBe(200)
    expect(detached.json().special_day_id).toBeNull()
  })
})
