import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

/**
 * audit-batch-b P3-14：公开接口不兜底下发登录账号 QQ
 * contact_qq 未设置 → null（不泄露 qq_number）
 */

describe('audit-batch-b P3-14 公开接口不下发登录账号 QQ', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-P3-14-01: 未设 contact_qq 的公开主页 contactQq → null，不泄露登录 QQ', async () => {
    seedArtist({ qq_number: '99001', subdomain: 'p314-none' })
    const res = await app.inject({ method: 'GET', url: '/api/artists/p314-none' })
    expect(res.statusCode).toBe(200)
    expect(res.json().contactQq).toBeNull()
    expect(JSON.stringify(res.json())).not.toContain('99001')
  })

  it('TC-P3-14-02: 已设 contact_qq 照常返回', async () => {
    const artist = seedArtist({ qq_number: '99002', subdomain: 'p314-set' })
    db.prepare('UPDATE artists SET contact_qq = ? WHERE id = ?').run('88000123', artist.id)
    const res = await app.inject({ method: 'GET', url: '/api/artists/p314-set' })
    expect(res.statusCode).toBe(200)
    expect(res.json().contactQq).toBe('88000123')
  })

  it('TC-P3-14-03: orders/lookup 已随 F1 围剿退役 → 410 LOOKUP_RETIRED（不再作为 QQ 泄露面）', async () => {
    seedArtist({ qq_number: '99003', subdomain: 'p314-lookup' })
    const res = await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=p314-lookup&qq=123456' })
    expect(res.statusCode).toBe(410)
    expect(res.json().code).toBe('LOOKUP_RETIRED')
  })

  it('TC-P3-14-04: orders/lookup 已设 contact_qq 同样退役 410', async () => {
    seedArtist({ qq_number: '99004', subdomain: 'p314-lookup-set' })
    const res = await app.inject({ method: 'GET', url: '/api/orders/lookup?subdomain=p314-lookup-set&qq=123457' })
    expect(res.statusCode).toBe(410)
    expect(res.json().code).toBe('LOOKUP_RETIRED')
  })
})
