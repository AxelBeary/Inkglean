// B1 缺陷③回归：管理员 DELETE /api/admin/messages/:id 曾绕过留痕通道直接软删。
// 断言面：删除与 admin_actions 同事务落地（content_remove/message 行含操作者、缺省文案、来源 IP）、
//        不存在的留言 404 且不产生空留痕。认证范式照抄 tests/guestbook-admin-filter.test.ts。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as guestbookService from '../src/features/guestbook/guestbook.service.js'
import { buildApp } from '../src/app.js'
import { resetRateLimitBuckets } from '../src/shared/middleware/rate-limit.js'

/** admin_actions 行（本文件只读这六个字段） */
interface AdminActionRow {
  admin_id: number
  action: string
  target_type: string | null
  target_id: number | null
  reason: string | null
  admin_ip: string | null
}

describe('B1: 管理员删除留言必须留痕', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let artist: ArtistRow
  let headers: { Authorization: string }

  beforeEach(async () => {
    cleanDb()
    resetRateLimitBuckets()
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run('10001')
    admin = seedArtist({ qq_number: '10001', subdomain: 'b1-admin' })
    artist = seedArtist({ qq_number: '88050', subdomain: 'b1-gb' })
    headers = {
      // REQ-041：/api/admin/* 需 step-up 升级会话
      Authorization: 'Bearer ' + createSession(admin.id, admin.token_version, {
        authLevel: 'admin_verified',
        adminVerifiedAt: new Date().toISOString()
      })
    }
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => { await app.close() })

  it('TC-B1-01: 删除成功 → admin_actions 出现 content_remove/message 行且留言已软删', async () => {
    const msg = guestbookService.createMessage(artist.id, '客', '垃圾广告')!
    const res = await app.inject({ method: 'DELETE', url: `/api/admin/messages/${msg.id}`, headers })
    expect(res.statusCode).toBe(200)

    const row = db.prepare(
      "SELECT * FROM admin_actions WHERE action = 'content_remove' AND target_type = 'message' AND target_id = ?"
    ).get(msg.id) as AdminActionRow | undefined
    expect(row).toMatchObject({ admin_id: admin.id, reason: '管理员删除留言' })
    expect(row?.admin_ip).toBeTruthy()

    const deleted = db.prepare('SELECT deleted_by_admin FROM guestbook_messages WHERE id = ?')
      .get(msg.id) as { deleted_by_admin: number }
    expect(deleted.deleted_by_admin).toBe(1)
  })

  it('TC-B1-02: 不存在的留言返回 404 且不落空留痕', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/admin/messages/999999', headers })
    expect(res.statusCode).toBe(404)
    const count = (db.prepare('SELECT COUNT(*) AS c FROM admin_actions').get() as { c: number }).c
    expect(count).toBe(0)
  })
})
