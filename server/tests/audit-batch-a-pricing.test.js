import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as discountService from '../src/features/pricing/discount.service.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

/**
 * audit-a P2-4: 折扣码 expires_at 非法日期永不过期
 */

describe('audit-a P2-4 折扣码过期时间校验', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
  })

  it('TC-P24-01: 创建折扣码拒绝非法 expiresAt（服务层兜底）', () => {
    expect(() => discountService.createDiscountCode(artist.id, {
      code: 'SAVE10',
      discountType: 'percent',
      discountValue: 10,
      expiresAt: 'not-a-date'
    })).toThrow('VALIDATION')
    expect(() => discountService.createDiscountCode(artist.id, {
      code: 'SAVE11',
      discountType: 'percent',
      discountValue: 10,
      expiresAt: '2026-13-45'
    })).toThrow('VALIDATION')
  })

  it('TC-P24-02: 更新折扣码拒绝非法 expiresAt（服务层兜底）', () => {
    const dc = discountService.createDiscountCode(artist.id, {
      code: 'SAVE20',
      discountType: 'percent',
      discountValue: 10
    })
    expect(() => discountService.updateDiscountCode(artist.id, dc.id, {
      expiresAt: 'garbage'
    })).toThrow('VALIDATION')
    // 库中值未被污染
    const row = db.prepare('SELECT expires_at FROM discount_codes WHERE id = ?').get(dc.id)
    expect(row.expires_at).toBeNull()
  })

  it('TC-P24-03: 合法 YYYY-MM-DD 与 ISO 8601 均可写入', () => {
    const dc = discountService.createDiscountCode(artist.id, {
      code: 'SAVE30',
      discountType: 'percent',
      discountValue: 10,
      expiresAt: '2026-12-31'
    })
    expect(dc.expires_at).toBe('2026-12-31')
    const dc2 = discountService.createDiscountCode(artist.id, {
      code: 'SAVE31',
      discountType: 'percent',
      discountValue: 10,
      expiresAt: '2026-12-31T23:59:59Z'
    })
    expect(dc2.expires_at).toBe('2026-12-31T23:59:59Z')
  })

  it('TC-P24-04: 存量脏数据 expires_at 不可解析 → 按已过期处理（fail-closed）', () => {
    db.prepare(`
      INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, expires_at, enabled)
      VALUES (?, 'DIRTY1', 'percent', 10, 'not-a-date', 1)
    `).run(artist.id)
    expect(() => discountService.validateDiscountCode(artist.id, 'DIRTY1')).toThrow('DISCOUNT_CODE_EXPIRED')
  })

  it('TC-P24-05: 路由 schema 拒绝非法 expiresAt（POST/PUT 400）', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    const postRes = await app.inject({
      method: 'POST',
      url: '/api/artist/discount-codes',
      headers,
      payload: { code: 'ROUTE1', discountValue: 10, expiresAt: 'not-a-date' }
    })
    expect(postRes.statusCode).toBe(400)

    const dc = discountService.createDiscountCode(artist.id, {
      code: 'ROUTE2',
      discountType: 'percent',
      discountValue: 10
    })
    const putRes = await app.inject({
      method: 'PUT',
      url: `/api/artist/discount-codes/${dc.id}`,
      headers,
      payload: { expiresAt: 'garbage' }
    })
    expect(putRes.statusCode).toBe(400)
    await app.close()
  })
})
