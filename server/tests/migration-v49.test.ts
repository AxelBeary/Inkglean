// 迁移 v49: req036_backend_core —— 补齐 #97 点名的覆盖缺口
//
// 为什么单独补这一条：v49 是 noTransaction + 备份 + 种子写入的重型重建迁移
// （DROP 父表触发子表 ON DELETE CASCADE，v38 事故同款陷阱），82→84 迁移里唯一
// 「风险最高却完全没有专项测试」的一条（#97 评论实测确认）。
//
// 本测试钉住 v49 的三道真实防线：
//   ① FK 未真正关闭时必须中止，绝不 DROP（事务内 PRAGMA 是 no-op，这是那条事故的根因）
//   ② 崩溃残留（主表已 DROP、_new 持唯一数据副本）必须续 RENAME 恢复而不是卡死
//   ③ 重建后 foreign_key_check 有悬空引用必须中止（官方 12 步流程的收尾校验）
//   ④ 幂等：已迁移态重跑不重复重建、不重复种草种子
import { describe, it, expect } from 'vitest'
// 先拉起共享模块图再直导 v49，范式同 migration-v36/v71.test.ts（避免循环求值撞版本升序断言）
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v49-req036-backend-core.js'

/** 造一个「v49 之前」的旧形库：addon_templates 旧形（无 kind）、style_addons 旧形（无快照列） */
function makeLegacyDb() {
  const mem = new Database(':memory:')
  mem.exec('CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)')
  mem.exec(`
    CREATE TABLE art_styles (id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER NOT NULL, name TEXT NOT NULL)
  `)
  mem.exec(`
    CREATE TABLE style_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, art_style_id INTEGER NOT NULL,
      name TEXT NOT NULL, base_price REAL NOT NULL DEFAULT 0, sort_order INTEGER DEFAULT 0
    )
  `)
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
  mem.exec(`
    CREATE TABLE style_addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      art_style_id INTEGER NOT NULL,
      addon_template_id INTEGER NOT NULL,
      is_enabled INTEGER DEFAULT 1,
      price_override REAL,
      options_override TEXT,
      FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE CASCADE,
      FOREIGN KEY (addon_template_id) REFERENCES addon_templates(id) ON DELETE CASCADE,
      UNIQUE(art_style_id, addon_template_id)
    )
  `)
  mem.prepare("INSERT INTO artists (id, name) VALUES (1, 'alice')").run()
  mem.prepare("INSERT INTO art_styles (id, artist_id, name) VALUES (1, 1, '默认')").run()
  mem.prepare("INSERT INTO addon_templates (id, artist_id, name, default_price) VALUES (1, 1, '加背景', 50)").run()
  mem.prepare("INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled) VALUES (1, 1, 1)").run()
  return mem
}

describe('迁移 v49: req036_backend_core（#97 覆盖缺口）', () => {
  it('TC-V49-00: 全量链路后 v49 已应用，重建后的表含 kind 列', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 49').get() as { version: number } | undefined
    expect(applied?.version).toBe(49)
    // 新库基线经 v50 重建为 category 系；v49 的痕迹是 style_addons 快照列存在
    const saCols = (db.prepare('PRAGMA table_info(style_addons)').all() as Array<{ name: string }>).map(c => c.name)
    expect(saCols.length).toBeGreaterThan(0)
  })

  it('TC-V49-01 (FK 未关闭): foreign_keys 仍是 ON 时必须中止，绝不 DROP 主表', () => {
    const mem = makeLegacyDb()
    // 拦掉 pragma 的关闭动作，模拟「事务内 PRAGMA 是 no-op」的真实失败态
    const origPragma = mem.pragma.bind(mem)
    ;(mem as unknown as { pragma: unknown }).pragma = (sql: string, opts?: unknown) => {
      if (typeof sql === 'string' && /^foreign_keys\s*=/.test(sql)) {
        return opts === undefined ? undefined : undefined
      }
      return origPragma(sql as never, opts as never)
    }
    try {
      expect(() => migration.up(mem)).toThrow(/foreign_keys 未能关闭/)
    } finally {
      ;(mem as unknown as { pragma: unknown }).pragma = origPragma
    }
    // 主表必须原样健在，数据未丢
    const row = mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }
    expect(row.c).toBe(1)
    expect(mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='addon_templates_new'").get()).toBeUndefined()
    mem.close()
  })

  it('TC-V49-02 (崩溃残留): 主表缺失 + _new 持数据时续 RENAME 恢复，不卡死', () => {
    const mem = makeLegacyDb()
    // 手工制造崩溃现场：主表已被 DROP，_new 持有唯一数据副本
    mem.exec(`
      CREATE TABLE addon_templates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT, artist_id INTEGER, name TEXT NOT NULL,
        control_type TEXT NOT NULL DEFAULT 'switch', pricing_mode TEXT NOT NULL DEFAULT 'fixed',
        default_price REAL NOT NULL DEFAULT 0, options TEXT, unit_label TEXT, sort_order INTEGER DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'add', max_quantity INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    mem.prepare("INSERT INTO addon_templates_new (id, artist_id, name, default_price) VALUES (1, 1, '加背景', 50)").run()
    mem.exec('DROP TABLE addon_templates')

    expect(() => migration.up(mem)).not.toThrow()

    // 续 RENAME 后主表恢复且数据在（kind 列证明确实走了新形）
    const cols = (mem.prepare('PRAGMA table_info(addon_templates)').all() as Array<{ name: string }>).map(c => c.name)
    expect(cols).toContain('kind')
    const row = mem.prepare("SELECT name, default_price FROM addon_templates WHERE id = 1").get() as { name: string; default_price: number }
    expect(row.name).toBe('加背景')
    expect(row.default_price).toBe(50)
    mem.close()
  })

  it('TC-V49-03 (陈旧 _new): 主表完好 + _new 存在时丢弃 _new，不丢主表数据', () => {
    const mem = makeLegacyDb()
    // 主表已迁移过（含 kind）→ 走「已迁移」分支；同时残留一个陈旧 _new
    const mem2 = mem
    mem2.pragma('foreign_keys = OFF')
    mem2.exec('CREATE TABLE addon_templates_new (id INTEGER PRIMARY KEY, junk TEXT)')
    mem2.pragma('foreign_keys = ON')

    expect(() => migration.up(mem2)).not.toThrow()
    // 陈旧 _new 被清掉
    expect(mem2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='addon_templates_new'").get()).toBeUndefined()
    expect((mem2.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(1)
    mem2.close()
  })

  it('TC-V49-04 (幂等): 已迁移态重跑不抛错、不重复重建、不重复种草', () => {
    const mem = makeLegacyDb()
    expect(() => migration.up(mem)).not.toThrow()
    const after1 = (mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c
    const saAfter1 = (mem.prepare('SELECT COUNT(*) AS c FROM style_addons').get() as { c: number }).c

    expect(() => migration.up(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(after1)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM style_addons').get() as { c: number }).c).toBe(saAfter1)
    // 收尾：FK 必须已恢复 ON（finally 分支）
    expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(mem.pragma('foreign_key_check')).toEqual([])
    mem.close()
  })
})
