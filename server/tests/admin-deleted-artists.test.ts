// 0817 用户拍板：已移除画师清单 + 恢复（软删兜底闭环）
// 覆盖：清单只回已移除画师；恢复回到在册列表；未移除/不存在 → 404；非管理员 → 403
// 注：恢复时子域名/QQ 冲突由 artists 表 UNIQUE 约束物理保证不可达（软删行仍占标识，
//     createArtist 预检也不过滤软删行），restoreArtist 内的冲突检查为纯防御，无可达用例
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as artistService from '../src/features/artist/artist.service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber: string) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

describe('GET /api/admin/artists/deleted + POST :id/restore', () => {
  let app: FastifyInstance
  let admin: ArtistRow
  let removed: ArtistRow
  let active: ArtistRow

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
    admin = setAdmin('10002')
    removed = seedArtist({ qq_number: '88050', subdomain: 'da-removed', name: '被移除画师' })
    active = seedArtist({ qq_number: '88051', subdomain: 'da-active', name: '在册画师' })
    artistService.deleteArtist(removed.id)
  })

  function headers() {
    // REQ-041：管理后台路由需 step-up 升级会话
    return { Authorization: `Bearer ${createSession(admin.id, admin.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })}` }
  }

  it('TC-DA-01: 清单只返回已移除画师（在册不进清单）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/artists/deleted', headers: headers() })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(removed.id)
    expect(list[0].name).toBe('被移除画师')
    expect(list[0].deletedAt).toBeTruthy()
  })

  it('TC-DA-02: 恢复后回到在册列表且清单移除', async () => {
    const restore = await app.inject({ method: 'POST', url: `/api/admin/artists/${removed.id}/restore`, headers: headers() })
    expect(restore.statusCode).toBe(200)
    expect(restore.json().success).toBe(true)

    // 在册列表重新可见（getAllArtists 过滤 deleted_at IS NULL）
    const all = artistService.getAllArtists()
    expect(all.some(a => a.id === removed.id)).toBe(true)

    const list = await app.inject({ method: 'GET', url: '/api/admin/artists/deleted', headers: headers() })
    expect(list.json()).toHaveLength(0)
  })

  it('TC-DA-03: 恢复在册画师/不存在画师 → 404', async () => {
    const activeRes = await app.inject({ method: 'POST', url: `/api/admin/artists/${active.id}/restore`, headers: headers() })
    expect(activeRes.statusCode).toBe(404)
    const ghostRes = await app.inject({ method: 'POST', url: '/api/admin/artists/999999/restore', headers: headers() })
    expect(ghostRes.statusCode).toBe(404)
  })

  it('TC-DA-04: 非管理员访问清单/恢复 → 403', async () => {
    const plain = { Authorization: `Bearer ${createSession(active.id, active.token_version)}` }
    const list = await app.inject({ method: 'GET', url: '/api/admin/artists/deleted', headers: plain })
    expect(list.statusCode).toBe(403)
    const restore = await app.inject({ method: 'POST', url: `/api/admin/artists/${removed.id}/restore`, headers: plain })
    expect(restore.statusCode).toBe(403)
  })
})
