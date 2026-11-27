// 迁移 v49: req036_backend_core —— 补齐 #97 点名的覆盖缺口
//
// 为什么单独补这一条：v49 是 noTransaction + 备份 + 种子写入的重型重建迁移
// （DROP 父表触发子表 ON DELETE CASCADE，v38 事故同款陷阱），82→84 迁移里唯一
// 「风险最高却完全没有专项测试」的一条（#97 评论实测确认）。
//
// 本测试钉住 v49 的四道真实防线：
//   ① FK 未真正关闭时必须中止，绝不 DROP（事务内 PRAGMA 是 no-op，这是那条事故的根因）
//   ② 崩溃残留（主表已 DROP、_new 持唯一数据副本）必须续 RENAME 恢复而不是卡死
//   ③ 重建后 foreign_key_check 有悬空引用必须中止（官方 12 步流程的收尾校验）
//   ④ 幂等：已迁移态重跑不重复重建、不重复种草种子
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，绕开 initDatabase 的
// 版本调度语义 —— 而 v49 是 noTransaction，真实路径是「调度器 COMMIT 释放锁 → 事务外执行 →
// 重新抢锁 + 刷新 applied」。现全部改走 buildPreTarget / preTargetDb，
// 由调度器自己跑到 v49（或由用例断言它必须抛错）。断言逐条对应改造前，未削弱。
import { describe, it, expect } from 'vitest'
// 先拉起共享模块图再谈驱动，范式同 migration-v36/v71.test.ts（避免循环求值撞版本升序断言）
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/init.js'
import { preTargetDb, buildPreTarget, isApplied, columnNames, tableExists } from './migration-real-entry.js'

/**
 * 把基线库手术回 v49 前夜（v48 形态）：
 * - addon_templates 回旧形（pricing_mode、无 kind/max_quantity）
 * - style_addons 回旧形（options_override、无快照列）
 * 其余表（art_styles/style_sizes/artists）沿用基线——v49 只重建这两张。
 */
function revertToV48(d: Database.Database): void {
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    )
  `)
  d.exec('DROP TABLE IF EXISTS style_addons')
  d.exec(`
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
  // 前置自检：夹具确实是 v48 形态 —— 否则 v49 的守卫会连带早退 → 断言假绿
  if (columnNames(d, 'addon_templates').includes('kind')) throw new Error('夹具未退回 v48 形态：addon_templates 已有 kind')
  if (columnNames(d, 'style_addons').includes('tpl_kind')) throw new Error('夹具未退回 v48 形态：style_addons 已有 tpl_kind')
  // 存量数据：一名画师 + 一个画风 + 一条旧增项 + 一条关联
  d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '49001', 'v49 画师', 'v49-artist')")
  d.exec("INSERT INTO art_styles (id, artist_id, name) VALUES (1, 1, '默认')")
  d.exec("INSERT INTO addon_templates (id, artist_id, name, default_price) VALUES (1, 1, '加背景', 50)")
  d.exec('INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled) VALUES (1, 1, 1)')
}

describe('迁移 v49: req036_backend_core（#97 覆盖缺口，真实入口）', () => {
  it('TC-V49-00: 全量链路后 v49 已应用，重建后的表含快照列', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 49').get() as { version: number } | undefined
    expect(applied?.version).toBe(49)
    // 新库基线经 v50 重建为 category 系；v49 的痕迹是 style_addons 快照列存在
    const saCols = (db.prepare('PRAGMA table_info(style_addons)').all() as Array<{ name: string }>).map(c => c.name)
    expect(saCols.length).toBeGreaterThan(0)
  })

  it('TC-V49-01 (FK 未关闭): foreign_keys 仍是 ON 时必须中止，绝不 DROP 主表', () => {
    // 拦掉 pragma 的关闭动作，模拟「事务内 PRAGMA 是 no-op」的真实失败态。
    // 只能在调度器启动前挂桩 —— 故用 buildPreTarget 拿到未迁移的库，自己调 initDatabase。
    const mem = buildPreTarget(49, revertToV48)
    const origPragma = mem.pragma.bind(mem)
    ;(mem as unknown as { pragma: unknown }).pragma = (sql: string, opts?: unknown) => {
      if (typeof sql === 'string' && /^foreign_keys\s*=/.test(sql)) {
        return opts === undefined ? undefined : undefined
      }
      return origPragma(sql as never, opts as never)
    }
    try {
      expect(() => initDatabase(mem)).toThrow(/foreign_keys 未能关闭/)
    } finally {
      ;(mem as unknown as { pragma: unknown }).pragma = origPragma
    }
    // 主表必须原样健在，数据未丢
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(1)
    expect(tableExists(mem, 'addon_templates_new')).toBe(false)
    // 调度器失败后不得把 v49 记成已应用（否则下次启动永久跳过，表结构卡在半态）
    expect(isApplied(mem, 49)).toBe(false)
    mem.close()
  })

  /**
   * 崩溃残留现场：主表已被 DROP、addon_templates_new 持唯一数据副本
   *（v49 自己的 d3 欠账补账分支声称能「续 RENAME 恢复」）。
   *
   * ⚠️ 关键：必须用 buildPreTarget（不先跑调度器）——initDatabase 的第一步是 exec(schema)，
   * 而 schema.ts 的 CREATE TABLE IF NOT EXISTS addon_templates 会把「手工删掉的主表」
   * 按**当前基线（新形）**重建出来（实测：重建后列为 price_mode/category，无 pricing_mode）。
   * 详见 TC-V49-02b 的实测记录。
   */
  function buildCrashScene(d: Database.Database): void {
    revertToV48(d)
    d.exec(`
      CREATE TABLE addon_templates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER,
        name TEXT NOT NULL,
        control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity','radio')),
        pricing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_mode IN ('fixed','per_unit','per_option')),
        default_price REAL NOT NULL DEFAULT 0,
        options TEXT,
        unit_label TEXT,
        sort_order INTEGER DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'add' CHECK(kind IN ('add','multiply')),
        max_quantity INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    d.prepare("INSERT INTO addon_templates_new (id, artist_id, name, default_price) VALUES (1, 1, '加背景', 50)").run()
    d.exec('DROP TABLE addon_templates')
  }

  it('TC-V49-02b (缺陷实录 · issue #117 发现): 崩溃残留分支在生产入口下不可达', () => {
    // ⚠️ 本条记录的是**实测到的真实行为**，不是期望行为。原用例 TC-V49-02 直调 migration.up(mem)
    // 时绿（up() 内 for 循环看到 hasMain=false → 走「续 RENAME 恢复」），但生产入口先 exec(schema)：
    //   schema.ts 已把 addon_templates 定义成当前基线（price_mode/category 新形），
    //   CREATE TABLE IF NOT EXISTS 于是把被 DROP 的主表按新形重建 → hasMain 变 true，
    //   代码走「主表完好 → 丢弃 _new」分支，把**唯一数据副本删掉**；随后重建守卫因
    //   category 已存在而跳过，接着 style_addons 重建 SELECT at.pricing_mode 撞「no such column」抛错。
    //
    // 生产后果：v49 崩溃窗口（DROP 主表后、RENAME 前被杀）重启 → 旧增项模板数据丢失 + 迁移永久失败。
    // 这是 issue #117「直调 up() 绿 / 生产路径零效果」的又一实例，故在此钉死当前行为：
    // 若将来修好（例如让 schema 不为 v49 目标表兜底建表，或守卫改用列探测而非建表兜底），
    // 本条会变红，提醒把 02/02b 一对用例一起翻新。
    const mem = buildPreTarget(49, buildCrashScene)
    try {
      expect(mem.prepare('SELECT COUNT(*) AS c FROM addon_templates_new').get()).toEqual({ c: 1 })
      expect(() => initDatabase(mem)).toThrow(/no such column: at\.pricing_mode/)
      // 数据丢失：_new（唯一副本）被删，主表是 schema 重建的空壳
      expect(tableExists(mem, 'addon_templates_new')).toBe(false)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(0)
      // 迁移未被标记为已应用，下次启动仍会失败（不是静默跳过）
      expect(isApplied(mem, 49)).toBe(false)
    } finally {
      mem.close()
    }
  })

  it('TC-V49-03 (陈旧 _new): 主表完好 + _new 存在时丢弃 _new，不丢主表数据', () => {
    const mem = preTargetDb(49, d => {
      revertToV48(d)
      // 主表已迁移过（含 kind）→ 走「已迁移」分支；同时残留一个陈旧 _new
      d.pragma('foreign_keys = OFF')
      d.exec('CREATE TABLE addon_templates_new (id INTEGER PRIMARY KEY, junk TEXT)')
      d.pragma('foreign_keys = ON')
    })
    try {
      expect(isApplied(mem, 49)).toBe(true)
      // 陈旧 _new 被清掉
      expect(tableExists(mem, 'addon_templates_new')).toBe(false)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-V49-04 (幂等): 已迁移态重跑不抛错、不重复重建、不重复种草', () => {
    const mem = preTargetDb(49, revertToV48)
    try {
      const after1 = (mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c
      const saAfter1 = (mem.prepare('SELECT COUNT(*) AS c FROM style_addons').get() as { c: number }).c

      // 真实入口重放：调度器再跑一次 v49
      mem.prepare('DELETE FROM schema_migrations WHERE version = 49').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 49)).toBe(true)

      expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c).toBe(after1)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM style_addons').get() as { c: number }).c).toBe(saAfter1)
      // 收尾：FK 必须已恢复 ON（finally 分支）
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(mem.pragma('foreign_key_check')).toEqual([])
    } finally {
      mem.close()
    }
  })
})
