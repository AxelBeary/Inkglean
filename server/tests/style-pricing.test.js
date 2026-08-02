import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as stylePricingService from '../src/features/pricing/style-pricing.service.js'

// ============================================
// 多画风价格计算引擎测试
// REQ-023 Phase 2
// ============================================

// ─── 辅助函数 ───

function seedMultiplier(artistId, type, name, multiplier) {
  const r = db.prepare(
    'INSERT INTO price_multipliers (artist_id, type, name, multiplier, sort_order, enabled) VALUES (?, ?, ?, ?, 0, 1)'
  ).run(artistId, type, name, multiplier)
  return db.prepare('SELECT * FROM price_multipliers WHERE id = ?').get(r.lastInsertRowid)
}

/** 搭建标准测试场景：画师 + 画风 + 2尺寸 + 3增项模板 + 画风增项 */
function setupStandardScene() {
  const artist = seedArtist({ qq_number: '88001', subdomain: 'price-test' })

  // 增项模板
  const tplSwitch = styleService.createAddonTemplate(artist.id, {
    name: '加背景', control_type: 'switch', pricing_mode: 'fixed', default_price: 150
  })
  const tplQty = styleService.createAddonTemplate(artist.id, {
    name: '加人', control_type: 'quantity', pricing_mode: 'per_unit', default_price: 100, unit_label: '人'
  })
  const tplRadio = styleService.createAddonTemplate(artist.id, {
    name: '加衣服', control_type: 'radio', pricing_mode: 'per_option',
    options: JSON.stringify([{ label: '简易', price: 80 }, { label: '复杂', price: 200 }])
  })

  // 画风 + 尺寸
  const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: true })
  const sizeHead = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
  const sizeBody = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 600 })

  // 画风增项
  styleService.setStyleAddons(artist.id, style.id, [
    { addon_template_id: tplSwitch.id },
    { addon_template_id: tplQty.id },
    { addon_template_id: tplRadio.id }
  ])
  const styleAddons = styleService.getStyleAddons(style.id)
  const saSwitch = styleAddons.find(a => a.addon_template_id === tplSwitch.id)
  const saQty = styleAddons.find(a => a.addon_template_id === tplQty.id)
  const saRadio = styleAddons.find(a => a.addon_template_id === tplRadio.id)

  return { artist, style, sizeHead, sizeBody, tplSwitch, tplQty, tplRadio, saSwitch, saQty, saRadio }
}

// ─── Service 层测试 ───

describe('多画风价格计算引擎 (calculateStylePrice)', () => {
  beforeEach(() => { cleanDb() })

  it('TC-SP-01: 纯尺寸基础价', () => {
    const { artist, sizeHead } = setupStandardScene()
    const result = stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeHead.id })
    expect(result.sizeName).toBe('头像')
    expect(result.basePrice).toBe(200)
    expect(result.addonItems).toHaveLength(0)
    expect(result.subtotal).toBe(200)
    expect(result.multiplierTotal).toBe(200)
    expect(result.totalPrice).toBe(200)
    expect(result.totalPriceCents).toBe(20000)
  })

  it('TC-SP-02: switch 增项', () => {
    const { artist, sizeHead, saSwitch } = setupStandardScene()
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saSwitch.id }]
    })
    expect(result.addonItems).toHaveLength(1)
    expect(result.addonItems[0].name).toBe('加背景')
    expect(result.addonItems[0].unitPrice).toBe(150)
    expect(result.addonItems[0].amount).toBe(150)
    expect(result.addonItems[0].source).toBe('template_default')
    expect(result.subtotal).toBe(350)
  })

  it('TC-SP-03: quantity 增项 × 数量', () => {
    const { artist, sizeHead, saQty } = setupStandardScene()
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saQty.id, quantity: 3 }]
    })
    expect(result.addonItems[0].quantity).toBe(3)
    expect(result.addonItems[0].unitPrice).toBe(100)
    expect(result.addonItems[0].amount).toBe(300)
    expect(result.subtotal).toBe(500)
  })

  it('TC-SP-04: radio 增项 — 选选项', () => {
    const { artist, sizeHead, saRadio } = setupStandardScene()
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saRadio.id, optionLabel: '复杂' }]
    })
    expect(result.addonItems[0].unitPrice).toBe(200)
    expect(result.addonItems[0].amount).toBe(200)
    expect(result.subtotal).toBe(400)
  })

  it('TC-SP-05: radio 增项 — 缺少 optionLabel 拒绝', () => {
    const { artist, sizeHead, saRadio } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saRadio.id }]
      })
    }).toThrow('VALIDATION')
  })

  it('TC-SP-06: radio 增项 — 无效选项拒绝', () => {
    const { artist, sizeHead, saRadio } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saRadio.id, optionLabel: '不存在' }]
      })
    }).toThrow('VALIDATION')
  })

  it('TC-SP-07: 尺寸覆盖价格', () => {
    const { artist, sizeBody, saQty } = setupStandardScene()
    // 全身下加人覆盖为 200
    styleService.setSizeOverrides(artist.id, sizeBody.art_style_id, sizeBody.id, [
      { style_addon_id: saQty.id, price_override: 200 }
    ])
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id,
      addons: [{ styleAddonId: saQty.id, quantity: 2 }]
    })
    expect(result.addonItems[0].unitPrice).toBe(200)
    expect(result.addonItems[0].amount).toBe(400)
    expect(result.addonItems[0].source).toBe('size_override')
  })

  it('TC-SP-08: 画风覆盖价格', () => {
    const { artist, sizeHead, saSwitch } = setupStandardScene()
    // 画风级改价为 180
    styleService.setStyleAddons(artist.id, sizeHead.art_style_id, [
      { addon_template_id: saSwitch.addon_template_id, price_override: 180 }
    ])
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saSwitch.id }]
    })
    expect(result.addonItems[0].unitPrice).toBe(180)
    expect(result.addonItems[0].source).toBe('style_override')
  })

  it('TC-SP-09: 隐藏增项拒绝', () => {
    const { artist, sizeBody, saSwitch } = setupStandardScene()
    styleService.setSizeOverrides(artist.id, sizeBody.art_style_id, sizeBody.id, [
      { style_addon_id: saSwitch.id, is_hidden: true }
    ])
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeBody.id,
        addons: [{ styleAddonId: saSwitch.id }]
      })
    }).toThrow('VALIDATION')
  })

  it('TC-SP-10: 用途倍率', () => {
    const { artist, sizeHead } = setupStandardScene()
    const um = seedMultiplier(artist.id, 'usage', '商用', 2.0)
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      usageMultiplierId: um.id
    })
    expect(result.usageMultiplier).toEqual({ name: '商用', factor: 2.0 })
    expect(result.multiplierTotal).toBe(400)
    expect(result.totalPrice).toBe(400)
  })

  it('TC-SP-11: 用途 + 加急倍率叠加', () => {
    const { artist, sizeHead } = setupStandardScene()
    const um = seedMultiplier(artist.id, 'usage', '商用', 2.0)
    const rm = seedMultiplier(artist.id, 'rush', '加急', 1.5)
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      usageMultiplierId: um.id,
      rushMultiplierId: rm.id
    })
    // 200 × 2.0 × 1.5 = 600
    expect(result.multiplierTotal).toBe(600)
    expect(result.totalPrice).toBe(600)
  })

  it('TC-SP-12: 折扣码 — percent（先倍率后折扣）', () => {
    const { artist, sizeHead } = setupStandardScene()
    // 开启折扣 + 创建码
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'SAVE10', 'percent', 10)").run(artist.id)

    const um = seedMultiplier(artist.id, 'usage', '商用', 2.0)
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      usageMultiplierId: um.id,
      discountCode: 'SAVE10'
    })
    // 200 × 2.0 = 400 → 折扣 10% = 40 → 360
    expect(result.multiplierTotal).toBe(400)
    expect(result.discount.amount).toBe(40)
    expect(result.totalPrice).toBe(360)
    expect(result.totalPriceCents).toBe(36000)
  })

  it('TC-SP-13: 折扣码 — fixed', () => {
    const { artist, sizeHead } = setupStandardScene()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'MINUS50', 'fixed', 50)").run(artist.id)

    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      discountCode: 'MINUS50'
    })
    // 200 - 50 = 150
    expect(result.discount.amount).toBe(50)
    expect(result.totalPrice).toBe(150)
  })

  it('TC-SP-14: 折扣码 — fixed 不超过总价', () => {
    const { artist, sizeHead } = setupStandardScene()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'BIG', 'fixed', 9999)").run(artist.id)

    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      discountCode: 'BIG'
    })
    // 折扣不超过总价 200
    expect(result.discount.amount).toBe(200)
    expect(result.totalPrice).toBe(0)
  })

  it('TC-SP-15: 组合 — 尺寸+增项+倍率+折扣', () => {
    const { artist, sizeBody, saQty, saSwitch } = setupStandardScene()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'VIP20', 'percent', 20)").run(artist.id)
    const um = seedMultiplier(artist.id, 'usage', '商用', 2.0)

    // 全身下加人覆盖为 200
    styleService.setSizeOverrides(artist.id, sizeBody.art_style_id, sizeBody.id, [
      { style_addon_id: saQty.id, price_override: 200 }
    ])

    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id,
      addons: [
        { styleAddonId: saQty.id, quantity: 2 },
        { styleAddonId: saSwitch.id }
      ],
      usageMultiplierId: um.id,
      discountCode: 'VIP20'
    })
    // 基础 600 + 加人 200×2=400 + 加背景 150 = 1150
    // × 2.0 = 2300
    // 折扣 20% = 460
    // 总价 = 1840
    expect(result.subtotal).toBe(1150)
    expect(result.multiplierTotal).toBe(2300)
    expect(result.discount.amount).toBe(460)
    expect(result.totalPrice).toBe(1840)
    expect(result.totalPriceCents).toBe(184000)
  })

  // ─── 校验失败 ───

  it('TC-SP-16: 尺寸不存在 → 404', () => {
    const { artist } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, { styleSizeId: 99999 })
    }).toThrow('STYLE_SIZE_NOT_FOUND')
  })

  it('TC-SP-17: 尺寸属于其他画师 → 404', () => {
    const { sizeHead } = setupStandardScene()
    const other = seedArtist({ qq_number: '88002', subdomain: 'other-price' })
    expect(() => {
      stylePricingService.calculateStylePrice(other.id, { styleSizeId: sizeHead.id })
    }).toThrow('STYLE_SIZE_NOT_FOUND')
  })

  it('TC-SP-18: 禁用画风的尺寸 → 404', () => {
    const { artist, style, sizeHead } = setupStandardScene()
    styleService.updateArtStyle(artist.id, style.id, { is_active: false })
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeHead.id })
    }).toThrow('STYLE_NOT_FOUND')
  })

  it('TC-SP-19: 增项不属于该画风 → 404', () => {
    const { artist, sizeHead } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: 99999 }]
      })
    }).toThrow('STYLE_ADDON_NOT_FOUND')
  })

  it('TC-SP-20: 禁用增项 → 404', () => {
    const { artist, sizeHead, saSwitch } = setupStandardScene()
    styleService.setStyleAddons(artist.id, sizeHead.art_style_id, [
      { addon_template_id: saSwitch.addon_template_id, is_enabled: false }
    ])
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saSwitch.id }]
      })
    }).toThrow('STYLE_ADDON_NOT_FOUND')
  })

  it('TC-SP-21: 重复增项 ID 拒绝', () => {
    const { artist, sizeHead, saSwitch } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saSwitch.id }, { styleAddonId: saSwitch.id }]
      })
    }).toThrow('VALIDATION')
  })

  it('TC-SP-22: 无效倍率 ID → 404', () => {
    const { artist, sizeHead } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        usageMultiplierId: 99999
      })
    }).toThrow('MULTIPLIER_NOT_FOUND')
  })

  it('TC-SP-23: 折扣码未开启 → 报错', () => {
    const { artist, sizeHead } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        discountCode: 'ANYTHING'
      })
    }).toThrow('DISCOUNT_DISABLED')
  })

  it('TC-SP-24: quantity 超范围拒绝', () => {
    const { artist, sizeHead, saQty } = setupStandardScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saQty.id, quantity: 100 }]
      })
    }).toThrow('VALIDATION')
  })
})

// ─── 路由层集成测试 ───

describe('calculate-style-price 路由层', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-RT-01: 正常计算 → 200', async () => {
    const { sizeHead, saSwitch } = setupStandardScene()
    const res = await app.inject({
      method: 'POST', url: '/api/public/calculate-style-price',
      payload: {
        subdomain: 'price-test',
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saSwitch.id }]
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.basePrice).toBe(200)
    expect(body.totalPrice).toBe(350)
  })

  it('TC-RT-02: 画师不存在 → 404', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/calculate-style-price',
      payload: { subdomain: 'ghost', styleSizeId: 1 }
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-RT-03: 缺少 styleSizeId → 400', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/public/calculate-style-price',
      payload: { subdomain: 'price-test' }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-RT-04: 完整组合 — 增项+倍率+折扣', async () => {
    const { artist, sizeBody, saQty, saSwitch } = setupStandardScene()
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value) VALUES (?, 'SAVE10', 'percent', 10)").run(artist.id)
    const um = seedMultiplier(artist.id, 'usage', '商用', 2.0)

    const res = await app.inject({
      method: 'POST', url: '/api/public/calculate-style-price',
      payload: {
        subdomain: 'price-test',
        styleSizeId: sizeBody.id,
        addons: [
          { styleAddonId: saQty.id, quantity: 2 },
          { styleAddonId: saSwitch.id }
        ],
        usageMultiplierId: um.id,
        discountCode: 'SAVE10'
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // 600 + 200 + 150 = 950 × 2 = 1900 - 190 = 1710
    expect(body.subtotal).toBe(950)
    expect(body.multiplierTotal).toBe(1900)
    expect(body.discount.amount).toBe(190)
    expect(body.totalPrice).toBe(1710)
  })

  it('TC-RT-05: additionalProperties 静默剥离', async () => {
    const { sizeHead } = setupStandardScene()
    const res = await app.inject({
      method: 'POST', url: '/api/public/calculate-style-price',
      payload: { subdomain: 'price-test', styleSizeId: sizeHead.id, evil: true }
    })
    expect(res.statusCode).toBe(200)
  })
})
