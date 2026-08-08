import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist, seedOrder } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { seedArtistStages } from '../src/features/artist/workflow.service.js'
import { buildApp } from '../src/app.js'

const AUTH_PREFIX = 'Bearer '

describe('SPEC-004 名额与缓冲系统', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function makeArtist(overrides = {}) {
    return seedArtist({ qq_number: '88010', subdomain: 'batch-test', ...overrides })
  }

  function authH(artist) {
    const token = createSession(artist.id, artist.token_version)
    return { Authorization: AUTH_PREFIX + token }
  }

  function setBatchLimit(artistId, N, M = 0, autoPromote = 0) {
    db.prepare('UPDATE artists SET batch_limit = ?, buffer_limit = ?, auto_promote = ? WHERE id = ?')
      .run(N, M, autoPromote, artistId)
  }

  function makeOrder(artistId, overrides = {}) {
    return seedOrder(artistId, overrides)
  }

  // ─── 1. 正常下单（正式） ───

  it('TC-BB-01: 正式 < N → queue_zone=formal', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 3, 5)

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99010', agreeRules: true }
    })
    expect(res.statusCode).toBe(200)
    const order = db.prepare('SELECT queue_zone FROM orders WHERE order_no = ?').get(res.json().orderNo)
    expect(order.queue_zone).toBe('formal')
  })

  // ─── 2. 正常下单（缓冲） ───

  it('TC-BB-02: 正式 ≥ N，缓冲 < M → queue_zone=buffer', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 1, 5)
    // 占满正式区
    makeOrder(artist.id, { status: 'pending', queue_zone: 'formal' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99011', agreeRules: true }
    })
    expect(res.statusCode).toBe(200)
    const order = db.prepare('SELECT queue_zone FROM orders WHERE order_no = ?').get(res.json().orderNo)
    expect(order.queue_zone).toBe('buffer')
  })

  // ─── 3. 接满拒绝 ───

  it('TC-BB-03: 正式 ≥ N，缓冲 ≥ M → 400 BATCH_FULL', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 1, 1)
    makeOrder(artist.id, { status: 'pending', queue_zone: 'formal' })
    makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99012', agreeRules: true }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('BATCH_FULL')
  })

  // ─── 4. N=0 申请制 ───

  it('TC-BB-04: N=0 → 所有订单进缓冲区', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 0, 10)

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99013', agreeRules: true }
    })
    expect(res.statusCode).toBe(200)
    const order = db.prepare('SELECT queue_zone FROM orders WHERE order_no = ?').get(res.json().orderNo)
    expect(order.queue_zone).toBe('buffer')
  })

  // ─── 5. 手动递补 ───

  it('TC-BB-05: POST promote → queue_zone 变 formal', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    const order = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/promote`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)
    const updated = db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(order.id)
    expect(updated.queue_zone).toBe('formal')
    // 系统备注
    const notes = db.prepare("SELECT * FROM order_notes WHERE order_id = ? AND created_by = 'system'").all(order.id)
    expect(notes.some(n => n.content.includes('📋'))).toBe(true)
  })

  // ─── 6. 自动递补 ───

  it('TC-BB-06: auto_promote=1，完成一单 → 缓冲[0]自动递补', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 1, 5, 1) // auto_promote=1

    const formal = makeOrder(artist.id, { status: 'wip', queue_zone: 'formal' })
    const buffer = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })

    // 完成正式区订单
    await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${formal.id}/status`,
      headers: authH(artist),
      payload: { status: 'done' }
    })
    await app.inject({
      method: 'PUT',
      url: `/api/artist/orders/${formal.id}/status`,
      headers: authH(artist),
      payload: { status: 'delivered' }
    })

    // 缓冲区订单应自动递补
    const updated = db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(buffer.id)
    expect(updated.queue_zone).toBe('formal')
  })

  // ─── 7. 递补通知开关 ───

  it('TC-BB-07: hide_promote_notify=1 → 不通知（系统备注仍写）', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    db.prepare('UPDATE artists SET hide_promote_notify = 1 WHERE id = ?').run(artist.id)
    const order = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/promote`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)
    // 系统备注仍然写入（通知是前端/机器人层面的事）
    const notes = db.prepare("SELECT * FROM order_notes WHERE order_id = ? AND created_by = 'system'").all(order.id)
    expect(notes.some(n => n.content.includes('📋'))).toBe(true)
  })

  // ─── 8. 排队位次显示 ───

  it('TC-BB-08: hide_queue_position 控制位次显示', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 0, 10)

    // 创建 2 个缓冲订单
    makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer', order_no: 'BT-001', client_qq: '99020' })
    makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer', order_no: 'BT-002', client_qq: '99021' })

    // 默认显示位次
    let res = await app.inject({ method: 'GET', url: '/api/orders/track/BT-001?qq=99020' })
    expect(res.json().queueDisplay).toBe('排队中（第 1 位）')

    // 隐藏位次
    db.prepare('UPDATE artists SET hide_queue_position = 1 WHERE id = ?').run(artist.id)
    res = await app.inject({ method: 'GET', url: '/api/orders/track/BT-001?qq=99020' })
    expect(res.json().queueDisplay).toBe('排队中')
  })

  // ─── 9. 画师调大 N ───

  it('TC-BB-09: 调大 N（1→3）+ auto_promote=1 → 缓冲前 2 名递补', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 1, 10, 1)

    makeOrder(artist.id, { status: 'wip', queue_zone: 'formal' })
    const b1 = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })
    const b2 = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })
    const b3 = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })

    // 调大 N 到 3
    await app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: authH(artist),
      payload: { batchLimit: 3 }
    })

    expect(db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(b1.id).queue_zone).toBe('formal')
    expect(db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(b2.id).queue_zone).toBe('formal')
    expect(db.prepare('SELECT queue_zone FROM orders WHERE id = ?').get(b3.id).queue_zone).toBe('buffer')
  })

  // ─── 10. 画师调小 N ───

  it('TC-BB-10: 调小 N（5→3）→ 不踢人', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 5, 10)

    // 5 个正式区订单
    for (let i = 0; i < 5; i++) {
      makeOrder(artist.id, { status: 'wip', queue_zone: 'formal' })
    }

    // 调小 N 到 3
    await app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: authH(artist),
      payload: { batchLimit: 3 }
    })

    // 所有 5 个仍在正式区
    const formalCount = db.prepare("SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered','cancelled')").get(artist.id).c
    expect(formalCount).toBe(5)
  })

  // ─── 11. 缓冲客户取消 ───

  it('TC-BB-11: 缓冲客户取消 → 队列顺移', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 0, 10)

    makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer', order_no: 'BT-010', client_qq: '99030', queue_position: 1 })
    makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer', order_no: 'BT-011', client_qq: '99031', queue_position: 2 })

    // 取消第一个
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE order_no = 'BT-010'").run()

    // 第二个位次查询
    const res = await app.inject({ method: 'GET', url: '/api/orders/track/BT-011?qq=99031' })
    expect(res.json().queueDisplay).toBe('排队中（第 1 位）')
  })

  // ─── 12. 画师直接接缓冲单 ───

  it('TC-BB-12: 递补允许超出 N', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 1, 10)

    makeOrder(artist.id, { status: 'wip', queue_zone: 'formal' })
    const b1 = makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })

    // 手动递补（正式区已满 1/1）
    const res = await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${b1.id}/promote`,
      headers: authH(artist)
    })
    expect(res.statusCode).toBe(200)
    // 正式区现在有 2 个（超出 N=1，允许）
    const formalCount = db.prepare("SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered','cancelled')").get(artist.id).c
    expect(formalCount).toBe(2)
  })

  // ─── 13. 缓冲简短表单 ───

  it('TC-BB-13: buffer_short_form=1 → 标记可用（前端消费）', async () => {
    const artist = makeArtist()
    db.prepare('UPDATE artists SET buffer_short_form = 1 WHERE id = ?').run(artist.id)

    // 公开主页不直接返回 buffer_short_form（这是画师设置），但画师 profile 可见
    const profRes = await app.inject({
      method: 'GET',
      url: '/api/artist/profile',
      headers: authH(artist)
    })
    expect(profRes.json().buffer_short_form).toBe(1)
  })

  // ─── 14. 缓冲不付定金 ───

  it('TC-BB-14: 缓冲订单无付款节点', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 0, 10)

    // 创建有价格的尺寸（SPEC-PRICE-2）
    db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artist.id)
    const style = db.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artist.id)
    db.prepare("INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, '测试档', 100, 1)").run(style.id)
    const size = db.prepare('SELECT id FROM style_sizes WHERE art_style_id = ?').get(style.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99040', agreeRules: true, styleSizeId: size.id }
    })
    expect(res.statusCode).toBe(200)
    const orderNo = res.json().orderNo
    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo)
    expect(order.queue_zone).toBe('buffer')

    // 无付款节点
    const instCount = db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(order.id).c
    expect(instCount).toBe(0)
  })

  // ─── 15. 递补后生成付款 ───

  it('TC-BB-15: 递补进正式 → 按报价快照生成付款节点', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 0, 10)

    db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artist.id)
    const style = db.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artist.id)
    db.prepare("INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, '测试档', 100, 1)").run(style.id)
    const size = db.prepare('SELECT id FROM style_sizes WHERE art_style_id = ?').get(style.id)

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99041', agreeRules: true, styleSizeId: size.id }
    })
    const orderNo = res.json().orderNo
    const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo)

    // 递补
    await app.inject({
      method: 'POST',
      url: `/api/artist/orders/${order.id}/promote`,
      headers: authH(artist)
    })

    // 有付款节点了
    const instCount = db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(order.id).c
    expect(instCount).toBeGreaterThan(0)
  })

  // ─── 16. 名额显示 ───

  it('TC-BB-16: slotDisplay 各状态正确', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    setBatchLimit(artist.id, 3, 5)

    // open + 正式 < N
    let res = await app.inject({ method: 'GET', url: '/api/artists/batch-test' })
    expect(res.json().slotDisplay).toBe('开放中 · 剩 3 席')

    // 占 2 个正式
    makeOrder(artist.id, { status: 'wip', queue_zone: 'formal' })
    makeOrder(artist.id, { status: 'pending', queue_zone: 'formal' })
    res = await app.inject({ method: 'GET', url: '/api/artists/batch-test' })
    expect(res.json().slotDisplay).toBe('开放中 · 剩 1 席')

    // 正式满，缓冲未满
    makeOrder(artist.id, { status: 'pending', queue_zone: 'formal' })
    res = await app.inject({ method: 'GET', url: '/api/artists/batch-test' })
    expect(res.json().slotDisplay).toBe('可候补')

    // 全满
    for (let i = 0; i < 5; i++) makeOrder(artist.id, { status: 'pending', queue_zone: 'buffer' })
    res = await app.inject({ method: 'GET', url: '/api/artists/batch-test' })
    expect(res.json().slotDisplay).toBe('已接满')
  })

  // ─── 17. 兼容（batch_limit=NULL） ───

  it('TC-BB-17: 不设名额 → 行为与现有一致', async () => {
    const artist = makeArtist()
    seedArtistStages(artist.id)
    // batch_limit 默认 NULL

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { subdomain: 'batch-test', clientQq: '99050', agreeRules: true }
    })
    expect(res.statusCode).toBe(200)
    const order = db.prepare('SELECT queue_zone FROM orders WHERE order_no = ?').get(res.json().orderNo)
    expect(order.queue_zone).toBe('formal')

    // 主页不显示名额
    const homeRes = await app.inject({ method: 'GET', url: '/api/artists/batch-test' })
    expect(homeRes.json().slotDisplay).toBeNull()
    expect(homeRes.json().batchLimit).toBeNull()
  })

  // ─── 18. 校验 N+M < 1 ───

  it('TC-BB-18: N=0 + M=0 → 400 INVALID_BATCH_LIMIT', async () => {
    const artist = makeArtist()

    const res = await app.inject({
      method: 'PUT',
      url: '/api/artist/profile',
      headers: authH(artist),
      payload: { batchLimit: 0, bufferLimit: 0 }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_BATCH_LIMIT')
  })
})
