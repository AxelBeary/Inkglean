import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再直导 v85/修复函数——
// 否则迁移模块循环求值会撞版本升序断言（范式同 migration-v36/v84.test.ts）
import './setup.js'
import Database from 'better-sqlite3'
import { initDatabase, schema } from '../src/db/init.js'
import { backfillLegacyAddons } from '../src/db/legacy-addon-backfill.js'

/**
 * DB-1 历史修复回归：v36 守卫改判是原地改写历史迁移，对已应用 v36 的库永不重放（v36/v37 已记录），
 * 故修复落在 initDatabase() 的「迁移链之前」：仅当 price_addons 仍在（version<43 窗口）时，
 * 为「有画风、无增项模板」的画师搬旧增项；≥43 的库旧表已被 v43 DROP → 天然 no-op。
 *
 * 这里**不直调 migration.up**——必须走真 initDatabase + 真 schema_migrations 行，
 * 才能钉住「版本语义下依然生效」这一点（v36 的 TC-F81-06 直调 up，绕开版本语义）。
 * 覆盖两批人群：pre-v36 老库（v36 五表都不存在，靠启动修复搬）与 v37 态/部分迁移库。
 */

interface LegacyFixtureOptions {
  /** 已应用的版本上限（模拟 upgrade 起点）。37 = v36/v37 已记录的可回收窗口 */
  appliedUpTo: number
}

/** 画师行 + 画风 + 旧模型增项；返回 id 便于断言 */
function seedLegacyArtist(
  database: Database.Database,
  input: { qq: string; name: string; addons: Array<[string, number, string]>; withTemplate?: string }
): { artistId: number; styleId: number } {
  const artistId = Number(database.prepare(
    "INSERT INTO artists (qq_number, name, subdomain, artist_code, status, totp_secret, totp_verified) VALUES (?, ?, ?, ?, 'hidden', 'JBSWY3DPEHPK3PXP', 1)"
  ).run(input.qq, input.name, input.name, input.name.toUpperCase()).lastInsertRowid)
  // F5 补过画风的形态：有画风 + 尺寸，无增项模板
  const styleId = Number(database.prepare(
    "INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)"
  ).run(artistId).lastInsertRowid)
  database.prepare("INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, '头像', 100)").run(styleId)
  if (input.addons.length > 0) {
    const insertAddon = database.prepare(
      'INSERT INTO price_addons (artist_id, name, price_value, select_mode, sort_order) VALUES (?, ?, ?, ?, ?)'
    )
    input.addons.forEach(([name, price, mode], i) => insertAddon.run(artistId, name, price, mode, i))
  }
  if (input.withTemplate) {
    // 已迁移过的画师：已有模板 → 修复必须跳过（不许重复插）
    database.prepare(
      "INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, sort_order) VALUES (?, ?, 'switch', 'fixed', 60, 0)"
    ).run(artistId, input.withTemplate)
  }
  return { artistId, styleId }
}

/**
 * 构造「v1 升级态」库：schema 终态基线（保证 v38+ 链所需表/列都在，各重建迁移的形状守卫会跳过）
 * + 把 addon_templates 还原成 v36 形态（含 pricing_mode，CHECK 允许 radio）+ 旧模型表 + 版本行。
 * 这样 v38..v85 会真实跑一遍，且修复函数看到的是 v36/v49 期的目标表形状。
 */
function buildUpgradeStateDb(options: LegacyFixtureOptions): Database.Database {
  const mem = new Database(':memory:')
  mem.pragma('foreign_keys = ON')
  mem.exec(schema)

  mem.exec('DROP TABLE addon_templates')
  mem.exec(`
    CREATE TABLE addon_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity','radio')),
      pricing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_mode IN ('fixed','per_unit','per_option')),
      default_price REAL NOT NULL DEFAULT 0,
      options TEXT,
      unit_label TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    )
  `)
  // price_tiers 由 schema 基线保留（注释明写「仅维持迁移链完整」），v25 给它加的 visibility 列手工补上：
  // 真实 v36 前的库已跑过 v25，F5（v37）按 visibility 过滤档位
  mem.exec("ALTER TABLE price_tiers ADD COLUMN visibility TEXT DEFAULT 'visible'")
  mem.exec(`
    CREATE TABLE price_addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_value REAL NOT NULL,
      select_mode TEXT NOT NULL DEFAULT 'quantity',
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    )
  `)

  const markApplied = mem.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
  for (let version = 1; version <= options.appliedUpTo; version++) {
    markApplied.run(version, `v${version}`)
  }
  return mem
}

/**
 * 真实 pre-v36（v35 及更早）形态库：v36 才出现的五张表**一张都不存在**，旧模型两张表带数据。
 * HIGH-1 返工点：旧用例手工把 addon_templates 造成 v36 旧形状（含 pricing_mode）是假绿——
 * 真实 v35 库不可能有该表；initDatabase 会先 exec(schema) 把 addon_templates 建成**当前形状**，
 * 于是 v36 的形状守卫（!includes('pricing_mode')）直接 return，旧增项只能由启动期修复搬。
 * 其余表（artists 等）用基线形状即可：多余的新列只让后续迁移的 ALTER 守卫跳过，不影响任何断言。
 */
function buildPreV36Db(): Database.Database {
  const mem = new Database(':memory:')
  mem.pragma('foreign_keys = ON')
  mem.exec(schema)
  // 删掉 v36 引入的五张表（按 FK 依赖先子后父）；此时 art_styles/addon_templates 完全不存在
  mem.exec(`
    DROP TABLE IF EXISTS size_addon_overrides;
    DROP TABLE IF EXISTS style_addons;
    DROP TABLE IF EXISTS style_sizes;
    DROP TABLE IF EXISTS art_styles;
    DROP TABLE IF EXISTS addon_templates;
  `)
  // v25（v35 前已应用）给 price_tiers 加的 visibility——v37 的 F5 按它过滤档位
  mem.exec("ALTER TABLE price_tiers ADD COLUMN visibility TEXT DEFAULT 'visible'")
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
  const markApplied = mem.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
  for (let version = 1; version <= 35; version++) markApplied.run(version, `v${version}`)
  return mem
}

const templateRows = (database: Database.Database, artistId: number) => database.prepare(
  'SELECT name, control_type, price_mode, default_price, unit_label, sort_order FROM addon_templates WHERE artist_id = ? ORDER BY sort_order, id'
).all(artistId) as Array<{ name: string; control_type: string; price_mode: string; default_price: number; unit_label: string | null; sort_order: number }>

describe('DB-1 历史修复：price_addons → addon_templates（走真 initDatabase）', () => {
  it('TC-DB1-01: v37 态（v36/v37 已记录、旧表仍在）→ 启动修复搬运，且后续 v43/v49/v50 链不丢数据', () => {
    const mem = buildUpgradeStateDb({ appliedUpTo: 37 })
    const carol = seedLegacyArtist(mem, {
      qq: '90001',
      name: 'carol',
      addons: [['加人', 50, 'quantity'], ['加背景', 80, 'toggle'], ['加道具', 30, 'inquiry']]
    })
    // 对照：旧增项已有同名模板（人工维护过 default_price=60）→ 逐名去重，不得重复插、不得覆盖原值
    const control = seedLegacyArtist(mem, {
      qq: '90002',
      name: 'control',
      addons: [['加背景', 80, 'toggle']],
      withTemplate: '加背景'
    })

    // 前置：carol 有画风、无模板（M-1 受害形态）
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = ?').get(carol.artistId) as { c: number }).c).toBe(0)

    initDatabase(mem)

    // 1) 搬运成功：三条旧增项进目标表（v50 重建后统一为 price_mode/fixed，radio 已退役 → switch）
    expect(templateRows(mem, carol.artistId)).toEqual([
      { name: '加人', control_type: 'quantity', price_mode: 'fixed', default_price: 50, unit_label: '个', sort_order: 0 },
      { name: '加背景', control_type: 'switch', price_mode: 'fixed', default_price: 80, unit_label: null, sort_order: 1 },
      { name: '加道具', control_type: 'switch', price_mode: 'fixed', default_price: 30, unit_label: null, sort_order: 2 }
    ])
    // 2) 同名旧增项已有人工维护的模板：不得重复插、不得覆盖原值（60 而非旧表 80）
    expect(templateRows(mem, control.artistId)).toEqual([
      { name: '加背景', control_type: 'switch', price_mode: 'fixed', default_price: 60, unit_label: null, sort_order: 0 }
    ])
    // 3) v85 把搬运来的模板补链到该画师首个画风（DB-4 与本修复的联动）
    const links = mem.prepare(`
      SELECT COUNT(*) AS c FROM style_addons sa JOIN art_styles st ON st.id = sa.art_style_id WHERE st.artist_id = ?
    `).get(carol.artistId) as { c: number }
    expect(links.c).toBe(3)
    // 4) 链跑完后旧表已被 v43 按拍板 DROP（修复窗口到此关闭，之后只能人工重录）
    expect(mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='price_addons'").get()).toBeUndefined()
    // 5) v85 已登记并应用
    expect((mem.prepare('SELECT version FROM schema_migrations WHERE version = 85').get() as { version: number } | undefined)?.version).toBe(85)
    mem.close()
  })

  it('TC-DB1-02: v50 态（price_addons 已 DROP）→ 修复 no-op、不抛错、不动既有数据', () => {
    // v50 态：终态基线 + 版本行 1..50，旧表已被 v43/v50 按拍板 DROP（真实 ≥50 库的形态）
    const mem = new Database(':memory:')
    mem.pragma('foreign_keys = ON')
    mem.exec(schema)
    mem.exec('DROP TABLE price_tiers')
    const markApplied = mem.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
    for (let version = 1; version <= 50; version++) markApplied.run(version, `v${version}`)
    const artist = seedLegacyArtist(mem, { qq: '90003', name: 'dave', addons: [] })
    mem.prepare(
      "INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, sort_order) VALUES (?, '手工增项', 'switch', 'fixed', 20, 0)"
    ).run(artist.artistId)

    expect(() => initDatabase(mem)).not.toThrow()
    expect(backfillLegacyAddons(mem)).toEqual({ artists: 0, templates: 0 })
    // 既有模板原样（不多不少），关联由 v85 补（1 条，指向首个画风）
    expect(templateRows(mem, artist.artistId)).toHaveLength(1)
    const links = mem.prepare(`
      SELECT COUNT(*) AS c FROM style_addons sa JOIN art_styles st ON st.id = sa.art_style_id WHERE st.artist_id = ?
    `).get(artist.artistId) as { c: number }
    expect(links.c).toBe(1)
    mem.close()
  })

  it('TC-DB1-03: 重复启动幂等——第二次 initDatabase 不新增模板', () => {
    const mem = buildUpgradeStateDb({ appliedUpTo: 37 })
    const carol = seedLegacyArtist(mem, { qq: '90004', name: 'erin', addons: [['加人', 50, 'quantity']] })
    initDatabase(mem)
    const afterFirst = (mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = ?').get(carol.artistId) as { c: number }).c
    expect(afterFirst).toBe(1)
    expect(() => initDatabase(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = ?').get(carol.artistId) as { c: number }).c).toBe(1)
    mem.close()
  })

  it('TC-DB1-04 (HIGH-1 返工): 真实 pre-v36 老库直接升级——启动修复搬旧增项，F5 建画风，v85 补链', () => {
    const mem = buildPreV36Db()
    // 前置：真实 v35 库没有 v36 的五张表（旧用例手工造旧形状 addon_templates 是假绿）
    for (const table of ['addon_templates', 'art_styles', 'style_sizes', 'style_addons', 'size_addon_overrides']) {
      expect(mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table), `v35 库不应有 ${table}`).toBeUndefined()
    }
    const artistId = Number(mem.prepare(
      "INSERT INTO artists (qq_number, name, subdomain, artist_code, status, totp_secret, totp_verified) VALUES ('90005', 'frank', 'frank', 'FRANK', 'hidden', 'JBSWY3DPEHPK3PXP', 1)"
    ).run().lastInsertRowid)
    const insertAddon = mem.prepare('INSERT INTO price_addons (artist_id, name, price_value, select_mode, sort_order) VALUES (?, ?, ?, ?, ?)')
    insertAddon.run(artistId, '加人', 50, 'quantity', 0)
    insertAddon.run(artistId, '加急', 80, 'toggle', 1)
    // visible 两档 + hidden 一档（F5 只搬 visible）
    const insertTier = mem.prepare('INSERT INTO price_tiers (artist_id, name, price, sort_order, visibility) VALUES (?, ?, ?, ?, ?)')
    insertTier.run(artistId, '头像', 100, 0, 'visible')
    insertTier.run(artistId, '全身', 300, 1, 'visible')
    insertTier.run(artistId, '草稿', 20, 2, 'hidden')

    initDatabase(mem)

    // 1) 旧增项由「启动期修复」搬进当前形状表（control_type/price_mode 口径同 v50 终态）
    expect(templateRows(mem, artistId)).toEqual([
      { name: '加人', control_type: 'quantity', price_mode: 'fixed', default_price: 50, unit_label: '个', sort_order: 0 },
      { name: '加急', control_type: 'switch', price_mode: 'fixed', default_price: 80, unit_label: null, sort_order: 1 }
    ])
    // 2) v37 的 F5 建出「默认」画风，且只搬 visible 档位
    const styles = mem.prepare('SELECT id, name FROM art_styles WHERE artist_id = ?').all(artistId) as Array<{ id: number; name: string }>
    expect(styles).toHaveLength(1)
    expect(styles[0].name).toBe('默认')
    const sizes = mem.prepare('SELECT name FROM style_sizes WHERE art_style_id = ? ORDER BY sort_order').all(styles[0].id) as Array<{ name: string }>
    expect(sizes.map(s => s.name)).toEqual(['头像', '全身'])
    // 3) 链尾 v85 把搬来的模板补链到该画风
    const links = mem.prepare('SELECT addon_template_id AS templateId, is_enabled AS isEnabled FROM style_addons WHERE art_style_id = ? ORDER BY id').all(styles[0].id) as Array<{ templateId: number; isEnabled: number }>
    expect(links).toHaveLength(2)
    expect(links.every(l => l.isEnabled === 1)).toBe(true)
    // 4) 旧表已按拍板被 v43 DROP（升级完成后窗口关闭）
    expect(mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='price_addons'").get()).toBeUndefined()
    // 5) 全链跑完到 v85；且目标表是**当前形状**（无 pricing_mode）——
    //    证明 v36 的形状守卫必然 return，第 1 步的搬运只可能来自启动期修复，不会是 v36 干的
    const atCols = (mem.prepare('PRAGMA table_info(addon_templates)').all() as Array<{ name: string }>).map(c => c.name)
    expect(atCols).not.toContain('pricing_mode')
    expect((mem.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v).toBe(85)
    mem.close()
  })
})
