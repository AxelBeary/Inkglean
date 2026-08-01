import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'

const AUTH_PREFIX = 'Bearer '

describe('SPEC-003 附加工作项 (Extra Items)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 辅助 ───

  function makeArtist(qq = '88001', sub = 'extra-test') {
    return seedArtist({ qq_number: qq, subdomain: sub })
  }

  function authH(artist) {
    const token = createSession(artist.id, artist.token_version)
    return { Authorization: AUTH_PREFIX + token }
  }

  function makeOrder(artistId, overrides = {}) {
    return seedOrder(artistId, overrides)
  }

  // ─── 1. 正常添加 ───

  it('TC-EI-01: 添加附加项 → extraItems + final_price_cents 重算', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    // 设置 total_price_cents
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '加一把武器', priceCents: 5000 }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.extraItems).toHaveLength(1)
    expect(body.extraItems[0].name).toBe('加一把武器')
    expect(body.extraItems[0].price_cents).toBe(5000)
    expect(body.final_price_cents).toBe(55000)
  })

  // ─── 2. 多项累加 ───

  it('TC-EI-02: 添加 3 项 → final = base + Σ3项', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 30000, final_price_cents = 30000 WHERE id = ?').run(order.id)

    for (const [name, cents] of [['武器', 5000], ['背景', 3000], ['特效', 2000]]) {
      await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/extra-items`,
        headers: authH(artist),
        payload: { name, priceCents: cents }
      })
    }

    const row = db.prepare('SELECT final_price_cents FROM orders WHERE id = ?').get(order.id)
    expect(row.final_price_cents).toBe(40000) // 30000 + 5000 + 3000 + 2000
  })

  // ─── 3. 删除重算 ───

  it('TC-EI-03: 删除 1 项 → final 减少对应金额', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    // 添加 2 项
    await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '武器', priceCents: 5000 }
    })
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '背景', priceCents: 3000 }
    })
    const items = res2.json().extraItems
    expect(items).toHaveLength(2)

    // 删除第一项
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/extra-items/${items[0].id}`,
      headers: authH(artist)
    })
    expect(delRes.statusCode).toBe(200)
    expect(delRes.json().final_price_cents).toBe(53000) // 50000 + 3000
  })

  // ─── 4. 全部删除 ───

  it('TC-EI-04: 全部删除 → final 回退到 total_price_cents', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '武器', priceCents: 5000 }
    })
    const itemId = addRes.json().extraItems[0].id

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/extra-items/${itemId}`,
      headers: authH(artist)
    })
    expect(delRes.json().final_price_cents).toBe(50000)
    expect(delRes.json().extraItems).toHaveLength(0)
  })

  // ─── 5. 无价格订单 ───

  it('TC-EI-05: total_price_cents=null → final = Σ附加项', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    // 手动录单无价格
    db.prepare('UPDATE orders SET total_price_cents = NULL, final_price_cents = NULL WHERE id = ?').run(order.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '武器', priceCents: 5000 }
    })
    expect(res.json().final_price_cents).toBe(5000) // 0 + 5000
  })

  // ─── 6. 终态拒绝 ───

  it('TC-EI-06: delivered/cancelled 订单添加 → 400', async () => {
    const artist = makeArtist()

    for (const status of ['delivered', 'cancelled']) {
      const order = makeOrder(artist.id, { status })
      const res = await app.inject({
        method: 'POST',
        url: `/api/artist/orders/${order.id}/extra-items`,
        headers: authH(artist),
        payload: { name: '武器', priceCents: 5000 }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('ORDER_FINAL_STATE')
    }
  })

  // ─── 7. 数量上限 ───

  it('TC-EI-07: 第 21 项 → 400', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)

    // 插入 20 条
    for (let i = 0; i < 20; i++) {
      db.prepare('INSERT INTO order_extra_items (order_id, name, price_cents) VALUES (?, ?, ?)').run(order.id, `item${i}`, 100)
    }

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '第21项', priceCents: 100 }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('EXTRA_ITEM_LIMIT')
  })

  // ─── 8. 非归属拒绝 ───

  it('TC-EI-08: 画师 A 操作画师 B 的订单 → 404', async () => {
    const artistA = makeArtist('88001', 'artist-a')
    const artistB = makeArtist('88002', 'artist-b')
    const orderB = makeOrder(artistB.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${orderB.id}/extra-items`,
      headers: authH(artistA),
      payload: { name: '武器', priceCents: 5000 }
    })
    expect(res.statusCode).toBe(404)
  })

  // ─── 9. 系统备注 ───

  it('TC-EI-09: 添加/删除后 notes 含 📎 记录', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    // 添加
    const addRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '加一把武器', priceCents: 5000 }
    })
    const notes = addRes.json().notes
    const addNote = notes.find(n => n.content.includes('📎') && n.content.includes('加一把武器'))
    expect(addNote).toBeTruthy()
    expect(addNote.created_by).toBe('system')
    expect(addNote.content).toContain('+')

    // 删除
    const itemId = addRes.json().extraItems[0].id
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/extra-items/${itemId}`,
      headers: authH(artist)
    })
    const delNotes = delRes.json().notes
    const delNote = delNotes.find(n => n.content.includes('📎') && n.content.includes('移除'))
    expect(delNote).toBeTruthy()
    expect(delNote.content).toContain('-')
  })

  // ─── 10. 客户进度页 ───

  it('TC-EI-10: track 接口返回 extraItems + finalPriceCents + installments', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    const order = makeOrder(artist.id, { order_no: 'TEST-EI10', client_qq: '99001' })
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000 WHERE id = ?').run(order.id)

    // 添加附加项
    await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '加一把武器', description: '内部备注不给客户看', priceCents: 5000 }
    })

    // 客户查询
    const res = await app.inject({
      method: 'GET',
      url: '/api/orders/track/TEST-EI10?qq=99001'
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()

    // 客户可见
    expect(body.extraItems).toEqual([{ name: '加一把武器', priceCents: 5000 }])
    expect(body.finalPriceCents).toBe(55000)
    expect(body.installments).toBeDefined()

    // 客户不可见
    expect(body.extraItems[0].description).toBeUndefined()
    expect(body.extraItems[0].id).toBeUndefined()
    expect(body.extraItems[0].created_at).toBeUndefined()
  })

  // ─── 11. 迁移幂等 ───

  it('TC-EI-11: 迁移 v18 幂等（重复执行不报错）', async () => {
    // initDatabase 在 setup.js 已执行一次，再执行一次不报错
    const { initDatabase } = await import('../src/db/init.js')
    expect(() => initDatabase(db)).not.toThrow()

    // 表仍存在
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_extra_items'").all()
    expect(tables).toHaveLength(1)
  })

  // ─── P0-2: 加减法保护手动改价 ───

  it('TC-EI-P02: 手动改价 → 加增项 → final = 手动价 + 增项（不覆盖）', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 400000, final_price_cents = 400000 WHERE id = ?').run(order.id)

    const h = authH(artist)
    // 手动改价到 500000
    await app.inject({ method: 'PUT', url: `/api/artist/orders/${order.id}/price`, headers: h, payload: { finalPriceCents: 500000 } })

    // 加一个 10000 的增项
    const res = await app.inject({ method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`, headers: h, payload: { name: '加急', priceCents: 10000 } })
    const body = JSON.parse(res.body)

    // final 应该是 500000 + 10000 = 510000，不是 400000 + 10000
    expect(body.final_price_cents).toBe(510000)
  })

  it('TC-EI-P02b: 手动改价 → 删增项 → final = 手动价 - 增项', async () => {
    const artist = makeArtist()
    const order = makeOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 400000, final_price_cents = 400000 WHERE id = ?').run(order.id)

    const h = authH(artist)
    // 先加增项
    const addRes = await app.inject({ method: 'POST', url: `/api/artist/orders/${order.id}/extra-items`, headers: h, payload: { name: '加急', priceCents: 10000 } })
    const added = JSON.parse(addRes.body)
    const itemId = added.extraItems[0].id

    // 手动改价到 500000
    await app.inject({ method: 'PUT', url: `/api/artist/orders/${order.id}/price`, headers: h, payload: { finalPriceCents: 500000 } })

    // 删除增项
    const delRes = await app.inject({ method: 'DELETE', url: `/api/artist/orders/${order.id}/extra-items/${itemId}`, headers: h })
    const body = JSON.parse(delRes.body)

    // final 应该是 500000 - 10000 = 490000
    expect(body.final_price_cents).toBe(490000)
  })
})
