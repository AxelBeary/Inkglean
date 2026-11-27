import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再谈驱动——
// 否则模块循环求值会让迁移体未完成时进数组，撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/init.js'
import { preTargetDb, buildPreTarget, isApplied, columnNames, tableExists } from './migration-real-entry.js'

// ============================================================
// 迁移 v50 (SPEC-PRICE-2): 价格模型统一
//   orders 重建为 style_size_id 模型、addon_templates/style_addons 快照列对齐新维度、
//   order_price_breakdown 新 item_type 口径、DROP price_tiers/price_multipliers
//
// 【真实入口改造 · issue #117 判据】原用例的崩溃残留段落直调 `migration.up(mem)`。
// v50 是**最重的 noTransaction 迁移**（重建 4 张表 + DROP 2 张表 + 关 FK + 收尾
// foreign_key_check），真实路径是「调度器 COMMIT 释放锁 → 事务外执行 → 重新抢锁 +
// 刷新 applied」——直调根本走不到这段。现全部改走 preTargetDb / buildPreTarget，
// 由 initDatabase 调度器自己跑到 v50。断言逐条对应改造前，未削弱。
// ============================================================

/**
 * 把基线库手术回 v50 前夜（v49 形态）：
 * - orders 重建为 v49 形（有 tier_id/usage_multiplier_id/rush_multiplier_id、无 style_size_id。
 *   不能 DROP COLUMN style_size_id —— 它挂在 FK 上，SQLite 直接拒绝）
 * - addon_templates 回 v49 形（kind + pricing_mode，无 price_mode/category）
 * - style_addons 回 v49 形（tpl_kind，无 tpl_price_mode/tpl_category）
 * - order_price_breakdown 回旧 item_type 口径（tier/addon/...）
 * - price_multipliers 摆回来（v50 才 DROP）
 */
function revertToV49(d: Database.Database): void {
  d.exec('PRAGMA foreign_keys = OFF')
  try {
    d.exec(`
      CREATE TABLE orders_v49 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        artist_id INTEGER NOT NULL,
        tier_id INTEGER,
        usage_multiplier_id INTEGER,
        rush_multiplier_id INTEGER,
        client_qq TEXT NOT NULL,
        client_name TEXT,
        description TEXT,
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','wip','revision','done','delivered','cancelled')),
        source TEXT DEFAULT 'self' CHECK(source IN ('self', 'manual')),
        client_notify INTEGER DEFAULT 0,
        queue_position INTEGER,
        completed_at DATETIME,
        price_snapshot REAL,
        total_price_cents INTEGER,
        quote_snapshot TEXT,
        final_price_cents INTEGER,
        focus_image_path TEXT,
        focus_image_mode TEXT DEFAULT 'off',
        current_stage_id INTEGER,
        deadline DATETIME,
        start_date TEXT DEFAULT NULL,
        queue_zone TEXT DEFAULT 'formal',
        paid_total_cents INTEGER DEFAULT 0,
        discount_code_id INTEGER DEFAULT NULL,
        discount_amount_cents INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    d.exec('DROP TABLE orders')
    d.exec('ALTER TABLE orders_v49 RENAME TO orders')
  } finally {
    d.pragma('foreign_keys = ON')
  }

  d.exec('DROP TABLE IF EXISTS addon_templates')
  d.exec(`
    CREATE TABLE addon_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER,
      name TEXT NOT NULL,
      control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity','radio')),
      pricing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_mode IN ('fixed','per_unit','per_option')),
      default_price REAL NOT NULL DEFAULT 0,
      options TEXT,
      unit_label TEXT,
      sort_order INTEGER DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'add',
      max_quantity INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  d.exec('DROP TABLE IF EXISTS style_addons')
  d.exec(`
    CREATE TABLE style_addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      art_style_id INTEGER NOT NULL,
      addon_template_id INTEGER,
      is_enabled INTEGER DEFAULT 1,
      price_override REAL,
      tpl_name TEXT,
      tpl_control_type TEXT,
      tpl_kind TEXT,
      tpl_default_price REAL,
      tpl_unit_label TEXT,
      tpl_max_quantity INTEGER,
      UNIQUE(art_style_id, addon_template_id)
    )
  `)
  d.exec('DROP TABLE IF EXISTS order_price_breakdown')
  d.exec(`
    CREATE TABLE order_price_breakdown (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('tier','addon','usage','rush','discount')),
      item_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      multiplier REAL DEFAULT 1.0,
      quantity INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    )
  `)
  d.exec('CREATE TABLE IF NOT EXISTS price_multipliers (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL, name TEXT, factor REAL)')

  // 前置自检：夹具确实是 v49 形态 —— 否则 v50 的各段幂等守卫会连带早退 → 断言假绿
  if (columnNames(d, 'orders').includes('style_size_id')) throw new Error('夹具未退回 v49 形态：orders 仍有 style_size_id')
  if (!columnNames(d, 'orders').includes('tier_id')) throw new Error('夹具未退回 v49 形态：orders 缺 tier_id')
  if (!columnNames(d, 'addon_templates').includes('kind')) throw new Error('夹具未退回 v49 形态：addon_templates 缺 kind')
  if (columnNames(d, 'addon_templates').includes('category')) throw new Error('夹具未退回 v49 形态：addon_templates 已有 category')
  if (!columnNames(d, 'style_addons').includes('tpl_kind')) throw new Error('夹具未退回 v49 形态：style_addons 缺 tpl_kind')
  if (!tableExists(d, 'price_multipliers')) throw new Error('夹具未退回 v49 形态：price_multipliers 不存在')
}

/** 在 v49 形态库上塞一套完整存量数据（画师/画风/尺寸/增项/订单/报价明细） */
function seedLegacyPricing(d: Database.Database): void {
  d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '50001', '价格画师', 'price-artist')")
  d.exec("INSERT INTO art_styles (id, artist_id, name) VALUES (1, 1, '默认')")
  d.exec("INSERT INTO style_sizes (id, art_style_id, name, base_price) VALUES (1, 1, '头像', 100)")
  // v49 形：kind=multiply 表示倍率（→ percent/usage 或 rush），add 表示加法增项
  d.exec("INSERT INTO addon_templates (id, artist_id, name, default_price, kind, control_type) VALUES (1, 1, '加急费', 50, 'multiply', 'switch'), (2, 1, '加背景', 80, 'add', 'switch')")
  d.exec("INSERT INTO orders (id, order_no, artist_id, client_qq, tier_id, usage_multiplier_id, rush_multiplier_id, final_price_cents) VALUES (1, 'PO-001', 1, '5000', 1, NULL, 1, 12345)")
  d.exec("INSERT INTO order_price_breakdown (order_id, item_type, item_name, amount_cents) VALUES (1, 'tier', '头像', 100), (1, 'addon', '加背景', 80)")
}

describe('迁移 v50: price_model_unify_spec_price_2', () => {
  const tableCols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
  const tableExistsIn = (table: string) => !!db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(table)

  it('TC-MV-04: v50 已应用且 orders 重建为 style_size_id 模型', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 50'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(50)

    const oCols = tableCols('orders')
    expect(oCols).toContain('style_size_id')
    expect(oCols).not.toContain('tier_id')
    expect(oCols).not.toContain('usage_multiplier_id')
    expect(oCols).not.toContain('rush_multiplier_id')
  })

  it('TC-MV-05: 价格模型新口径落库（breakdown/addon_templates/style_addons）', () => {
    const bdSql = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'order_price_breakdown'"
    ).get() as { sql: string } | undefined)?.sql
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
    expect(tableExistsIn('price_tiers')).toBe(false)
    expect(tableExistsIn('price_multipliers')).toBe(false)
  })

  it('TC-MV-07: 幂等——重跑 initDatabase 不报错且新模型结构仍在', () => {
    expect(() => initDatabase(db)).not.toThrow()

    const oCols = tableCols('orders')
    expect(oCols).toContain('style_size_id')
    expect(oCols).not.toContain('tier_id')

    const bdSql = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'order_price_breakdown'"
    ).get() as { sql: string } | undefined)?.sql
    expect(bdSql).toContain('addon_fixed')

    const atCols = tableCols('addon_templates')
    expect(atCols).toContain('category')
    expect(atCols).not.toContain('kind')

    const saCols = tableCols('style_addons')
    expect(saCols).toContain('tpl_price_mode')
    expect(saCols).not.toContain('tpl_kind')
  })
})

// 真实入口下的完整升级：由 initDatabase 调度器在 v49 形态库上跑到 v50
describe('迁移 v50 老库升级与数据搬运（真实入口）', () => {
  it('TC-MV50-R1: v49 形态库升级——四表重建、旧口径映射、旧表清退、存量不丢', () => {
    const mem = preTargetDb(50, d => {
      revertToV49(d)
      seedLegacyPricing(d)
    })
    try {
      expect(isApplied(mem, 50), 'v50 版本行应由调度器写入').toBe(true)

      // ─── orders：style_size_id 模型，三列移除，存量金额一字不差 ───
      const oCols = columnNames(mem, 'orders')
      expect(oCols).toContain('style_size_id')
      expect(oCols).not.toContain('tier_id')
      expect(oCols).not.toContain('usage_multiplier_id')
      expect(oCols).not.toContain('rush_multiplier_id')
      const order = mem.prepare('SELECT order_no, final_price_cents FROM orders').all() as Array<{ order_no: string; final_price_cents: number }>
      expect(order).toEqual([{ order_no: 'PO-001', final_price_cents: 12345 }])

      // ─── addon_templates：kind 退役，percent/加急 按名称约定落 category ───
      const tpls = mem.prepare('SELECT name, price_mode, category, default_price FROM addon_templates ORDER BY id').all() as Array<{ name: string; price_mode: string; category: string; default_price: number }>
      expect(tpls).toEqual([
        { name: '加急费', price_mode: 'percent', category: 'rush', default_price: 50 },
        { name: '加背景', price_mode: 'fixed', category: 'add', default_price: 80 }
      ])

      // ─── order_price_breakdown：tier→base、addon→addon_fixed ───
      const bd = mem.prepare('SELECT item_type, item_name, amount_cents FROM order_price_breakdown ORDER BY id').all()
      expect(bd).toEqual([
        { item_type: 'base', item_name: '头像', amount_cents: 100 },
        { item_type: 'addon_fixed', item_name: '加背景', amount_cents: 80 }
      ])

      // ─── 旧表清退 + FK 已恢复 + 无悬空引用 ───
      expect(tableExists(mem, 'price_tiers')).toBe(false)
      expect(tableExists(mem, 'price_multipliers')).toBe(false)
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(mem.pragma('foreign_key_check')).toEqual([])
    } finally {
      mem.close()
    }
  })

  it('TC-MV50-R2: 幂等——版本行删掉后由调度器重放 v50，结构与数据不漂移', () => {
    const mem = preTargetDb(50, d => {
      revertToV49(d)
      seedLegacyPricing(d)
    })
    try {
      const snapshot = () => ({
        orders: mem.prepare('SELECT order_no, final_price_cents FROM orders ORDER BY id').all(),
        templates: mem.prepare('SELECT name, price_mode, category FROM addon_templates ORDER BY id').all(),
        breakdown: mem.prepare('SELECT item_type, item_name FROM order_price_breakdown ORDER BY id').all()
      })
      const before = snapshot()
      mem.prepare('DELETE FROM schema_migrations WHERE version = 50').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 50)).toBe(true)
      expect(snapshot()).toEqual(before)
    } finally {
      mem.close()
    }
  })
})

// 815 审计 P1-4 回归：崩溃残留死局——DROP orders 后、RENAME 前被杀，重启后 schema 重建的
// 空壳 orders 自带 tier_id（基线含该列）会误入重建分支，裸 CREATE orders_new 撞已存在表名死循环
describe('迁移 v50 崩溃残留恢复 (P1-4，真实入口)', () => {
  /**
   * 构造崩溃现场：schema 重建的空壳 orders（含 tier_id、0 行）+ orders_new 持全量数据。
   * 具体做法——先把库退回 v49 形态并塞好数据，再把 orders 换成「空壳 + 独立 orders_new」。
   */
  function buildCrashScene(d: Database.Database): void {
    revertToV49(d)
    d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '50002', '崩溃画师', 'crash-artist')")
    // 空壳主表：带 tier_id（基线列）、0 行——崩溃前被 DROP 后 schema 重建的形态
    d.exec('DROP TABLE IF EXISTS orders')
    d.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, tier_id INTEGER)')
    // orders_new 的 DDL 必须与 v50 真实产物同形——崩溃发生在「v50 已建好 orders_new、
    // 尚未 RENAME」的瞬间，此时 _new 已被完整创建。用裁减版会让 RENAME 后的 orders
    // 缺列（schemaIndexes 随后要建 orders(artist_id, queue_position) 索引 → 崩）。
    d.exec(`
      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        artist_id INTEGER NOT NULL,
        style_size_id INTEGER,
        client_qq TEXT NOT NULL,
        client_name TEXT,
        description TEXT,
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
        status TEXT DEFAULT 'pending' CHECK(status IN (
          'pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled'
        )),
        source TEXT DEFAULT 'self' CHECK(source IN ('self', 'manual')),
        client_notify INTEGER DEFAULT 0,
        queue_position INTEGER,
        completed_at DATETIME,
        price_snapshot REAL,
        total_price_cents INTEGER,
        quote_snapshot TEXT,
        final_price_cents INTEGER,
        focus_image_path TEXT,
        focus_image_mode TEXT DEFAULT 'off',
        current_stage_id INTEGER,
        deadline DATETIME,
        start_date TEXT DEFAULT NULL,
        queue_zone TEXT DEFAULT 'formal',
        paid_total_cents INTEGER DEFAULT 0,
        discount_code_id INTEGER DEFAULT NULL,
        discount_amount_cents INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
        FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE SET NULL
      )
    `)
    d.exec(`
      INSERT INTO orders_new (order_no, artist_id, style_size_id, client_qq, status, final_price_cents)
      VALUES ('HV-TEST-001', 1, NULL, '10001', 'wip', 88800),
             ('HV-TEST-002', 1, NULL, '10002', 'done', 12300)
    `)
  }

  it('TC-P14-01: 空壳主表 + orders_new 持数据 → 自动恢复，不再撞表名死循环', () => {
    const mem = preTargetDb(50, buildCrashScene)
    try {
      expect(isApplied(mem, 50), 'v50 版本行应由调度器写入').toBe(true)

      const cols = columnNames(mem, 'orders')
      expect(cols).toContain('style_size_id')
      expect(cols).not.toContain('tier_id')
      const n = (mem.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n
      expect(n).toBe(2)
      const money = mem.prepare('SELECT final_price_cents FROM orders WHERE order_no = ?').get('HV-TEST-001') as { final_price_cents: number }
      expect(money.final_price_cents).toBe(88800)
      expect(tableExists(mem, 'orders_new')).toBe(false)
    } finally {
      mem.close()
    }
  })

  it('TC-P14-02: 异常半态（主表与残留都有数据）→ 抛错中止，绝不删任一方', () => {
    // 用 buildPreTarget（不跑调度器）——本用例断言迁移必须抛错
    const mem = buildPreTarget(50, d => {
      buildCrashScene(d)
      d.exec('INSERT INTO orders (id, tier_id) VALUES (99, 1)')
    })
    try {
      expect(() => initDatabase(mem)).toThrow(/崩溃残留半态/)
      // 两张表都还在，数据一份不丢
      expect((mem.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n).toBe(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM orders_new').get() as { n: number }).n).toBe(2)
      // 调度器失败后不得把 v50 记成已应用（否则下次启动永久跳过，数据卡死在半态）
      expect(isApplied(mem, 50)).toBe(false)
      // 失败路径必须把 FK 恢复 ON（否则同连接后续 CASCADE 全部失效）
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      mem.close()
    }
  })
})
