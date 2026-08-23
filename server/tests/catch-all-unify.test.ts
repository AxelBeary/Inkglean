import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

// 审计 🔴-2：catch-all 统一 AppError 分流
// 覆盖 artist.service.createArtist：按 payload.name 分流
// - 'boom' → 抛非 AppError（模拟未预期的内部错误，如 DB/流错误）
// - 其他   → 抛 AppError（业务错误，如 QQ_TAKEN）
vi.mock('../src/features/artist/artist.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/features/artist/artist.service.js')>()
  const { AppError } = await import('../src/shared/errors.js')
  return {
    ...actual,
    createArtist: async (payload: { name?: string } | undefined): Promise<never> => {
      if (payload && payload.name === 'boom') {
        throw new Error('boom raw internal detail')
      }
      throw new AppError('QQ_TAKEN', 400)
    }
  }
})

describe('C-2 catch-all 统一 AppError 分流（审计 🔴-2）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function setAdmin(qqNumber: string): ArtistRow {
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
    return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
  }

  function adminToken(artist: ArtistRow): string {
    // REQ-041：管理后台路由需 step-up 升级会话
    return createSession(artist.id, artist.token_version, { authLevel: 'admin_verified', adminVerifiedAt: Date.now() as unknown as string })
  }

  function createArtistPayload(name: string, subdomain: string): { qqNumber: string; name: string; subdomain: string; bio: string } {
    return { qqNumber: '90001', name, subdomain, bio: 'x' }
  }

  it('TC-C2-01: 非 AppError → 500 结构化（不再伪装 400、不透传内部 message）', async () => {
    const admin = setAdmin('10001')
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: createArtistPayload('boom', 'boomartist')
    })
    expect(res.statusCode).toBe(500)
    const body = res.json()
    expect(body.code).toBe('INTERNAL')
    expect(body.error).toBe('服务器内部错误')
    // 内部细节不得泄露到响应体
    expect(JSON.stringify(body)).not.toContain('boom raw')
  })

  it('TC-C2-02: AppError → 原状态码（400 + 业务码）', async () => {
    const admin = setAdmin('10001')
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/artists',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: createArtistPayload('正常画师', 'normalartist')
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('QQ_TAKEN')
  })
})
