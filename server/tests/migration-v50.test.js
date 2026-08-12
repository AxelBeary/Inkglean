import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// v50 (SPEC-PRICE-2): 价格模型统一——orders 重建为 style_size_id 模型、
// addon_templates/style_addons 快照列对齐新维度、order_price_breakdown 新 item_type 口径、
// DROP price_tiers/price_multipliers
// setup.js import 时 initDatabase 已跑全量迁移（含 v50），以下按迁移真实产物做回读断言
describe('迁移 v50: price_model_unify_spec_price_2', () => {
  const tableCols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  const tableExists = (table) => !!db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(table)

  it('TC-MV-04: v50 已应用且 orders 重建为 style_size_id 模型', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 50'
    ).get()
    expect(applied?.version).toBe(50)

    const oCols = tableCols('orders')
    expect(oCols).toContain('style_size_id')
    expect(oCols).not.toContain('tier_id')
    expect(oCols).not.toContain('usage_multiplier_id')
    expect(oCols).not.toContain('rush_multiplier_id')
  })

  it('TC-MV-05: 价格模型新口径落库（breakdown/addon_templates/style_addons）', () => {
    const bdSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'order_price_breakdown'"
    ).get()?.sql
    expect(bdSql).toContain('addon_fixed')

    const atCols = tableCols('addon_templates')
    expect(atCols).toContain('category')
    expect(atCols).toContain('price_mode')
    expect(atCols).not.toContain('kind')

    const saCols = tableCols('style_addons')
    expect(saCols).toContain('tpl_price_mode')
    expect(saCols).toContain('tpl_category')
    expect(saCols).not.toContain('tpl_kind')
  })

  it('TC-MV-06: 旧模型表 price_tiers / price_multipliers 已清退', () => {
    expect(tableExists('price_tiers')).toBe(false)
    expect(tableExists('price_multipliers')).toBe(false)
  })

  it('TC-MV-07: 幂等——重跑 initDatabase 不报错且新模型结构仍在', () => {
    expect(() => initDatabase(db)).not.toThrow()

    const oCols = tableCols('orders')
    expect(oCols).toContain('style_size_id')
    expect(oCols).not.toContain('tier_id')

    const bdSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'order_price_breakdown'"
    ).get()?.sql
    expect(bdSql).toContain('addon_fixed')

    const atCols = tableCols('addon_templates')
    expect(atCols).toContain('category')
    expect(atCols).not.toContain('kind')

    const saCols = tableCols('style_addons')
    expect(saCols).toContain('tpl_price_mode')
    expect(saCols).not.toContain('tpl_kind')
  })
})
