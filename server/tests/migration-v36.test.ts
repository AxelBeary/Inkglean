import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再直导 v36——
// 否则 v36→migrate.ts→index.ts 循环求值会让 v24/v36 模块体未完成时进数组，撞顺序断言（范式同 migration-v50.test.ts）
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v36-multi-style-model.js'
import { migrateF5OldModelArtists } from '../src/db/migrate.js'

// F0081（B2 high）回归：v36 旧全局守卫（任一画师已有画风即跳过全体）改画师粒度。
// 旧形态库（addon_templates 含 pricing_mode + v09 旧表 price_tiers/price_addons）
// 直调 migration.up 验证幂等与按画师粒度行为，范式同 migration-v50.test.ts 崩溃残留用例。

/** 构造 v36 前夜旧形态库：形状守卫放行（pricing_mode 存在）+ 旧模型表可搬运 */
function buildOldShapeDb(): Database.Database {
  const mem = new Database(':memory:')
  mem.exec('CREATE TABLE artists (id INTEGER PRIMARY KEY)')
  // 旧形态 addon_templates：含 pricing_mode 列（v36 形状守卫据此判定旧库）
  mem.exec(`
    CREATE TABLE addon_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      control_type TEXT NOT NULL DEFAULT 'switch',
      pricing_mode TEXT NOT NULL DEFAULT 'fixed',
      default_price REAL NOT NULL DEFAULT 0,
      options TEXT,
      unit_label TEXT,
      sort_order INTEGER DEFAULT 0
    )
  `)
  // 旧模型表（v09 形态裁剪，仅含 v36 搬运读取的列）
  mem.exec(`
    CREATE TABLE price_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      name TEXT,
      price REAL,
      sort_order INTEGER DEFAULT 0
    )
  `)
  mem.exec(`
    CREATE TABLE price_addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_value REAL NOT NULL,
      select_mode TEXT NOT NULL DEFAULT 'quantity',
      sort_order INTEGER DEFAULT 0
    )
  `)
  return mem
}

/** 插入一名画师及其旧档位 [名称, 价格] / 旧增项 [名称, 价格, select_mode] */
function seedLegacy(
  mem: Database.Database,
  artistId: number,
  tiers: Array<[string, number]>,
  addons: Array<[string, number, string]>
): void {
  mem.prepare('INSERT INTO artists (id) VALUES (?)').run(artistId)
  const insTier = mem.prepare('INSERT INTO price_tiers (artist_id, name, price, sort_order) VALUES (?, ?, ?, ?)')
  tiers.forEach(([name, price], i) => insTier.run(artistId, name, price, i))
  const insAddon = mem.prepare('INSERT INTO price_addons (artist_id, name, price_value, select_mode, sort_order) VALUES (?, ?, ?, ?, ?)')
  addons.forEach(([name, price, mode], i) => insAddon.run(artistId, name, price, mode, i))
}

describe('迁移 v36: multi_style_model（F0081 画师粒度幂等）', () => {
  it('TC-F81-00: 全量链路（setup.js initDatabase）后五表在位，新形态不触发旧数据搬运', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 36').get() as { version: number } | undefined
    expect(applied?.version).toBe(36)
    for (const t of ['addon_templates', 'art_styles', 'style_sizes', 'style_addons', 'size_addon_overrides']) {
      expect((db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).length).toBeGreaterThan(0)
    }
    // 新形态基线：addon_templates 无 pricing_mode（形状守卫口径），空库无搬运产物
    const atCols = (db.prepare('PRAGMA table_info(addon_templates)').all() as Array<{ name: string }>).map(c => c.name)
    expect(atCols).not.toContain('pricing_mode')
    expect((db.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(0)
  })

  it('TC-F81-01: 旧形态全量画师照常搬运（档位/增项映射/默认画风关联）', () => {
    const mem = buildOldShapeDb()
    seedLegacy(mem, 1, [['头像', 100], ['全身', 300]], [['加人', 50, 'quantity'], ['加背景', 80, 'toggle'], ['加道具', 30, 'inquiry']])
    seedLegacy(mem, 2, [['半身', 200]], [])

    expect(() => migration.up(mem)).not.toThrow()

    // 两画师各 1 个「默认」画风
    const styles = mem.prepare('SELECT artist_id, name FROM art_styles ORDER BY artist_id').all() as Array<{ artist_id: number; name: string }>
    expect(styles).toHaveLength(2)
    expect(styles.every(s => s.name === '默认')).toBe(true)

    // 档位搬运保序保价
    const sizes1 = mem.prepare(`
      SELECT ss.name AS name, ss.base_price AS base_price FROM style_sizes ss
      JOIN art_styles st ON ss.art_style_id = st.id WHERE st.artist_id = 1 ORDER BY ss.sort_order
    `).all() as Array<{ name: string; base_price: number }>
    expect(sizes1.map(s => s.name)).toEqual(['头像', '全身'])
    expect(sizes1[0].base_price).toBe(100)

    // 增项搬运：toggle→switch / inquiry→radio 映射，quantity 带 unit_label「个」
    const tpls = mem.prepare(
      'SELECT name AS name, control_type AS control_type, unit_label AS unit_label, default_price AS default_price FROM addon_templates WHERE artist_id = 1 ORDER BY sort_order'
    ).all() as Array<{ name: string; control_type: string; unit_label: string | null; default_price: number }>
    expect(tpls.map(t => t.name)).toEqual(['加人', '加背景', '加道具'])
    expect(tpls[0]).toMatchObject({ control_type: 'quantity', unit_label: '个', default_price: 50 })
    expect(tpls[1]).toMatchObject({ control_type: 'switch', unit_label: null })
    expect(tpls[2]).toMatchObject({ control_type: 'radio' })

    // 默认画风关联全部增项模板
    const links = mem.prepare(`
      SELECT COUNT(*) AS c FROM style_addons sa JOIN art_styles st ON sa.art_style_id = st.id WHERE st.artist_id = 1
    `).get() as { c: number }
    expect(links.c).toBe(3)
    mem.close()
  })

  it('TC-F81-02: 部分已迁移——已有画风的画师跳过，其余画师照常迁移（F0081 核心）', () => {
    const mem = buildOldShapeDb()
    // artist 1：先前一轮已迁移（画风+模板已落库），旧表残留仍在
    seedLegacy(mem, 1, [['头像', 100]], [['加背景', 80, 'toggle']])
    mem.exec(`
      CREATE TABLE art_styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        name TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      )
    `)
    mem.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (1, '默认', 0, 1)").run()
    mem.prepare(
      "INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, sort_order) VALUES (1, '加背景', 'switch', 'fixed', 80, 0)"
    ).run()
    // artist 2：后建画师从未迁移——旧全局守卫会因 artist 1 已有画风而放弃全体
    seedLegacy(mem, 2, [['半身', 200]], [['加人', 50, 'quantity']])

    const tplCountBefore = (mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = 1').get() as { c: number }).c
    expect(() => migration.up(mem)).not.toThrow()

    // artist 1 不重复迁移：画风仍 1 行、模板不重复插入
    expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = 1').get() as { c: number }).c).toBe(1)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = 1').get() as { c: number }).c).toBe(tplCountBefore)

    // artist 2 补齐：画风 + 档位 + 增项
    expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = 2').get() as { c: number }).c).toBe(1)
    const sizes2 = mem.prepare(`
      SELECT ss.name AS name FROM style_sizes ss
      JOIN art_styles st ON ss.art_style_id = st.id WHERE st.artist_id = 2
    `).all() as Array<{ name: string }>
    expect(sizes2.map(s => s.name)).toEqual(['半身'])
    const tpl2 = mem.prepare(
      'SELECT name AS name, control_type AS control_type FROM addon_templates WHERE artist_id = 2'
    ).all() as Array<{ name: string; control_type: string }>
    expect(tpl2).toHaveLength(1)
    expect(tpl2[0]).toMatchObject({ name: '加人', control_type: 'quantity' })
    mem.close()
  })

  it('TC-F81-03: 幂等——连续重跑不产生重复行', () => {
    const mem = buildOldShapeDb()
    seedLegacy(mem, 1, [['头像', 100]], [['加背景', 80, 'toggle']])
    migration.up(mem)

    const counts = () => ({
      styles: (mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c,
      sizes: (mem.prepare('SELECT COUNT(*) AS c FROM style_sizes').get() as { c: number }).c,
      templates: (mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c,
      links: (mem.prepare('SELECT COUNT(*) AS c FROM style_addons').get() as { c: number }).c
    })
    const afterFirst = counts()
    expect(afterFirst).toEqual({ styles: 1, sizes: 1, templates: 1, links: 1 })

    expect(() => migration.up(mem)).not.toThrow()
    expect(counts()).toEqual(afterFirst)
    mem.close()
  })

  it('TC-F81-04: 修复重放撞 v43 冻结态——price_addons 已 DROP，跳过搬运不崩溃', () => {
    const mem = buildOldShapeDb()
    mem.exec('DROP TABLE price_addons') // v43 已按用户拍板 DROP（存量当时仅测试垃圾数据）
    mem.prepare('INSERT INTO artists (id) VALUES (?)').run(1)
    mem.prepare('INSERT INTO price_tiers (artist_id, name, price) VALUES (1, ?, ?)').run('头像', 100)

    expect(() => migration.up(mem)).not.toThrow()
    // 无可搬数据：不建默认画风、不搬档位（禁止从残缺旧表半态回填）
    expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(0)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM style_sizes').get() as { c: number }).c).toBe(0)
    mem.close()
  })

  it('TC-F81-05: 新形态基线（addon_templates 无 pricing_mode）——形状守卫跳过搬运', () => {
    const mem = new Database(':memory:')
    mem.exec('CREATE TABLE artists (id INTEGER PRIMARY KEY)')
    // 新形态：v50 后列名是 price_mode，形状守卫应直接返回
    mem.exec(`
      CREATE TABLE addon_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER,
        name TEXT NOT NULL,
        control_type TEXT NOT NULL DEFAULT 'switch',
        price_mode TEXT NOT NULL DEFAULT 'fixed',
        default_price REAL NOT NULL DEFAULT 0,
        unit_label TEXT,
        sort_order INTEGER DEFAULT 0,
        category TEXT NOT NULL DEFAULT 'add'
      )
    `)
    mem.exec('CREATE TABLE price_tiers (id INTEGER PRIMARY KEY, artist_id INTEGER NOT NULL, name TEXT, price REAL, sort_order INTEGER DEFAULT 0)')
    mem.exec('CREATE TABLE price_addons (id INTEGER PRIMARY KEY, artist_id INTEGER NOT NULL, name TEXT, price_value REAL, select_mode TEXT, sort_order INTEGER DEFAULT 0)')
    mem.prepare('INSERT INTO artists (id) VALUES (?)').run(1)
    mem.prepare('INSERT INTO price_tiers (artist_id, name, price) VALUES (1, ?, ?)').run('头像', 100)

    expect(() => migration.up(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(0)
    mem.close()
  })

  it('TC-F81-06 (PR114 M-1): F5 补过画风的画师仍能搬运旧增项（Control/Probe 对照）', () => {
    const mem = buildOldShapeDb()
    // F5 守卫读 artists.deleted_at；F5 尺寸搬运读 price_tiers.visibility
    mem.exec('ALTER TABLE artists ADD COLUMN deleted_at DATETIME DEFAULT NULL')
    mem.exec("ALTER TABLE price_tiers ADD COLUMN visibility TEXT DEFAULT 'visible'")
    // 生产链路上 v36/v37 已建好这两表，F5 直接往里写（本用例显式补齐前置形态）
    mem.exec(`
      CREATE TABLE art_styles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        name TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      )
    `)
    mem.exec(`
      CREATE TABLE style_sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        art_style_id INTEGER NOT NULL,
        name TEXT,
        base_price REAL,
        sort_order INTEGER DEFAULT 0
      )
    `)
    // Control：从未被 F5 处理的画师（无画风）
    seedLegacy(mem, 1, [['头像', 100]], [['对照增项', 50, 'toggle']])
    // Probe：F5 补过画风+尺寸、但无 addon_templates 的画师（旧代理键会整块跳过）
    seedLegacy(mem, 2, [['半身', 200]], [['探针遗留增项', 80, 'quantity']])

    migrateF5OldModelArtists(mem)
    // F5 后两画师都有画风+尺寸，但都没有增项模板——正是 M-1 的触发形态
    expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(2)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM style_sizes').get() as { c: number }).c).toBe(2)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(0)

    expect(() => migration.up(mem)).not.toThrow()

    // Control 与 Probe 的旧增项都必须进目标表（探针不再被静默丢弃）
    const names = (mem.prepare('SELECT name FROM addon_templates ORDER BY artist_id, sort_order').all() as Array<{ name: string }>).map(r => r.name)
    expect(names).toEqual(['对照增项', '探针遗留增项'])
    // Probe 沿用 F5 建的画风，不重建；模板已挂到该画风
    expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = 2').get() as { c: number }).c).toBe(1)
    const probeLinks = mem.prepare(`
      SELECT COUNT(*) AS c FROM style_addons sa
      JOIN art_styles st ON sa.art_style_id = st.id WHERE st.artist_id = 2
    `).get() as { c: number }
    expect(probeLinks.c).toBe(1)
    mem.close()
  })

  it('TC-F81-07 (PR114 M-2): 删画风模拟重放——同名模板不翻倍', () => {
    const mem = buildOldShapeDb()
    seedLegacy(mem, 1, [['头像', 100]], [['加背景', 80, 'toggle']])
    migration.up(mem)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(1)

    // 模拟版本表丢失后的重放：删除画风及其关联/尺寸，旧增项模板仍在
    mem.exec('DELETE FROM style_addons')
    mem.exec('DELETE FROM style_sizes')
    mem.exec('DELETE FROM art_styles')
    expect(() => migration.up(mem)).not.toThrow()

    const tpls = mem.prepare('SELECT name FROM addon_templates ORDER BY sort_order').all() as Array<{ name: string }>
    expect(tpls.map(t => t.name)).toEqual(['加背景'])
    mem.close()
  })
})
