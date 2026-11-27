import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再谈驱动——
// 否则模块循环求值会让迁移体未完成时进数组，撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/init.js'
import { migrateF5OldModelArtists } from '../src/db/migrate.js'
import { preTargetDb, isApplied, columnNames, tableExists, replayFrom } from './migration-real-entry.js'

// ============================================================
// 迁移 v36: multi_style_model —— issue #117 的主角
//
// F0081（B2 high）回归：v36 旧全局守卫（任一画师已有画风即跳过全体）改画师粒度。
// 旧形态库（addon_templates 含 pricing_mode + v09 旧表 price_tiers/price_addons）。
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，绕开 initDatabase 的
// 版本调度语义 —— 而 #117 的教训正是「直调 up() 的用例绿、生产路径零效果」。现全部改走
// `preTargetDb(36, revertToV35)`：以 schema 基线起库 → 手术回 v35 形态（v36 五表不存在、
// addon_templates 回到 pricing_mode 旧形）→ 塞旧档位/旧增项 → 预置除 v36 外全部版本行 →
// 调度器自己跑到 v36。断言逐条对应改造前，未削弱。
// ============================================================

/** v36 建立/改造的五张表（v35 形态下都不存在或为旧形） */
const V36_TABLES = ['addon_templates', 'art_styles', 'style_sizes', 'style_addons', 'size_addon_overrides']

/**
 * 把基线库手术回 v36 前夜（v35 形态）：
 * - 删掉 v36 才建的四张表与 v37 才加的关联表
 * - addon_templates 回退为 v36 之前的旧形（pricing_mode，无 price_mode/category/max_quantity）
 * - 重建 v09 时代的 price_tiers / price_addons（v43/v50 已 DROP，这是老库真实形态）
 */
function revertToV35(d: Database.Database): void {
  for (const t of ['style_addons', 'size_addon_overrides', 'artwork_size_tags', 'style_sizes', 'art_styles']) {
    d.exec(`DROP TABLE IF EXISTS ${t}`)
  }
  d.exec('DROP TABLE IF EXISTS addon_templates')
  d.exec(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  d.exec('CREATE TABLE price_addons (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL, name TEXT NOT NULL, price_value REAL NOT NULL, select_mode TEXT NOT NULL DEFAULT \'quantity\', sort_order INTEGER DEFAULT 0)')
  // 前置自检：夹具确实是 v35 形态 —— addon_templates 有 pricing_mode、五表里只有它存在，
  // 否则 v36 的形状守卫会早退 → 后面的断言是假绿
  if (!columnNames(d, 'addon_templates').includes('pricing_mode')) {
    throw new Error('夹具未退回 v35 形态：addon_templates 缺 pricing_mode')
  }
  for (const t of ['art_styles', 'style_sizes', 'style_addons', 'size_addon_overrides']) {
    if (tableExists(d, t)) throw new Error(`夹具未退回 v35 形态：${t} 仍然存在`)
  }
}

/** 插入一名画师及其旧档位 [名称, 价格] / 旧增项 [名称, 价格, select_mode] */
function seedLegacy(
  d: Database.Database,
  artistId: number,
  tiers: Array<[string, number]>,
  addons: Array<[string, number, string]>
): void {
  d.prepare('INSERT OR IGNORE INTO artists (id, qq_number, name, subdomain) VALUES (?, ?, ?, ?)')
    .run(artistId, String(36000 + artistId), `画师${artistId}`, `artist-v36-${artistId}`)
  const insTier = d.prepare('INSERT INTO price_tiers (artist_id, name, price, sort_order) VALUES (?, ?, ?, ?)')
  tiers.forEach(([name, price], i) => insTier.run(artistId, name, price, i))
  const insAddon = d.prepare('INSERT INTO price_addons (artist_id, name, price_value, select_mode, sort_order) VALUES (?, ?, ?, ?, ?)')
  addons.forEach(([name, price, mode], i) => insAddon.run(artistId, name, price, mode, i))
}

describe('迁移 v36: multi_style_model（F0081 画师粒度幂等）', () => {
  it('TC-F81-00: 全量链路（setup.js initDatabase）后五表在位，新形态不触发旧数据搬运', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 36').get() as { version: number } | undefined
    expect(applied?.version).toBe(36)
    for (const t of V36_TABLES) {
      expect((db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).length).toBeGreaterThan(0)
    }
    // 新形态基线：addon_templates 无 pricing_mode（形状守卫口径），空库无搬运产物
    const atCols = (db.prepare('PRAGMA table_info(addon_templates)').all() as Array<{ name: string }>).map(c => c.name)
    expect(atCols).not.toContain('pricing_mode')
    expect((db.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(0)
  })

  it('TC-F81-01: 旧形态全量画师照常搬运（档位/增项映射/默认画风关联）', () => {
    const mem = preTargetDb(36, d => {
      revertToV35(d)
      seedLegacy(d, 1, [['头像', 100], ['全身', 300]], [['加人', 50, 'quantity'], ['加背景', 80, 'toggle'], ['加道具', 30, 'inquiry']])
      seedLegacy(d, 2, [['半身', 200]], [])
    })
    try {
      expect(isApplied(mem, 36), 'v36 版本行应由调度器写入').toBe(true)

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
        'SELECT name AS name, control_type AS control_type, unit_label AS unit_label, default_price AS default_price FROM addon_templates WHERE artist_id = 1 AND name IN (?, ?, ?) ORDER BY sort_order'
      ).all('加人', '加背景', '加道具') as Array<{ name: string; control_type: string; unit_label: string | null; default_price: number }>
      expect(tpls.map(t => t.name)).toEqual(['加人', '加背景', '加道具'])
      expect(tpls[0]).toMatchObject({ control_type: 'quantity', unit_label: '个', default_price: 50 })
      expect(tpls[1]).toMatchObject({ control_type: 'switch', unit_label: null })
      expect(tpls[2]).toMatchObject({ control_type: 'radio' })

      // 默认画风关联全部增项模板
      const links = mem.prepare(`
        SELECT COUNT(*) AS c FROM style_addons sa JOIN art_styles st ON sa.art_style_id = st.id WHERE st.artist_id = 1
      `).get() as { c: number }
      expect(links.c).toBe(3)
    } finally {
      mem.close()
    }
  })

  it('TC-F81-02: 部分已迁移——已有画风的画师跳过，其余画师照常迁移（F0081 核心）', () => {
    const mem = preTargetDb(36, d => {
      revertToV35(d)
      // artist 1：先前一轮已迁移（画风+模板已落库），旧表残留仍在
      seedLegacy(d, 1, [['头像', 100]], [['加背景', 80, 'toggle']])
      d.exec(`
        CREATE TABLE art_styles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          name TEXT,
          sort_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1
        )
      `)
      d.exec("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (1, '默认', 0, 1)")
      d.exec("INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, sort_order) VALUES (1, '加背景', 'switch', 'fixed', 80, 0)")
      // artist 2：后建画师从未迁移——旧全局守卫会因 artist 1 已有画风而放弃全体
      seedLegacy(d, 2, [['半身', 200]], [['加人', 50, 'quantity']])
    })
    try {
      expect(isApplied(mem, 36)).toBe(true)

      // artist 1 不重复迁移：画风仍 1 行、模板不重复插入
      expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = 1').get() as { c: number }).c).toBe(1)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = 1').get() as { c: number }).c).toBe(1)

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
    } finally {
      mem.close()
    }
  })

  it('TC-F81-03: 幂等——连续重跑不产生重复行', () => {
    const mem = preTargetDb(36, d => {
      revertToV35(d)
      seedLegacy(d, 1, [['头像', 100]], [['加背景', 80, 'toggle']])
    })
    try {
      const counts = () => ({
        styles: (mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c,
        sizes: (mem.prepare('SELECT COUNT(*) AS c FROM style_sizes').get() as { c: number }).c,
        templates: (mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c,
        links: (mem.prepare('SELECT COUNT(*) AS c FROM style_addons').get() as { c: number }).c
      })
      const afterFirst = counts()
      expect(afterFirst).toEqual({ styles: 1, sizes: 1, templates: 1, links: 1 })

      // 真实入口重放：调度器再跑一次 v36
      mem.prepare('DELETE FROM schema_migrations WHERE version = 36').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 36)).toBe(true)
      expect(counts()).toEqual(afterFirst)
    } finally {
      mem.close()
    }
  })

  it('TC-F81-04: 修复重放撞 v43 冻结态——price_addons 已 DROP，跳过搬运不崩溃', () => {
    const mem = preTargetDb(36, d => {
      revertToV35(d)
      d.exec('DROP TABLE price_addons') // v43 已按用户拍板 DROP（存量当时仅测试垃圾数据）
      // 画师与旧档位仍在（不经过 seedLegacy——它要写已不存在的 price_addons）
      d.prepare('INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, ?, ?, ?)').run('36001', '画师1', 'artist-v36-1')
      d.prepare('INSERT INTO price_tiers (artist_id, name, price) VALUES (1, ?, ?)').run('头像', 100)
    })
    try {
      expect(isApplied(mem, 36)).toBe(true)
      // 无可搬数据：不建默认画风、不搬档位（禁止从残缺旧表半态回填）
      expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(0)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM style_sizes').get() as { c: number }).c).toBe(0)
    } finally {
      mem.close()
    }
  })

  it('TC-F81-05: 新形态基线（addon_templates 无 pricing_mode）——形状守卫跳过搬运', () => {
    // 不 revert：直接用 schema 基线（addon_templates 是 price_mode/category 新形），
    // 只把旧表 price_tiers/price_addons 摆回来制造「像老库」的诱导
    const mem = preTargetDb(36, d => {
      d.exec('DROP TABLE IF EXISTS price_addons')
      d.exec('CREATE TABLE price_addons (id INTEGER PRIMARY KEY, artist_id INTEGER NOT NULL, name TEXT, price_value REAL, select_mode TEXT)')
      d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '1', 'a', 'aa')")
      d.exec("INSERT INTO price_tiers (artist_id, name, price) VALUES (1, '头像', 100)")
      // 前置自检：确实是新形态（无 pricing_mode）——形状守卫据此早退
      if (columnNames(d, 'addon_templates').includes('pricing_mode')) {
        throw new Error('夹具错误：新形态下 addon_templates 不应有 pricing_mode')
      }
    })
    try {
      expect(isApplied(mem, 36)).toBe(true)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c).toBe(0)
    } finally {
      mem.close()
    }
  })

  it('TC-F81-06 (PR114 M-1): F5 补过画风的画师仍能搬运旧增项（Control/Probe 对照）', () => {
    const mem = preTargetDb(36, d => {
      revertToV35(d)
      // F5 守卫读 artists.deleted_at（基线 schema 已有，v36 前夜的 live 库正是这形态）；
      // F5 尺寸搬运读 price_tiers.visibility（v25 才加，基线 schema 的 price_tiers 没有）
      d.exec("ALTER TABLE price_tiers ADD COLUMN visibility TEXT DEFAULT 'visible'")
      // 生产链路上 v36/v37 已建好这两表，F5 直接往里写（本用例显式补齐前置形态）
      d.exec(`
        CREATE TABLE art_styles (
          id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL, name TEXT,
          sort_order INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
        )
      `)
      d.exec(`
        CREATE TABLE style_sizes (
          id INTEGER PRIMARY KEY AUTOINCREMENT, art_style_id INTEGER NOT NULL, name TEXT,
          base_price REAL, sort_order INTEGER DEFAULT 0
        )
      `)
      // Control：从未被 F5 处理的画师（无画风）
      seedLegacy(d, 1, [['头像', 100]], [['对照增项', 50, 'toggle']])
      // Probe：F5 补过画风+尺寸、但无 addon_templates 的画师（旧代理键会整块跳过）
      seedLegacy(d, 2, [['半身', 200]], [['探针遗留增项', 80, 'quantity']])
      // 先跑 F5（生产链路上它由 migrate.ts 在 v36 之前/之后调用），再造出 M-1 触发形态
      migrateF5OldModelArtists(d)
      // F5 后两画师都有画风+尺寸，但都没有增项模板——正是 M-1 的触发形态
      const styleCount = (d.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as { c: number }).c
      if (styleCount !== 2) throw new Error('夹具错误：F5 应已为两名画师各建一个画风，实际 ' + styleCount)
    })
    try {
      expect(isApplied(mem, 36)).toBe(true)

      // Control 与 Probe 的旧增项都必须进目标表（探针不再被静默丢弃）
      const names = (mem.prepare('SELECT name FROM addon_templates ORDER BY artist_id, sort_order').all() as Array<{ name: string }>).map(r => r.name)
      expect(names).toEqual(['对照增项', '探针遗留增项'])
      // Probe 沿用 F5 建的画风，不重建（链接时机见下方订正注释）
      expect((mem.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = 2').get() as { c: number }).c).toBe(1)
      // 【2026-11-28 合并后订正】链接存在的时机是链尾（v85），不是 v36 之后。
      // 原因：PR #116 的启动期 backfillLegacyAddons 在迁移链**之前**就把旧增项搬进 addon_templates，
      // 于是 v36 的增项守卫判「该画师模板已存在」而不再建 style_addons；缺口由 v85（DB-4 历史补链）
      // 按「有模板但零链接」补齐。全链终态已实测：addon_templates=[legacy-addon]、链接=1、art_styles=1、schema=v86。
      // 故断言口径为「跑完整条链后链接存在」；单点 v36 之后并无链接，这是两条修复的既定分工。
      replayFrom(mem, 37)  // 撤掉 v37+ 的版本行，让调度器把剩下的链跑完（v85 在这里补链）
      const probeLinks = mem.prepare(`
        SELECT COUNT(*) AS c FROM style_addons sa
        JOIN art_styles st ON sa.art_style_id = st.id WHERE st.artist_id = 2
      `).get() as { c: number }
      expect(probeLinks.c).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-F81-07 (PR114 M-2): 删画风模拟重放——同名模板不翻倍', () => {
    const mem = preTargetDb(36, d => {
      revertToV35(d)
      seedLegacy(d, 1, [['头像', 100]], [['加背景', 80, 'toggle']])
    })
    try {
      expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(1)

      // 模拟版本表丢失后的重放：删除画风及其关联/尺寸，旧增项模板仍在
      mem.exec('DELETE FROM style_addons')
      mem.exec('DELETE FROM style_sizes')
      mem.exec('DELETE FROM art_styles')
      mem.prepare('DELETE FROM schema_migrations WHERE version = 36').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 36)).toBe(true)

      const tpls = mem.prepare('SELECT name FROM addon_templates ORDER BY sort_order').all() as Array<{ name: string }>
      expect(tpls.map(t => t.name)).toEqual(['加背景'])
    } finally {
      mem.close()
    }
  })
})
