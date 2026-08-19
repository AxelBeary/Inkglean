import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, seedOrder, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

describe('#35 开工日/截稿日交叉校验', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ logger: false })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    cleanDb()
  })

  function tokenFor(artist: ArtistRow): string {
    return createSession(artist.id, artist.token_version ?? 0)
  }

  it('TC-35-01: startDate > deadline → 400', async () => {
    const artist = seedArtist({ qq_number: '35001', subdomain: 'x35a' })
    const order = seedOrder(artist.id, { status: 'pending' })
    db.prepare('UPDATE orders SET deadline = ? WHERE id = ?').run('2026-08-10 00:00:00', order.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/start-date`,
      headers: { authorization: `Bearer ${tokenFor(artist)}` },
      payload: { startDate: '2026-08-15' }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_START_DATE')
  })

  it('TC-35-02: startDate <= deadline → 200', async () => {
    const artist = seedArtist({ qq_number: '35002', subdomain: 'x35b' })
    const order = seedOrder(artist.id, { status: 'pending' })
    db.prepare('UPDATE orders SET deadline = ? WHERE id = ?').run('2026-08-10 00:00:00', order.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/start-date`,
      headers: { authorization: `Bearer ${tokenFor(artist)}` },
      payload: { startDate: '2026-08-05' }
    })
    expect(res.statusCode).toBe(200)
  })

  it('TC-35-03: deadline < startDate → 400（反向校验）', async () => {
    const artist = seedArtist({ qq_number: '35003', subdomain: 'x35c' })
    const order = seedOrder(artist.id, { status: 'pending' })
    db.prepare('UPDATE orders SET start_date = ? WHERE id = ?').run('2026-08-10', order.id)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/deadline`,
      headers: { authorization: `Bearer ${tokenFor(artist)}` },
      payload: { deadline: '2026-08-05' }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-35-04: 无 deadline 时 startDate 不受限 → 200', async () => {
    const artist = seedArtist({ qq_number: '35004', subdomain: 'x35d' })
    const order = seedOrder(artist.id, { status: 'pending' })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/start-date`,
      headers: { authorization: `Bearer ${tokenFor(artist)}` },
      payload: { startDate: '2026-12-31' }
    })
    expect(res.statusCode).toBe(200)
  })
})
