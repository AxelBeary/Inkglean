// B4 支付/金额批回归（F0142/F0144/F0146/F0148/F0149/F0150 + F0080 服务侧协作）
import { readFileSync } from 'fs'
import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import {
  createDiscountCode, updateDiscountCode, incrementUsage
} from '../src/features/pricing/discount.service.js'
import { assertPercentAmountOnBase, resolveSelectedAddons } from '../src/features/pricing/style-pricing.service.js'
import { deleteAddonTemplate } from '../src/features/pricing/style.addon-template.service.js'
import * as styleService from '../src/features/pricing/style.service.js'

describe('B4 折扣码校验与事务原子性', () => {
  beforeEach(() => cleanDb())

  it('F0142: 校验失败回滚全部字段更新（discountValue 不留下部分写入）', () => {
    const artist = seedArtist({ qq_number: '88401', subdomain: 'b4-discount' })
    const code = createDiscountCode(artist.id, { code: 'B4D1', discountValue: 50 })
    expect(() => updateDiscountCode(artist.id, code.id, {
      discountValue: 60,
      expiresAt: 'not-a-date'
    })).toThrow()
    const after = db.prepare('SELECT discount_value, expires_at FROM discount_codes WHERE id = ?').get(code.id) as { discount_value: number; expires_at: string | null }
    expect(after.discount_value).toBe(50)
    expect(after.expires_at).toBeNull()
  })

  it('F0144: 不存在的日历日期被拒绝，合法闰日被接受', () => {
    const artist = seedArtist({ qq_number: '88402', subdomain: 'b4-date' })
    expect(() => createDiscountCode(artist.id, { code: 'B4D2', discountValue: 50, expiresAt: '2026-02-30' })).toThrow('VALIDATION')
    expect(() => createDiscountCode(artist.id, { code: 'B4D3', discountValue: 50, expiresAt: '2026-02-29' })).toThrow('VALIDATION')
    expect(() => createDiscountCode(artist.id, { code: 'B4D4', discountValue: 50, expiresAt: '2024-02-29' })).not.toThrow()
    expect(() => createDiscountCode(artist.id, { code: 'B4D5', discountValue: 50, expiresAt: '2026-12-31' })).not.toThrow()
  })

  it('F0080（与 t6 协作）: 使用次数条件 UPDATE，超额自增抛错不越界', () => {
    const artist = seedArtist({ qq_number: '88403', subdomain: 'b4-usage' })
    const code = createDiscountCode(artist.id, { code: 'B4D6', discountValue: 50, maxUses: 1 })
    incrementUsage(code.id)
    expect(() => incrementUsage(code.id)).toThrow('DISCOUNT_CODE_EXHAUSTED')
    const after = db.prepare('SELECT used_count FROM discount_codes WHERE id = ?').get(code.id) as { used_count: number }
    expect(after.used_count).toBe(1)
  })
})

describe('B4 计价断言与增项范围', () => {
  beforeEach(() => cleanDb())

  it('F0150: 固定答案向量 base=1000, 10%, qty=1 → 100（断言非同公式自证）', () => {
    expect(() => assertPercentAmountOnBase('向量', 10, 1, 1000, 100)).not.toThrow()
    expect(() => assertPercentAmountOnBase('向量', 10, 1, 1000, 101)).toThrow('PRICING_CALC_FAILED')
  })

  it('F0146: usage/rush 百分比越界（画风覆盖 1001）被拒绝，合法 100 通过', () => {
    const artist = seedArtist({ qq_number: '88404', subdomain: 'b4-percent' })
    const badTpl = styleService.createAddonTemplate(artist.id, {
      name: '异常倍率', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'usage'
    })
    const goodTpl = styleService.createAddonTemplate(artist.id, {
      name: '正常倍率', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'rush'
    })
    const style = styleService.createArtStyle(artist.id, { name: '测试画风', importAddons: false })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: badTpl.id }, { addon_template_id: goodTpl.id }
    ])
    const addons = styleService.getStyleAddons(style.id)
    const badSa = addons.find(a => a.addon_template_id === badTpl.id)!
    const goodSa = addons.find(a => a.addon_template_id === goodTpl.id)!
    // 模板创建口已有 0-1000 校验；越界值从画风级 price_override 进入（历史脏数据/直连写入）
    db.prepare('UPDATE style_addons SET price_override = 1001 WHERE id = ?').run(badSa.id)
    expect(() => resolveSelectedAddons(style.id, size.id, [{ styleAddonId: badSa.id }])).toThrow('VALIDATION')
    expect(() => resolveSelectedAddons(style.id, size.id, [{ styleAddonId: goodSa.id }])).not.toThrow()
  })
})

describe('B4 公开读模型 IN 变量上限（F0149）', () => {
  it('F0149: 6 处 IN 查询统一用 json_each(?)，不再生成裸 ? 占位符', () => {
    // 本机 better-sqlite3 编译 MAX_VARIABLE_NUMBER=32766，>999 ID 无法在单测复现；
    // 用静态断言锁住修法，防止回退到按 ID 数量拼占位符（生产默认上限 999）。
    const src = readFileSync(new URL('../src/features/pricing/style.public.service.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/\.map\(\(\)\s*=>\s*'\?'\)/)
    expect(src.match(/json_each\(\?\)/g)?.length ?? 0).toBeGreaterThanOrEqual(6)
  })
})

describe('B4 增项模板删除事务', () => {
  beforeEach(() => cleanDb())

  it('F0148: 删除被引用的模板先快照后解绑再删除，三步一气呵成', () => {
    const artist = seedArtist({ qq_number: '88405', subdomain: 'b4-template' })
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 150, category: 'add'
    })
    const style = styleService.createArtStyle(artist.id, { name: '测试画风', importAddons: false })
    styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const sa = styleService.getStyleAddons(style.id).find(a => a.addon_template_id === tpl.id)!

    const res = deleteAddonTemplate(artist.id, tpl.id)
    expect(res).toEqual({ deleted: true, referenced: 1 })
    const after = db.prepare('SELECT addon_template_id, tpl_name FROM style_addons WHERE id = ?').get(sa.id) as { addon_template_id: number | null; tpl_name: string }
    expect(after.addon_template_id).toBeNull()
    expect(after.tpl_name).toBe('背景')
    expect(db.prepare('SELECT id FROM addon_templates WHERE id = ?').get(tpl.id)).toBeUndefined()
  })
})
