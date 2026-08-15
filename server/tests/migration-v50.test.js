import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v50-price-model-unify-spec-price-2.js'

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

// 815 审计 P1-4 回归：崩溃残留死局——DROP orders 后、RENAME 前被杀，重启后 schema 重建的
// 空壳 orders 自带 tier_id（基线含该列）会误入重建分支，裸 CREATE orders_new 撞已存在表名死循环
describe('迁移 v50 崩溃残留恢复 (P1-4)', () => {
  const ORDERS_NEW_DDL = `
    CREATE TABLE orders_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      artist_id INTEGER NOT NULL,
      style_size_id INTEGER,
      client_qq TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_price_cents INTEGER,
      final_price_cents INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
      FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE SET NULL
    )
  `

  /** 构造崩溃现场：schema 重建的空壳 orders（含 tier_id、0 行）+ orders_new 持全量数据 */
  function buildCrashScene() {
    const mem = new Database(':memory:')
    mem.exec('CREATE TABLE artists (id INTEGER PRIMARY KEY)')
    mem.exec('CREATE TABLE style_sizes (id INTEGER PRIMARY KEY)')
    mem.exec('INSERT INTO artists (id) VALUES (1)')
    // 空壳主表：带 tier_id（基线列）、0 行——崩溃前被 DROP 后 schema 重建的形态
    mem.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, tier_id INTEGER)')
    mem.exec(ORDERS_NEW_DDL)
    mem.exec(`
      INSERT INTO orders_new (order_no, artist_id, style_size_id, client_qq, status, final_price_cents)
      VALUES ('HV-TEST-001', 1, NULL, '10001', 'wip', 88800),
             ('HV-TEST-002', 1, NULL, '10002', 'done', 12300)
    `)
    return mem
  }

  it('TC-P14-01: 空壳主表 + orders_new 持数据 → 自动恢复，不再撞表名死循环', () => {
    const mem = buildCrashScene()
    expect(() => migration.up(mem)).not.toThrow()

    const cols = mem.prepare('PRAGMA table_info(orders)').all().map((c) => c.name)
    expect(cols).toContain('style_size_id')
    expect(cols).not.toContain('tier_id')
    const n = mem.prepare('SELECT COUNT(*) AS n FROM orders').get().n
    expect(n).toBe(2)
    const money = mem.prepare('SELECT final_price_cents FROM orders WHERE order_no = ?').get('HV-TEST-001')
    expect(money.final_price_cents).toBe(88800)
    const leftover = mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders_new'").get()
    expect(leftover).toBeUndefined()
    mem.close()
  })

  it('TC-P14-02: 异常半态（主表与残留都有数据）→ 抛错中止，绝不删任一方', () => {
    const mem = buildCrashScene()
    mem.exec("INSERT INTO orders (id, tier_id) VALUES (99, 1)")
    expect(() => migration.up(mem)).toThrow(/崩溃残留半态/)
    // 两张表都还在，数据一份不丢
    expect(mem.prepare('SELECT COUNT(*) AS n FROM orders').get().n).toBe(1)
    expect(mem.prepare('SELECT COUNT(*) AS n FROM orders_new').get().n).toBe(2)
    mem.close()
  })
})
