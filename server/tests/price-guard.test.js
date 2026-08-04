import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'

const AUTH_PREFIX = 'Bearer '

/**
 * v0.37 价格守卫批：updateFinalPrice / deleteExtraItem 终态守卫
 * 边界演进：
 * - 五号先行批：只拦 delivered/cancelled；done 暂不拦（当时是唯一减价窗口）
 * - REQ-025 第二阶段（本次）：负增项机制上线后，done 改为半终态守卫——
 *   禁止无痕改总价（PRICE_CHANGE_AFTER_DONE），加/减附加项仍允许（R13 用户拍板）
 */
describe('v0.37 价格守卫 (Price Guard)', () => {
  let app
  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function makeArtist(qq = '88101', sub = 'price-guard') {
    return seedArtist({ qq_number: qq, subdomain: sub })
  }

  function authH(artist) {
    const token = createSession(artist.id, artist.token_version)
    return { authorization: `${AUTH_PREFIX}${token}` }
  }

  function putPrice(app, orderId, headers, cents = 60000) {
    return app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${orderId}/price`,
      headers,
      payload: { finalPriceCents: cents }
    })
  }

  // ─── 1. updateFinalPrice 终态守卫 ───

  it('TC-PG-01: delivered 订单改价 → 400 ORDER_FINAL_STATE', async () => {
    const artist = makeArtist()
    const order = seedOrder(artist.id, { status: 'delivered' })

    const res = await putPrice(app, order.id, authH(artist))
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ORDER_FINAL_STATE')

    // 价格未被改动
    const row = db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id)
    expect(row.final_price_cents).not.toBe(60000)
  })

  it('TC-PG-02: cancelled 订单改价 → 400 ORDER_FINAL_STATE', async () => {
    const artist = makeArtist()
    const order = seedOrder(artist.id, { status: 'cancelled' })

    const res = await putPrice(app, order.id, authH(artist))
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ORDER_FINAL_STATE')
  })

  it('TC-PG-03: done 订单无痕改价 → 400 PRICE_CHANGE_AFTER_DONE（R13 半终态守卫，REQ-025 第二阶段）', async () => {
    const artist = makeArtist()
    const order = seedOrder(artist.id, { status: 'done' })

    const res = await putPrice(app, order.id, authH(artist), 50000)
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('PRICE_CHANGE_AFTER_DONE')
  })

  it('TC-PG-04: wip 订单改价 → 200（回归：非终态不受影响）', async () => {
    const artist = makeArtist()
    const order = seedOrder(artist.id, { status: 'wip' })

    const res = await putPrice(app, order.id, authH(artist), 70000)
    expect(res.statusCode).toBe(200)
    expect(res.json().final_price_cents).toBe(70000)
  })

  // ─── 2. deleteExtraItem 终态守卫 ───

  async function seedOrderWithItem(artist, status) {
    // 先在 pending 态添加附加项（addExtraItem 有守卫，终态无法直接添加）
    const order = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '武器', priceCents: 5000 }
    })
    expect(addRes.statusCode).toBe(200)
    const itemId = addRes.json().extraItems[0].id
    // 再改状态
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id)
    return { orderId: order.id, itemId }
  }

  it('TC-PG-05: delivered 订单删除附加项 → 400 ORDER_FINAL_STATE', async () => {
    const artist = makeArtist()
    const { orderId, itemId } = await seedOrderWithItem(artist, 'delivered')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${orderId}/extra-items/${itemId}`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ORDER_FINAL_STATE')

    // 附加项未被删除
    const row = db.prepare('SELECT COUNT(*) as c FROM order_extra_items WHERE id = ?').get(itemId)
    expect(row.c).toBe(1)
  })

  it('TC-PG-06: cancelled 订单删除附加项 → 400 ORDER_FINAL_STATE', async () => {
    const artist = makeArtist()
    const { orderId, itemId } = await seedOrderWithItem(artist, 'cancelled')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${orderId}/extra-items/${itemId}`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ORDER_FINAL_STATE')
  })

  it('TC-PG-07: done 订单删除附加项 → 200（有意不拦，同减价窗口）', async () => {
    const artist = makeArtist()
    const { orderId, itemId } = await seedOrderWithItem(artist, 'done')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${orderId}/extra-items/${itemId}`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().extraItems).toHaveLength(0)
  })
})
