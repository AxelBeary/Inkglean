import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as stylePricingService from '../src/features/pricing/style-pricing.service.js'

// ============================================
// SPEC-PRICE-2 唯一计价引擎测试（v50 价格模型统一）
// 公式：(基础价 + Σ固定增项 + Σ百分比增项[只基于基础价]) × 用途 × 加急 × 折扣
// 全程整数分，断言精确值
// ============================================

/** 搭建标准场景：画师 + 画风 + 2尺寸 + 7增项模板（覆盖三类 × 两种计价） */
function setupStandardScene() {
  const artist = seedArtist({ qq_number: '88001', subdomain: 'price-test' })

  const tplBg = styleService.createAddonTemplate(artist.id, {
    name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 150, category: 'add'
  })
  const tplPerson = styleService.createAddonTemplate(artist.id, {
    name: '加人', control_type: 'quantity', price_mode: 'fixed', default_price: 100, unit_label: '人', category: 'add', max_quantity: 5
  })
  const tplDetail = styleService.createAddonTemplate(artist.id, {
    name: '精细刻画', control_type: 'switch', price_mode: 'percent', default_price: 20, category: 'add'
  })
  const tplCommercial = styleService.createAddonTemplate(artist.id, {
    name: '商用', control_type: 'switch', price_mode: 'percent', default_price: 50, category: 'usage'
  })
  const tplBuyout = styleService.createAddonTemplate(artist.id, {
    name: '买断', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'usage'
  })
  const tplRush = styleService.createAddonTemplate(artist.id, {
    name: '加急', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'rush'
  })
  const tplSuperRush = styleService.createAddonTemplate(artist.id, {
    name: '超级加急', control_type: 'switch', price_mode: 'percent', default_price: 200, category: 'rush'
  })

  const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: false })
  const sizeHead = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
  const sizeBody = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 600 })

  styleService.setStyleAddons(artist.id, style.id, [
    { addon_template_id: tplBg.id },
    { addon_template_id: tplPerson.id },
    { addon_template_id: tplDetail.id },
    { addon_template_id: tplCommercial.id },
    { addon_template_id: tplBuyout.id },
    { addon_template_id: tplRush.id },
    { addon_template_id: tplSuperRush.id }
  ])
  const styleAddons = styleService.getStyleAddons(style.id)
  const sa = (tpl) => styleAddons.find(a => a.addon_template_id === tpl.id)

  return {
    artist, style, sizeHead, sizeBody,
    saBg: sa(tplBg), saPerson: sa(tplPerson), saDetail: sa(tplDetail),
    saCommercial: sa(tplCommercial), saBuyout: sa(tplBuyout),
    saRush: sa(tplRush), saSuperRush: sa(tplSuperRush)
  }
}

// ─── 引擎测试 ───

describe('SPEC-PRICE-2 计价引擎 (calculateStylePrice)', () => {
  beforeEach(() => { cleanDb() })

  it('TC-SP-01: 纯基础价', () => {
    const { artist, sizeHead } = setupStandardScene()
    const r = stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeHead.id })
    expect(r.baseCents).toBe(20000)
    expect(r.fixedAddonItems).toHaveLength(0)
    expect(r.percentAddonItems).toHaveLength(0)
    expect(r.subtotalCents).toBe(20000)
    expect(r.usage).toBeNull()
    expect(r.rush).toBeNull()
    expect(r.afterMultipliersCents).toBe(20000)
    expect(r.totalCents).toBe(20000)
  })

  it('TC-SP-02: 固定 switch 增项进加法小计', () => {
    const { artist, sizeHead, saBg } = setupStandardScene()
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id, addons: [{ styleAddonId: saBg.id }]
    })
    expect(r.fixedAddonItems[0]).toMatchObject({ name: '背景', quantity: 1, unitCents: 15000, amountCents: 15000, source: 'template_default' })
    expect(r.subtotalCents).toBe(35000)
    expect(r.totalCents).toBe(35000)
  })

  it('TC-SP-03: 数量型 × 数量', () => {
    const { artist, sizeHead, saPerson } = setupStandardScene()
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id, addons: [{ styleAddonId: saPerson.id, quantity: 3 }]
    })
    expect(r.fixedAddonItems[0].quantity).toBe(3)
    expect(r.fixedAddonItems[0].amountCents).toBe(30000)
    expect(r.subtotalCents).toBe(50000)
  })

  it('TC-SP-04: 百分比增项只基于基础价（铁律，不受其他增项影响）', () => {
    const { artist, sizeBody, saBg, saDetail } = setupStandardScene()
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }, { styleAddonId: saDetail.id }]
    })
    // 精细刻画 20% × 600 = 12000（不是 (600+150)×20% = 15000）
    expect(r.percentAddonItems[0]).toMatchObject({ name: '精细刻画', percent: 20, amountCents: 12000 })
    expect(r.subtotalCents).toBe(60000 + 15000 + 12000)
  })

  it('TC-SP-05: 百分比 × 数量型', () => {
    const { artist, sizeBody, saDetail } = setupStandardScene()
    // 手动改模板为 quantity 控件验证扩展语义
    db.prepare("UPDATE addon_templates SET control_type = 'quantity' WHERE id = ?").run(saDetail.addon_template_id)
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saDetail.id, quantity: 2 }]
    })
    expect(r.percentAddonItems[0].amountCents).toBe(12000 * 2)
  })

  it('TC-SP-06: 用途倍率（单选生效，小计 × (100+p)/100）', () => {
    const { artist, sizeBody, saBg, saCommercial } = setupStandardScene()
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }, { styleAddonId: saCommercial.id }]
    })
    // 小计 75000 × 150/100 = 112500
    expect(r.subtotalCents).toBe(75000)
    expect(r.usage).toMatchObject({ name: '商用', percent: 50, incrementCents: 37500 })
    expect(r.afterMultipliersCents).toBe(112500)
    expect(r.totalCents).toBe(112500)
  })

  it('TC-SP-07: 先用途后加急（顺序不可颠倒）', () => {
    const { artist, sizeBody, saBg, saDetail, saCommercial, saRush } = setupStandardScene()
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id,
      addons: [
        { styleAddonId: saBg.id }, { styleAddonId: saDetail.id },
        { styleAddonId: saCommercial.id }, { styleAddonId: saRush.id }
      ]
    })
    // 小计 87000 → ×150% = 130500 → ×200% = 261000
    expect(r.subtotalCents).toBe(87000)
    expect(r.afterMultipliersCents).toBe(261000)
    expect(r.usage.incrementCents).toBe(43500)
    expect(r.rush.incrementCents).toBe(130500)
    expect(r.totalCents).toBe(261000)
  })

  it('TC-SP-08: 用途多选 → 互斥拒绝', () => {
    const { artist, sizeBody, saCommercial, saBuyout } = setupStandardScene()
    expect(() => stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id,
      addons: [{ styleAddonId: saCommercial.id }, { styleAddonId: saBuyout.id }]
    })).toThrow('ADDON_SELECTION_MUTEX')
  })

  it('TC-SP-09: 加急多选 → 互斥拒绝', () => {
    const { artist, sizeBody, saRush, saSuperRush } = setupStandardScene()
    expect(() => stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id,
      addons: [{ styleAddonId: saRush.id }, { styleAddonId: saSuperRush.id }]
    })).toThrow('ADDON_SELECTION_MUTEX')
  })

  it('TC-SP-10: 折扣最后应用（percent 向下取整）', () => {
    const { artist, sizeBody, saCommercial } = setupStandardScene()
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, enabled) VALUES (?, 'SAVE10', 'percent', 10, 1)").run(artist.id)
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saCommercial.id }], discountCode: 'SAVE10'
    })
    // 60000 × 150% = 90000 → -10% = -9000 → 81000
    expect(r.afterMultipliersCents).toBe(90000)
    expect(r.discount.amountCents).toBe(9000)
    expect(r.totalCents).toBe(81000)
  })

  it('TC-SP-11: 折扣 fixed 不超过总价', () => {
    const { artist, sizeHead } = setupStandardScene()
    db.prepare("INSERT INTO discount_codes (artist_id, code, discount_type, discount_value, enabled) VALUES (?, 'BIG', 'fixed', 999, 1)").run(artist.id)
    db.prepare('UPDATE artists SET discount_enabled = 1 WHERE id = ?').run(artist.id)
    const r = stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeHead.id, discountCode: 'BIG' })
    expect(r.discount.amountCents).toBe(20000)
    expect(r.totalCents).toBe(0)
  })

  it('TC-SP-12: 尺寸/画风校验（404 / 停用 / 三态拒单）', () => {
    const { artist, style, sizeBody } = setupStandardScene()
    expect(() => stylePricingService.calculateStylePrice(artist.id, { styleSizeId: 99999 })).toThrow('STYLE_SIZE_NOT_FOUND')
    const other = seedArtist({ qq_number: '88002', subdomain: 'other' })
    expect(() => stylePricingService.calculateStylePrice(other.id, { styleSizeId: sizeBody.id })).toThrow('STYLE_SIZE_NOT_FOUND')
    db.prepare('UPDATE art_styles SET is_active = 0 WHERE id = ?').run(style.id)
    expect(() => stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeBody.id })).toThrow('STYLE_NOT_FOUND')
    db.prepare('UPDATE art_styles SET is_active = 1 WHERE id = ?').run(style.id)
    db.prepare("UPDATE style_sizes SET display_status = 'showcase' WHERE id = ?").run(sizeBody.id)
    expect(() => stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeBody.id })).toThrow('STYLE_SIZE_NOT_AVAILABLE')
    db.prepare("UPDATE style_sizes SET display_status = 'closed' WHERE id = ?").run(sizeBody.id)
    expect(() => stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeBody.id })).toThrow('STYLE_SIZE_NOT_AVAILABLE')
  })

  it('TC-SP-13: 增项校验（跨画风/禁用/尺寸隐藏/重复提交）', () => {
    const { artist, sizeHead, sizeBody, saBg } = setupStandardScene()
    // 尺寸隐藏
    db.prepare('INSERT INTO size_addon_overrides (style_size_id, style_addon_id, is_hidden) VALUES (?, ?, 1)').run(sizeHead.id, saBg.id)
    expect(() => stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id, addons: [{ styleAddonId: saBg.id }]
    })).toThrow('VALIDATION')
    // 禁用
    db.prepare('DELETE FROM size_addon_overrides')
    db.prepare('UPDATE style_addons SET is_enabled = 0 WHERE id = ?').run(saBg.id)
    expect(() => stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }]
    })).toThrow('STYLE_ADDON_NOT_FOUND')
    db.prepare('UPDATE style_addons SET is_enabled = 1 WHERE id = ?').run(saBg.id)
    // 重复提交
    expect(() => stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }, { styleAddonId: saBg.id }]
    })).toThrow('VALIDATION')
  })

  it('TC-SP-14: 数量超上限拒绝', () => {
    const { artist, sizeBody, saPerson } = setupStandardScene()
    expect(() => stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saPerson.id, quantity: 6 }]
    })).toThrow('VALIDATION')
  })

  it('TC-SP-15: 价格覆盖优先级（尺寸 > 画风 > 模板）', () => {
    const { artist, sizeBody, saBg } = setupStandardScene()
    styleService.setStyleAddons(artist.id, saBg.art_style_id, [{ addon_template_id: saBg.addon_template_id, price_override: 120 }])
    let r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }]
    })
    expect(r.fixedAddonItems[0]).toMatchObject({ unitCents: 12000, source: 'style_override' })
    db.prepare('INSERT INTO size_addon_overrides (style_size_id, style_addon_id, price_override) VALUES (?, ?, 90)').run(sizeBody.id, saBg.id)
    r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }]
    })
    expect(r.fixedAddonItems[0]).toMatchObject({ unitCents: 9000, source: 'size_override' })
  })

  it('TC-SP-16: IEEE 754 防护——全整数分无浮点漂移', () => {
    const { artist, style, saDetail, saCommercial, saRush } = setupStandardScene()
    // 非整价基础价 199.99 元 + 百分比链
    const sizeOdd = styleService.createStyleSize(artist.id, style.id, { name: '特殊', base_price: 199.99 })
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeOdd.id,
      addons: [{ styleAddonId: saDetail.id }, { styleAddonId: saCommercial.id }, { styleAddonId: saRush.id }]
    })
    // base 19999；精细 20% → round(19999*20/100)=4000；subtotal 23999
    // 用途 +50% → round(23999*150/100)=36000（35998.5→36000? Math.round(35998.5)=35999? 注：JS Math.round 半向上 → 35999? 验证：23999*150=3599850, /100=35998.5 → 35999）
    expect(r.percentAddonItems[0].amountCents).toBe(4000)
    expect(r.subtotalCents).toBe(23999)
    expect(r.afterMultipliersCents).toBe(Math.round(Math.round(23999 * 150 / 100) * 200 / 100))
    expect(Number.isInteger(r.totalCents)).toBe(true)
  })

  it('TC-SP-17: 解绑增项（快照独立）仍可计价', () => {
    const { artist, sizeBody, saBg } = setupStandardScene()
    // 模拟删除模板后的解绑态
    db.prepare(`
      UPDATE style_addons SET tpl_name = '背景', tpl_control_type = 'switch', tpl_price_mode = 'fixed',
        tpl_default_price = 150, tpl_unit_label = NULL, tpl_category = 'add', tpl_max_quantity = NULL,
        addon_template_id = NULL
      WHERE id = ?
    `).run(saBg.id)
    const r = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeBody.id, addons: [{ styleAddonId: saBg.id }]
    })
    expect(r.fixedAddonItems[0].amountCents).toBe(15000)
  })
})

// ─── 路由测试 ───

describe('calculate-style-price 路由（SPEC-PRICE-2 唯一算价入口）', () => {
  let app
  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })
  afterEach(() => app.close())

  it('TC-RT-01: 正常计算 200', async () => {
    const scene = setupStandardScene()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/calculate-style-price',
      payload: {
        subdomain: 'price-test',
        styleSizeId: scene.sizeBody.id,
        addons: [{ styleAddonId: scene.saBg.id }, { styleAddonId: scene.saCommercial.id }]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().totalCents).toBe(112500)
  })

  it('TC-RT-02: 缺少 styleSizeId → 400', async () => {
    setupStandardScene()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/calculate-style-price',
      payload: { subdomain: 'price-test' }
    })
    expect(res.statusCode).toBe(400)
  })

  it('TC-RT-03: 画师不存在 → 404', async () => {
    setupStandardScene()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/calculate-style-price',
      payload: { subdomain: 'ghost', styleSizeId: 1 }
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-RT-04: 用途多选 → 400 互斥', async () => {
    const scene = setupStandardScene()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/calculate-style-price',
      payload: {
        subdomain: 'price-test',
        styleSizeId: scene.sizeBody.id,
        addons: [{ styleAddonId: scene.saCommercial.id }, { styleAddonId: scene.saBuyout.id }]
      }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ADDON_SELECTION_MUTEX')
  })

  it('TC-RT-05: 旧字段 usageMultiplierId/optionLabel 静默剥离（additionalProperties 去除）', async () => {
    const scene = setupStandardScene()
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/calculate-style-price',
      payload: {
        subdomain: 'price-test',
        styleSizeId: scene.sizeBody.id,
        usageMultiplierId: 999,
        addons: [{ styleAddonId: scene.saBg.id, optionLabel: 'X' }]
      }
    })
    expect(res.statusCode).toBe(200)
  })
})

// ─── 增项模板 CRUD 维度校验（SPEC-PRICE-2 数据模型） ───

describe('增项模板 CRUD（category/price_mode 维度）', () => {
  beforeEach(() => { cleanDb() })

  it('TC-TPL-01: radio 控件禁止新建', () => {
    const artist = seedArtist({ qq_number: '88003', subdomain: 'tpl-test' })
    expect(() => styleService.createAddonTemplate(artist.id, {
      name: 'X', control_type: 'radio', price_mode: 'fixed', default_price: 10
    })).toThrow('ADDON_TEMPLATE_INVALID_CONTROL')
  })

  it('TC-TPL-02: 用途/加急必须百分比计价', () => {
    const artist = seedArtist({ qq_number: '88004', subdomain: 'tpl-test2' })
    expect(() => styleService.createAddonTemplate(artist.id, {
      name: '商用', control_type: 'switch', price_mode: 'fixed', default_price: 50, category: 'usage'
    })).toThrow('VALIDATION')
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '商用', control_type: 'switch', price_mode: 'percent', default_price: 50, category: 'usage'
    })
    expect(tpl.category).toBe('usage')
    expect(tpl.price_mode).toBe('percent')
  })

  it('TC-TPL-03: 百分比须为 0-1000 整数', () => {
    const artist = seedArtist({ qq_number: '88005', subdomain: 'tpl-test3' })
    expect(() => styleService.createAddonTemplate(artist.id, {
      name: 'X', price_mode: 'percent', default_price: 50.5
    })).toThrow('VALIDATION')
    expect(() => styleService.createAddonTemplate(artist.id, {
      name: 'X', price_mode: 'percent', default_price: 1001
    })).toThrow('VALIDATION')
  })

  it('TC-TPL-04: 更新 category 触发跨字段校验', () => {
    const artist = seedArtist({ qq_number: '88006', subdomain: 'tpl-test4' })
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: 'X', control_type: 'switch', price_mode: 'fixed', default_price: 50
    })
    expect(() => styleService.updateAddonTemplate(artist.id, tpl.id, { category: 'usage' })).toThrow('VALIDATION')
  })
})
