import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as styleService from '../src/features/pricing/style.service.js'
import type { AddonTemplate, StyleAddonWithTemplate } from '../src/features/pricing/style.service.js'
import {
  resolveSelectedAddons,
  buildPriceLines,
  applyMultipliersAndDiscount,
  assertPercentAmountOnBase
} from '../src/features/pricing/style-pricing.service.js'

// ============================================
// 审计批 F-7（P3-31）: calculateStylePrice 拆分
// 三段纯函数：resolveSelectedAddons / buildPriceLines / applyMultipliersAndDiscount
// 铁律转段内断言（互斥拒绝 / 百分比基数=基础价 / 用途→加急→折扣顺序）
// 对外行为与返回结构不变（既有 style-pricing.test.js 全绿 = 行为铁证）
// ============================================

/** 紧凑场景：画师 + 画风 + 尺寸 + 6 个模板（普通固定/普通百分比/用途×2/加急×2） */
function setupScene() {
  const artist = seedArtist({ qq_number: '88430', subdomain: 'f7-split' })
  const tplBg = styleService.createAddonTemplate(artist.id, { name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 150, category: 'add' })
  const tplDetail = styleService.createAddonTemplate(artist.id, { name: '精细', control_type: 'quantity', price_mode: 'percent', default_price: 20, category: 'add' })
  const tplCommercial = styleService.createAddonTemplate(artist.id, { name: '商用', control_type: 'switch', price_mode: 'percent', default_price: 50, category: 'usage' })
  const tplBuyout = styleService.createAddonTemplate(artist.id, { name: '买断', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'usage' })
  const tplRush = styleService.createAddonTemplate(artist.id, { name: '加急', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'rush' })
  const tplSuperRush = styleService.createAddonTemplate(artist.id, { name: '超级加急', control_type: 'switch', price_mode: 'percent', default_price: 200, category: 'rush' })

  const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: false })
  const size = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 600 })
  styleService.setStyleAddons(artist.id, style.id, [
    { addon_template_id: tplBg.id },
    { addon_template_id: tplDetail.id },
    { addon_template_id: tplCommercial.id },
    { addon_template_id: tplBuyout.id },
    { addon_template_id: tplRush.id },
    { addon_template_id: tplSuperRush.id }
  ])
  const addons = styleService.getStyleAddons(style.id)
  const sa = (tpl: AddonTemplate) => addons.find(a => a.addon_template_id === tpl.id) as StyleAddonWithTemplate
  return { artist, style, size, saBg: sa(tplBg), saDetail: sa(tplDetail), saCommercial: sa(tplCommercial), saBuyout: sa(tplBuyout), saRush: sa(tplRush), saSuperRush: sa(tplSuperRush) }
}

describe('F-7 resolveSelectedAddons（解析增项）', () => {
  beforeEach(() => { cleanDb() })

  it('TC-F7-01: 普通/用途/加急正确分组（价格优先级 + 数量解析）', () => {
    const { style, size, saBg, saDetail, saCommercial, saRush } = setupScene()
    const r = resolveSelectedAddons(style.id, size.id, [
      { styleAddonId: saBg.id },
      { styleAddonId: saDetail.id, quantity: 2 },
      { styleAddonId: saCommercial.id },
      { styleAddonId: saRush.id }
    ])
    expect(r.addons).toHaveLength(2)
    expect(r.addons[0]).toMatchObject({ name: '背景', price_mode: 'fixed', unitPrice: 150, quantity: 1, source: 'template_default' })
    expect(r.addons[1]).toMatchObject({ name: '精细', price_mode: 'percent', unitPrice: 20, quantity: 2, source: 'template_default' })
    expect(r.usage).toEqual({ name: '商用', percent: 50 })
    expect(r.rush).toEqual({ name: '加急', percent: 100 })
  })

  it('TC-F7-02: 用途多选 → ADDON_SELECTION_MUTEX（段内断言）', () => {
    const { style, size, saCommercial, saBuyout } = setupScene()
    expect(() => resolveSelectedAddons(style.id, size.id, [
      { styleAddonId: saCommercial.id },
      { styleAddonId: saBuyout.id }
    ])).toThrow('ADDON_SELECTION_MUTEX')
  })

  it('TC-F7-03: 加急多选 → ADDON_SELECTION_MUTEX', () => {
    const { style, size, saRush, saSuperRush } = setupScene()
    expect(() => resolveSelectedAddons(style.id, size.id, [
      { styleAddonId: saRush.id },
      { styleAddonId: saSuperRush.id }
    ])).toThrow('ADDON_SELECTION_MUTEX')
  })

  it('TC-F7-04: 重复提交 → VALIDATION', () => {
    const { style, size, saBg } = setupScene()
    expect(() => resolveSelectedAddons(style.id, size.id, [
      { styleAddonId: saBg.id },
      { styleAddonId: saBg.id }
    ])).toThrow('VALIDATION')
  })

  it('TC-F7-05: 数量超上限 / 尺寸隐藏 / 禁用 → 校验拒绝', () => {
    const { style, size, saDetail, saBg } = setupScene()
    expect(() => resolveSelectedAddons(style.id, size.id, [{ styleAddonId: saDetail.id, quantity: 999 }])).toThrow('VALIDATION')

    // 尺寸隐藏（DB 直插覆盖行）
    db.prepare('INSERT INTO size_addon_overrides (style_size_id, style_addon_id, is_hidden) VALUES (?, ?, 1)').run(size.id, saBg.id)
    expect(() => resolveSelectedAddons(style.id, size.id, [{ styleAddonId: saBg.id }])).toThrow('VALIDATION')

    db.prepare('DELETE FROM size_addon_overrides')
    db.prepare('UPDATE style_addons SET is_enabled = 0 WHERE id = ?').run(saBg.id)
    expect(() => resolveSelectedAddons(style.id, size.id, [{ styleAddonId: saBg.id }])).toThrow('STYLE_ADDON_NOT_FOUND')
  })
})

describe('F-7 buildPriceLines（公式链构建）', () => {
  beforeEach(() => { cleanDb() })

  it('TC-F7-06: 基础价 → 固定增项 → 百分比增项（只按基础价）→ 小计', () => {
    const { style, size, saBg, saDetail } = setupScene()
    const selection = resolveSelectedAddons(style.id, size.id, [
      { styleAddonId: saBg.id },
      { styleAddonId: saDetail.id }
    ])
    const r = buildPriceLines(60000, selection)
    expect(r.fixedAddonItems[0]).toMatchObject({ name: '背景', unitCents: 15000, amountCents: 15000, quantity: 1 })
    // 百分比增项只基于基础价：60000×20% = 12000（不是 (60000+15000)×20% = 15000）
    expect(r.percentAddonItems[0]).toMatchObject({ name: '精细', percent: 20, amountCents: 12000 })
    expect(r.subtotalCents).toBe(60000 + 15000 + 12000)
  })

  it('TC-F7-07: 百分比 × 数量 基数仍是基础价', () => {
    const { style, size, saDetail } = setupScene()
    const selection = resolveSelectedAddons(style.id, size.id, [{ styleAddonId: saDetail.id, quantity: 3 }])
    const r = buildPriceLines(19999, selection)
    expect(r.percentAddonItems[0].amountCents).toBe(Math.round(19999 * 20 / 100) * 3)
  })

  it('TC-F7-08: 基数断言本身——金额偏离基础价公式即抛 PRICING_CALC_FAILED', () => {
    expect(() => assertPercentAmountOnBase('精细', 20, 1, 60000, 15000)).toThrow('PRICING_CALC_FAILED')
    expect(() => assertPercentAmountOnBase('精细', 20, 1, 60000, 12000)).not.toThrow()
    expect(() => assertPercentAmountOnBase('精细', -5, 1, 60000, -3000)).toThrow('PRICING_CALC_FAILED')
  })
})

describe('F-7 applyMultipliersAndDiscount（倍率与折扣）', () => {
  beforeEach(() => { cleanDb() })

  it('TC-F7-09: 顺序铁律——用途先、加急后、折扣最后', () => {
    const r = applyMultipliersAndDiscount(
      87000,
      { name: '商用', percent: 50 },
      { name: '加急', percent: 100 },
      { code: 'SAVE10', discount_type: 'percent', discount_value: 10 }
    )
    expect(r.usage).toMatchObject({ name: '商用', percent: 50, incrementCents: 43500 })
    expect(r.afterMultipliersCents).toBe(261000)
    expect(r.rush).toMatchObject({ name: '加急', percent: 100, incrementCents: 130500 })
    expect(r.discount).toMatchObject({ code: 'SAVE10', type: 'percent', amountCents: 26100 })
    expect(r.totalCents).toBe(234900)
  })

  it('TC-F7-10: 无倍率无折扣 → 总价 = 小计', () => {
    const r = applyMultipliersAndDiscount(20000, null, null, null)
    expect(r.usage).toBeNull()
    expect(r.rush).toBeNull()
    expect(r.afterMultipliersCents).toBe(20000)
    expect(r.discount).toBeNull()
    expect(r.totalCents).toBe(20000)
  })

  it('TC-F7-11: 折扣 percent 基于倍率后向下取整', () => {
    const r = applyMultipliersAndDiscount(23999, { name: '商用', percent: 50 }, null, { code: 'X', discount_type: 'percent', discount_value: 10 })
    // 23999×150% = 35998.5 → round = 35999；折扣 floor(35999×10/100) = 3599
    expect(r.afterMultipliersCents).toBe(Math.round(23999 * 150 / 100))
    expect((r.discount as { amountCents: number }).amountCents).toBe(Math.floor(Math.round(23999 * 150 / 100) * 10 / 100))
  })

  it('TC-F7-12: 折扣 fixed 不超过总价', () => {
    const r = applyMultipliersAndDiscount(20000, null, null, { code: 'BIG', discount_type: 'fixed', discount_value: 999 })
    expect((r.discount as { amountCents: number }).amountCents).toBe(20000)
    expect(r.totalCents).toBe(0)
  })
})
