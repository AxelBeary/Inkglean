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

  /**
   * B-1 回归：模拟 SpecialDayManage.vue 修复后三动作的真实调用形态——
   * 按「行 / 所选特别日」的 artist_id 决定走全局端点还是画师端点。
   * 修复前 UI 三动作全走全局端点（createGreeting/updateGreeting/deleteGreeting），
   * 在画师专属日下分别 400/404/404；这里钉死分流后端点全 200。
   */
  function uiCreate(day: { id: number; artist_id: number | null }, text: string) {
    const payload = { text, timeSlot: 'any', specialDayId: day.id }
    return day.artist_id == null
      ? app.inject({ method: 'POST', url: '/api/admin/greetings', headers: auth(admin), payload })
      : app.inject({ method: 'POST', url: `/api/admin/artists/${day.artist_id}/greetings`, headers: auth(admin), payload })
  }

  function uiToggle(row: { id: number; artist_id: number | null }, val: boolean) {
    return row.artist_id == null
      ? app.inject({ method: 'PUT', url: `/api/admin/greetings/${row.id}`, headers: auth(admin), payload: { isEnabled: val } })
      : app.inject({ method: 'PUT', url: `/api/admin/artists/${row.artist_id}/greetings/${row.id}`, headers: auth(admin), payload: { isEnabled: val } })
  }

  function uiDelete(row: { id: number; artist_id: number | null }) {
    return row.artist_id == null
      ? app.inject({ method: 'DELETE', url: `/api/admin/greetings/${row.id}`, headers: auth(admin) })
      : app.inject({ method: 'DELETE', url: `/api/admin/artists/${row.artist_id}/greetings/${row.id}`, headers: auth(admin) })
  }

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

  // ─────────────────────────────────────────────────────────────────────────────
  // B-1（BLOCKER）回归：SpecialDayManage.vue 三动作按归属分流的真实 UI 调用路径
  // ─────────────────────────────────────────────────────────────────────────────

  it('TC-B1-01: 画师专属日「新增/启停/删除」走画师端点全 200，旧全局调用形态 400/404/404', async () => {
    const day = { id: artistDayId, artist_id: artist.id as number | null }

    // ① 新增：UI 按 selected.value.artist_id 分流 → 画师端点（修复前走全局 POST → 400）
    const created = await uiCreate(day, '画师专属日文案')
    expect(created.statusCode).toBe(200)
    expect(created.json().artist_id).toBe(artist.id)
    expect(created.json().special_day_id).toBe(artistDayId)
    const row = created.json() as { id: number; artist_id: number | null }

    // 对照：修复前的全局 POST 形态仍被服务端拒绝（归属约束本身正确，不要改）
    const legacyCreate = await app.inject({
      method: 'POST', url: '/api/admin/greetings', headers: auth(admin),
      payload: { text: '旧全局文案', timeSlot: 'any', specialDayId: artistDayId }
    })
    expect(legacyCreate.statusCode).toBe(400)

    // ② 启停：UI 按 row.artist_id 分流 → 画师 PUT（修复前走全局 PUT → 404）
    const toggled = await uiToggle(row, false)
    expect(toggled.statusCode).toBe(200)
    expect(toggled.json().is_enabled).toBe(0)
    const legacyToggle = await app.inject({
      method: 'PUT', url: `/api/admin/greetings/${row.id}`, headers: auth(admin), payload: { isEnabled: false }
    })
    expect(legacyToggle.statusCode).toBe(404)

    // ③ 删除：UI 按 row.artist_id 分流 → 画师 DELETE（修复前走全局 DELETE → 404）
    const removed = await uiDelete(row)
    expect(removed.statusCode).toBe(200)
    const left = db.prepare('SELECT id FROM greeting_templates WHERE id = ?').get(row.id)
    expect(left).toBeUndefined()
    const legacyDelete = await app.inject({
      method: 'DELETE', url: `/api/admin/greetings/${row.id}`, headers: auth(admin)
    })
    expect(legacyDelete.statusCode).toBe(404)
  })

  it('TC-B1-02: 同特别日混存全局行+画师行时，列表不分归属但按行 artist_id 分流各自成功', async () => {
    // 历史遗留：画师专属日下也曾有全局行（artist_id IS NULL）。列表 GET 不分归属，
    // UI 必须对每一行按自身 artist_id 选端点，不能按 selected.value.artist_id 一刀切。
    const legacyGlobalId = Number(db.prepare(
      'INSERT INTO greeting_templates (artist_id, text, time_slot, is_enabled, special_day_id) VALUES (NULL, ?, ?, 1, ?)'
    ).run('历史全局行', 'any', artistDayId).lastInsertRowid)
    const artistCreated = await uiCreate({ id: artistDayId, artist_id: artist.id }, '画师行')
    expect(artistCreated.statusCode).toBe(200)
    const artistRow = artistCreated.json() as { id: number; artist_id: number | null }

    const list = await app.inject({
      method: 'GET', url: `/api/admin/special-days/${artistDayId}/greetings`, headers: auth(admin)
    })
    expect(list.statusCode).toBe(200)
    const rows = list.json() as Array<{ id: number; artist_id: number | null }>
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.artist_id)).toEqual(expect.arrayContaining([null, artist.id]))

    // 按行分流启停：两条都成功（若按特别日统一走画师端点，全局行会 404；
    // 若统一走全局端点，画师行会 404）
    for (const r of rows) {
      const res = await uiToggle(r, false)
      expect(res.statusCode).toBe(200)
    }
    expect((db.prepare('SELECT is_enabled FROM greeting_templates WHERE id = ?').get(legacyGlobalId) as { is_enabled: number }).is_enabled).toBe(0)
    expect((db.prepare('SELECT is_enabled FROM greeting_templates WHERE id = ?').get(artistRow.id) as { is_enabled: number }).is_enabled).toBe(0)

    // 按行分流删除：两条都成功
    for (const r of rows) {
      const res = await uiDelete(r)
      expect(res.statusCode).toBe(200)
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM greeting_templates WHERE special_day_id = ?').get(artistDayId) as { c: number }
    expect(count.c).toBe(0)
  })

  it('TC-B1-03: 全平台特别日新增仍走全局端点 200（合法路径不被分流破坏）', async () => {
    const created = await uiCreate({ id: globalDayId, artist_id: null }, '全平台日文案')
    expect(created.statusCode).toBe(200)
    expect(created.json().artist_id).toBeNull()
    expect(created.json().special_day_id).toBe(globalDayId)
    const row = created.json() as { id: number; artist_id: number | null }
    expect((await uiToggle(row, false)).statusCode).toBe(200)
    expect((await uiDelete(row)).statusCode).toBe(200)
  })
})
