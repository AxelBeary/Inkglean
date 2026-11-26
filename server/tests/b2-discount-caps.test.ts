import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import * as discountService from '../src/features/pricing/discount.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

// MN-1: 固定金额折扣码上限前后端不一致——路由 schema 按 discountType 分档（percent ≤100 / fixed ≤99999）
describe('MN-1 折扣码金额上限分档', () => {
  let artist: ArtistRow
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    artist = seedArtist()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  const headers = () => ({ Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` })
  const post = (payload: Record<string, unknown>) => app.inject({
    method: 'POST', url: '/api/artist/discount-codes', headers: headers(), payload
  })

  it('TC-B2-MN1-01: fixed=200 通过、fixed=100000 拒绝', async () => {
    expect((await post({ code: 'FIXED200', discountType: 'fixed', discountValue: 200 })).statusCode).toBe(200)
    expect((await post({ code: 'FIXED100K', discountType: 'fixed', discountValue: 100000 })).statusCode).toBe(400)
  })

  it('TC-B2-MN1-02: percent=100 通过、percent=101 拒绝', async () => {
    expect((await post({ code: 'PCT100', discountType: 'percent', discountValue: 100 })).statusCode).toBe(200)
    expect((await post({ code: 'PCT101', discountType: 'percent', discountValue: 101 })).statusCode).toBe(400)
  })

  it('TC-B2-MN1-03: PUT 无类型字段，fixed 提到 200 通过、100000 仍拒绝', async () => {
    const dc = discountService.createDiscountCode(artist.id, { code: 'PUT200', discountType: 'fixed', discountValue: 100 })
    const put = (discountValue: number) => app.inject({
      method: 'PUT', url: `/api/artist/discount-codes/${dc.id}`, headers: headers(), payload: { discountValue }
    })
    expect((await put(200)).statusCode).toBe(200)
    expect((await put(100000)).statusCode).toBe(400)
  })

  it('TC-B2-MN1-04: fixed 元 → 分半分误差修正（1.005 元 → 101 分）', () => {
    const dc = discountService.createDiscountCode(artist.id, { code: 'HALF', discountType: 'fixed', discountValue: 1.005 })
    expect(discountService.computeDiscountCents(dc, 10000)).toBe(101)
  })
})
