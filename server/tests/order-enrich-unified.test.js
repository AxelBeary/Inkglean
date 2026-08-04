import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'

// ─────────────────────────────────────────────────────────
// B1：订单响应增强统一
// 根因：变更端点只 signOrderUrls，不含 paidTotalCents/installments 等增强字段，
// 前端 order.value = await artistApi.xxx() 覆盖后收款区归零。
// 本文件覆盖：GET /:id 基准 + 各变更端点响应统一含增强字段且数值正确。
// ─────────────────────────────────────────────────────────

describe('B1 订单响应增强统一 (enrichOrderForArtist)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  // ─── 辅助 ───

  function makeArtist(qq = '88101', sub = 'enrich-test') {
    return seedArtist({ qq_number: qq, subdomain: sub })
  }

  function authH(artist) {
    return { Authorization: `Bearer ${createSession(artist.id, artist.token_version)}` }
  }

  /** 造一个带价格 + 分期节点 + 部分收款的订单（final=50000，已收 20000） */
  function makePaidOrder(artist) {
    const order = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = 50000, final_price_cents = 50000, paid_total_cents = 20000 WHERE id = ?').run(order.id)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(order.id, '定金', 20000, 4000, 1)
    db.prepare('INSERT INTO order_payment_installments (order_id, label, amount_cents, basis_points, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(order.id, '尾款', 30000, 6000, 2)
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)
  }

  /** 断言增强字段齐全且语义与 GET /:id 一致（照抄语义，不许偏差） */
  function expectEnriched(body) {
    expect(body.paidTotalCents).toBeDefined()
    expect(body.remainingCents).toBeDefined()
    expect(body.installments).toBeDefined()
    expect('startDate' in body).toBe(true) // null 也必须在（前端直接读）
  }

  // ─── 0. GET /:id 基准（对照锚点） ───

  it('TC-EN-00: GET /:id 返回增强字段（基准）', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'GET',
      url: `/api/artist/orders/${order.id}`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.paidTotalCents).toBe(20000)
    expect(body.remainingCents).toBe(30000) // 50000 - 20000
    expect(body.installments).toHaveLength(2)
    expect(body.installments[0]).toMatchObject({ name: '定金', amountCents: 20000, paidCents: 20000, status: 'paid' })
    expect(body.installments[1]).toMatchObject({ name: '尾款', amountCents: 30000, paidCents: 0, status: 'pending' })
    expect(body.startDate).toBeNull()
  })

  // ─── 1. POST extra-items（用户报障端点） ───

  it('TC-EN-01: POST extra-items → 响应含 paidTotalCents + installments 且数值正确', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: authH(artist),
      payload: { name: '加一把武器', priceCents: 5000 }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    // 报障场景：收款区不许归零
    expect(body.paidTotalCents).toBe(20000)
    expect(body.final_price_cents).toBe(55000) // 50000 + 5000
    expect(body.remainingCents).toBe(35000) // 55000 - 20000
    expect(body.installments).toHaveLength(2)
    // REQ-025 R4/R5: 定金已付清（paid_total 20000 覆盖定金 20000）→ paidOff 锁定，
    // 加项 delta 5000 全摊唯一未锁节点（尾款）→ 定金保持 20000/paid，尾款 30000→35000
    expect(body.installments[0]).toMatchObject({ name: '定金', amountCents: 20000, paidCents: 20000, status: 'paid' })
    expect(body.installments[1]).toMatchObject({ name: '尾款', amountCents: 35000, paidCents: 0, status: 'pending' })
  })

  // ─── 2. PUT price ───

  it('TC-EN-02: PUT price → 响应含 paidTotalCents + installments 且数值正确', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/price`,
      headers: authH(artist),
      payload: { finalPriceCents: 80000 }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    expect(body.paidTotalCents).toBe(20000)
    expect(body.remainingCents).toBe(60000) // 80000 - 20000
    expect(body.installments).toHaveLength(2)
  })

  // ─── 3. DELETE extra-items ───

  it('TC-EN-03: DELETE extra-items → 响应保持增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)
    const h = authH(artist)

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/extra-items`,
      headers: h,
      payload: { name: '武器', priceCents: 5000 }
    })
    const itemId = addRes.json().extraItems[0].id

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/extra-items/${itemId}`,
      headers: h
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    expect(body.paidTotalCents).toBe(20000)
    expect(body.final_price_cents).toBe(50000)
    expect(body.remainingCents).toBe(30000)
  })

  // ─── 4. PUT deadline / start-date / status / priority ───

  it('TC-EN-04: PUT deadline → 响应保持增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/deadline`,
      headers: authH(artist),
      payload: { deadline: '2026-09-01T00:00:00.000Z' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    expect(body.paidTotalCents).toBe(20000)
    expect(body.installments).toHaveLength(2)
  })

  it('TC-EN-05: PUT start-date → startDate camelCase 映射正确', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/start-date`,
      headers: authH(artist),
      payload: { startDate: '2026-08-01' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    expect(body.startDate).toBe('2026-08-01') // snake_case → camelCase（v0.19 教训）
    expect(body.paidTotalCents).toBe(20000)
  })

  it('TC-EN-06: PUT status → 响应保持增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/status`,
      headers: authH(artist),
      payload: { status: 'confirmed' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    expect(body.paidTotalCents).toBe(20000)
    expect(body.installments).toHaveLength(2)
  })

  it('TC-EN-07: PUT priority → 响应保持增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/priority`,
      headers: authH(artist),
      payload: { priority: 'high' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expectEnriched(body)
    expect(body.paidTotalCents).toBe(20000)
  })

  // ─── 5. 备注增删 ───

  it('TC-EN-08: POST/DELETE notes → 响应保持增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)
    const h = authH(artist)

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/notes`,
      headers: h,
      payload: { content: '测试备注' }
    })
    expect(addRes.statusCode).toBe(200)
    expectEnriched(addRes.json())
    expect(addRes.json().paidTotalCents).toBe(20000)

    const noteId = addRes.json().notes.find(n => n.content === '测试备注').id
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/notes/${noteId}`,
      headers: h
    })
    expect(delRes.statusCode).toBe(200)
    expectEnriched(delRes.json())
    expect(delRes.json().paidTotalCents).toBe(20000)
  })

  // ─── 6. 流程状态机三端点 ───

  it('TC-EN-09: PUT stage / track-on / stage-back → 响应保持增强字段', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    const stages = db.prepare('SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC').all(artist.id)
    expect(stages.length).toBeGreaterThanOrEqual(2)
    const order = makePaidOrder(artist)
    const h = authH(artist)

    // 开启跟踪
    const onRes = await app.inject({ method: 'PUT', url: `/api/artist/orders/${order.id}/track-on`, headers: h })
    expect(onRes.statusCode).toBe(200)
    expectEnriched(onRes.json())
    expect(onRes.json().paidTotalCents).toBe(20000)

    // 推进到第二节点
    const advRes = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/stage`,
      headers: h,
      payload: { stageId: stages[1].id }
    })
    expect(advRes.statusCode).toBe(200)
    expectEnriched(advRes.json())
    expect(advRes.json().paidTotalCents).toBe(20000)
    expect(advRes.json().installments).toHaveLength(2)

    // 打回第一节点
    const backRes = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/stage-back`,
      headers: h,
      payload: { stageId: stages[0].id }
    })
    expect(backRes.statusCode).toBe(200)
    expectEnriched(backRes.json())
    expect(backRes.json().paidTotalCents).toBe(20000)
  })

  // ─── 7. 参考图增删 + 焦点图 ───

  it('TC-EN-10: POST references / PUT focus-image / DELETE references → 响应保持增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)
    const h = authH(artist)

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/references`,
      headers: h,
      payload: { filePath: 'references/test-a.png', fileName: 'a.png', fileSize: 100 }
    })
    expect(addRes.statusCode).toBe(200)
    expectEnriched(addRes.json())
    expect(addRes.json().paidTotalCents).toBe(20000)

    const refId = addRes.json().references[0].id

    const focusRes = await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${order.id}/focus-image`,
      headers: h,
      payload: { imagePath: 'references/test-a.png', mode: 'small' }
    })
    expect(focusRes.statusCode).toBe(200)
    expectEnriched(focusRes.json())
    expect(focusRes.json().paidTotalCents).toBe(20000)

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/artist/orders/${order.id}/references/${refId}`,
      headers: h
    })
    expect(delRes.statusCode).toBe(200)
    expectEnriched(delRes.json())
    expect(delRes.json().paidTotalCents).toBe(20000)
  })

  // ─── 8. 边界：无价格订单 remainingCents=null（照抄 GET /:id 语义） ───

  it('TC-EN-11: final/total 均 NULL → remainingCents=null、paidTotalCents=0', async () => {
    const artist = makeArtist()
    const order = seedOrder(artist.id)
    db.prepare('UPDATE orders SET total_price_cents = NULL, final_price_cents = NULL WHERE id = ?').run(order.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/notes`,
      headers: authH(artist),
      payload: { content: '无价格订单备注' }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.paidTotalCents).toBe(0)
    expect(body.remainingCents).toBeNull()
    expect(body.installments).toEqual([])
  })

  // ─── 9. 交付端点（嵌套在 statusChanged 旁） ───

  it('TC-EN-12: POST deliver-no-file → order 部分含增强字段', async () => {
    const artist = makeArtist()
    const order = makePaidOrder(artist)
    db.prepare("UPDATE orders SET status = 'done' WHERE id = ?").run(order.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/deliver-no-file`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.statusChanged).toBeDefined()
    expect(body.paidTotalCents).toBe(20000)
    expect(body.installments).toHaveLength(2)
  })
})
