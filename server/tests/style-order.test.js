import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as orderService from '../src/features/order/order.service.js'

// ============================================
// 订单创建支持画风模式测试
// REQ-023 Phase 2 - POST /orders 接受 styleSizeId + styleAddons
// ============================================

// ─── 辅助函数 ───

function seedWorkflowStages(artistId) {
  const ins = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, 1, ?)'
  )
  ins.run(artistId, '定金', 1, 3000)
  ins.run(artistId, '尾款', 2, 7000)
}

function seedMultiplier(artistId, type, name, multiplier) {
  const r = db.prepare(
    'INSERT INTO price_multipliers (artist_id, type, name, multiplier, sort_order, enabled) VALUES (?, ?, ?, ?, 0, 1)'
  ).run(artistId, type, name, multiplier)
  return db.prepare('SELECT * FROM price_multipliers WHERE id = ?').get(r.lastInsertRowid)
}

function seedTier(artistId, name, price, sortOrder = 0) {
  const r = db.prepare(
    'INSERT INTO price_tiers (artist_id, name, price, sort_order) VALUES (?, ?, ?, ?)'
  ).run(artistId, name, price, sortOrder)
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(r.lastInsertRowid)
}

/** 搭建标准画风场景：画师 + 画风 + 2尺寸 + 2增项 + 工作流 */
function setupStyleScene() {
  const artist = seedArtist({ qq_number: '88101', subdomain: 'style-order' })
  seedWorkflowStages(artist.id)

  const tplSwitch = styleService.createAddonTemplate(artist.id, {
    name: '加背景', control_type: 'switch', pricing_mode: 'fixed', default_price: 150
  })
  const tplQty = styleService.createAddonTemplate(artist.id, {
    name: '加人', control_type: 'quantity', pricing_mode: 'per_unit', default_price: 100, unit_label: '人'
  })

  const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: true })
  const sizeHead = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
  const sizeBody = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 600 })

  styleService.setStyleAddons(artist.id, style.id, [
    { addon_template_id: tplSwitch.id },
    { addon_template_id: tplQty.id }
  ])
  const styleAddons = styleService.getStyleAddons(style.id)
  const saSwitch = styleAddons.find(a => a.addon_template_id === tplSwitch.id)
  const saQty = styleAddons.find(a => a.addon_template_id === tplQty.id)

  return { artist, style, sizeHead, sizeBody, saSwitch, saQty }
}

// ─── Service 层测试 ───

describe('订单创建画风模式 (createOrder styleSizeId)', () => {
  beforeEach(() => { cleanDb() })

  it('TC-SO-01: 画风模式创建订单 — 有价格 + quote_snapshot', () => {
    const { artist, sizeHead, saSwitch } = setupStyleScene()
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      styleAddons: [{ styleAddonId: saSwitch.id }],
      clientQq: '88201'
    })
    // 200 + 150 = 350 → 35000 分
    expect(order.total_price_cents).toBe(35000)
    expect(order.final_price_cents).toBe(35000)
    expect(order.price_snapshot).toBe(200)
    expect(order.quote_snapshot).toContain('日系')
    expect(order.quote_snapshot).toContain('头像')
    expect(order.quote_snapshot).toContain('加背景')
    expect(order.tier_id).toBeNull()
  })

  it('TC-SO-02: 画风模式 — quantity 增项计价', () => {
    const { artist, sizeBody, saQty } = setupStyleScene()
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeBody.id,
      styleAddons: [{ styleAddonId: saQty.id, quantity: 3 }],
      clientQq: '88202'
    })
    // 600 + 100×3 = 900
    expect(order.total_price_cents).toBe(90000)
    expect(order.quote_snapshot).toContain('加人×3')
  })

  it('TC-SO-03: 画风模式 — 倍率', () => {
    const { artist, sizeHead } = setupStyleScene()
    const um = seedMultiplier(artist.id, 'usage', '商用', 2.0)
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      usageMultiplierId: um.id,
      clientQq: '88203'
    })
    // 200 × 2 = 400
    expect(order.total_price_cents).toBe(40000)
    expect(order.quote_snapshot).toContain('商用')
  })

  it('TC-SO-04: 画风模式 — 折扣码联动', () => {
    const { artist, sizeHead } = setupStyleScene()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'SAVE10', 'percent', 10)").run(artist.id)

    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      discountCode: 'SAVE10',
      clientQq: '88204'
    })
    // 200 - 20 = 180
    expect(order.total_price_cents).toBe(18000)
    expect(order.discount_amount_cents).toBe(2000)
    expect(order.discount_code_id).not.toBeNull()
  })

  it('TC-SO-05: 画风模式 — 生成分期计划', () => {
    const { artist, sizeHead } = setupStyleScene()
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      clientQq: '88205'
    })
    // 工作流有定金30% + 尾款70%
    const installments = db.prepare(
      'SELECT * FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
    ).all(order.id)
    expect(installments).toHaveLength(2)
    expect(installments[0].label).toBe('定金')
    expect(installments[0].amount_cents).toBe(6000) // 200 × 30%
    expect(installments[1].label).toBe('尾款')
    expect(installments[1].amount_cents).toBe(14000) // 200 × 70%
  })

  it('TC-SO-06: 画风模式 — 写 breakdown（tier/addon 语义）', () => {
    const { artist, sizeHead, saSwitch } = setupStyleScene()
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      styleAddons: [{ styleAddonId: saSwitch.id }],
      clientQq: '88206'
    })
    const breakdown = db.prepare(
      'SELECT * FROM order_price_breakdown WHERE order_id = ? ORDER BY sort_order ASC'
    ).all(order.id)
    expect(breakdown.length).toBeGreaterThanOrEqual(2)
    expect(breakdown[0].item_type).toBe('tier')
    expect(breakdown[0].item_name).toContain('日系')
    expect(breakdown[1].item_type).toBe('addon')
  })

  it('TC-SO-07: 旧档位模式不受影响', () => {
    const artist = seedArtist({ qq_number: '88102', subdomain: 'old-model' })
    seedWorkflowStages(artist.id)
    const tier = seedTier(artist.id, '全身', 500)
    const order = orderService.createOrder({
      artistId: artist.id,
      tierId: tier.id,
      clientQq: '88207'
    })
    expect(order.total_price_cents).toBe(50000)
    expect(order.tier_id).toBe(tier.id)
    expect(order.quote_snapshot).toContain('全身')
  })

  it('TC-SO-08: styleSizeId 与 tierId 互斥 → 400', () => {
    const { artist, sizeHead } = setupStyleScene()
    const tier = seedTier(artist.id, '头像', 100)
    expect(() => {
      orderService.createOrder({
        artistId: artist.id,
        tierId: tier.id,
        styleSizeId: sizeHead.id,
        clientQq: '88208'
      })
    }).toThrow('VALIDATION')
  })

  it('TC-SO-09: 无效 styleSizeId → 404', () => {
    const { artist } = setupStyleScene()
    expect(() => {
      orderService.createOrder({
        artistId: artist.id,
        styleSizeId: 99999,
        clientQq: '88209'
      })
    }).toThrow('STYLE_SIZE_NOT_FOUND')
  })

  it('TC-SO-10: 画风模式无增项 — 纯基础价', () => {
    const { artist, sizeHead } = setupStyleScene()
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      clientQq: '88210'
    })
    expect(order.total_price_cents).toBe(20000)
    expect(order.quote_snapshot).toContain('基础¥200')
  })
})

// ─── 路由层集成测试 ───

describe('画风模式下单路由 (POST /api/orders)', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-RT-01: 客户端画风模式下单 → 200 + 价格', async () => {
    const { sizeHead, saSwitch } = setupStyleScene()
    const res = await app.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        subdomain: 'style-order',
        clientQq: '88301',
        agreeRules: true,
        styleSizeId: sizeHead.id,
        styleAddons: [{ styleAddonId: saSwitch.id }]
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalPriceCents).toBe(35000)
    expect(body.orderNo).toBeTruthy()
  })

  it('TC-RT-02: 手动录单画风模式 → 200', async () => {
    const { artist, sizeBody, saQty } = setupStyleScene()
    const token = createSession(artist.id, artist.token_version)
    const res = await app.inject({
      method: 'POST', url: '/api/artist/orders/manual',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        clientQq: '88302',
        styleSizeId: sizeBody.id,
        styleAddons: [{ styleAddonId: saQty.id, quantity: 2 }]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().total_price_cents).toBe(80000)
  })

  it('TC-RT-03: 旧档位下单不受影响 → 200', async () => {
    const artist = seedArtist({ qq_number: '88103', subdomain: 'old-rt' })
    seedWorkflowStages(artist.id)
    const tier = seedTier(artist.id, '头像', 100)
    const res = await app.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        subdomain: 'old-rt',
        clientQq: '88303',
        agreeRules: true,
        tierId: tier.id
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().totalPriceCents).toBe(10000)
  })

  it('TC-RT-04: styleSizeId + tierId 同传 → 400', async () => {
    const { sizeHead } = setupStyleScene()
    const tier = seedTier(db.prepare("SELECT id FROM artists WHERE subdomain='style-order'").get().id, 'X', 100)
    const res = await app.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        subdomain: 'style-order',
        clientQq: '88304',
        agreeRules: true,
        tierId: tier.id,
        styleSizeId: sizeHead.id
      }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-RT-05: 无效 styleSizeId → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/orders',
      payload: {
        subdomain: 'style-order',
        clientQq: '88305',
        agreeRules: true,
        styleSizeId: 99999
      }
    })
    expect(res.statusCode).toBe(404)
  })
})
