import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再谈驱动——
// 否则模块循环求值会让迁移体未完成时进数组，撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'
import {
  preTargetDb,
  buildPreTarget,
  replayVersion,
  isApplied,
  columnNames,
  tableExists
} from './migration-real-entry.js'

// ============================================================
// 迁移 v64: greeting_special_days —— E 清单波 4，问候系统池扩展
//
// 为什么单独补这一条（issue #117/#118 迁移测试路径级补齐）：
//   v64 是 84 条迁移里仅剩的「noTransaction + 备份 + 破坏性重建父表」且**没有专属
//   测试文件**的重型迁移（38/43/49/50/67/68/71 都已有专项）。它做两件事：
//     1. 新表 greeting_special_days（可配置特别日；artist_id NULL=全平台）
//     2. greeting_templates 重建：time_slot CHECK 补 'latenight' + 新增 special_day_id
//        （ON DELETE CASCADE）
//
// noTransaction 的真实路径是「调度器 COMMIT 释放锁 → 事务外执行 → 重新抢锁 + 刷新
// applied」——直调 up() 根本走不到这段，故全部用例走 preTargetDb / buildPreTarget。
// ============================================================

/**
 * 把基线库手术回 v64 前夜（v63 形态）：
 * - greeting_templates 去掉 special_day_id、time_slot CHECK 回到 6 档（无 latenight）
 * - 删掉 greeting_special_days 表
 * - 塞入各档位存量文案
 *
 * CHECK 无法 ALTER，只能按 v64 同法重建旧表。
 */
function revertToV63(d: Database.Database): void {
  d.exec('DROP TABLE IF EXISTS greeting_special_days')
  d.exec(`
    CREATE TABLE greeting_templates_v63 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id      INTEGER,
      text           TEXT NOT NULL,
      time_slot      TEXT NOT NULL DEFAULT 'any'
                     CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
      is_enabled     INTEGER NOT NULL DEFAULT 1,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    )
  `)
  d.exec('DROP TABLE IF EXISTS greeting_templates')
  d.exec('ALTER TABLE greeting_templates_v63 RENAME TO greeting_templates')
  d.exec('CREATE INDEX IF NOT EXISTS idx_greeting_artist ON greeting_templates(artist_id, time_slot)')
  d.exec("INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '64001', '问候画师', 'greeting-v64')")
  // 全局各档 + 画师专属一条：重建必须一条不丢、归属不变
  d.exec(`
    INSERT INTO greeting_templates (artist_id, text, time_slot, is_enabled) VALUES
      (NULL, '早安', 'morning', 1),
      (NULL, '午安', 'afternoon', 1),
      (NULL, '晚安', 'evening', 1),
      (NULL, '深夜', 'night', 1),
      (NULL, '凌晨', 'latenight', 1),
      (NULL, '随时', 'any', 1),
      (1, '专属问候', 'morning', 0)
  `)
  // 前置自检：夹具确实是 v63 形态，否则 v64 的列存在性守卫会早退 → 断言假绿
  if (columnNames(d, 'greeting_templates').includes('special_day_id')) {
    throw new Error('夹具未退回 v63 形态：greeting_templates 已有 special_day_id')
  }
  if (tableExists(d, 'greeting_special_days')) {
    throw new Error('夹具未退回 v63 形态：greeting_special_days 已存在')
  }
  const sql = (d.prepare("SELECT sql FROM sqlite_master WHERE name='greeting_templates'").get() as { sql: string }).sql
  if (sql.includes("'latenight'") === false) {
    throw new Error('夹具未退回 v63 形态：旧 CHECK 应含 latenight')
  }
}

describe('迁移 v64: greeting_special_days（真实入口）', () => {
  it('TC-MV64-00: 全量链路后 v64 已应用，特别日表与特殊列都在位', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 64').get() as { version: number } | undefined
    expect(applied?.version).toBe(64)
    expect(tableExists(db, 'greeting_special_days')).toBe(true)
    expect(columnNames(db, 'greeting_templates')).toContain('special_day_id')
  })

  it('TC-MV64-01: noTransaction 必须为 true（重建父表须事务外，PRAGMA 事务内是 no-op）', () => {
    // 生产事故口径：事务内 PRAGMA foreign_keys 是 no-op，DROP 父表会触发子表 CASCADE。
    // 这条把「必须事务外」钉死在迁移声明上——调度器据此走 COMMIT → up() → BEGIN IMMEDIATE
    expect(MIGRATIONS.find(m => m.version === 64)!.noTransaction).toBe(true)
  })

  it('TC-MV64-02: 老库升级——特别日表建出、special_day_id 补上、存量文案零丢失', () => {
    const mem = preTargetDb(64, revertToV63)
    try {
      expect(isApplied(mem, 64), 'v64 版本行应由调度器写入').toBe(true)

      // 新表 + 索引
      expect(tableExists(mem, 'greeting_special_days')).toBe(true)
      const idxs = (mem.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='greeting_special_days'").all() as Array<{ name: string }>).map(r => r.name)
      expect(idxs).toContain('idx_greeting_special_days_date')
      expect(idxs).toContain('idx_greeting_special_days_artist')

      // 重建后列就位
      const cols = columnNames(mem, 'greeting_templates')
      expect(cols).toContain('special_day_id')
      // 新 CHECK 7 档，旧的 latenight 归并进 midnight（v67 才做，v64 仍保留 latenight）
      const sql = (mem.prepare("SELECT sql FROM sqlite_master WHERE name='greeting_templates'").get() as { sql: string }).sql
      expect(sql).toContain("'latenight'")

      // 存量 7 条一条不丢，归属/启停原样
      const rows = mem.prepare('SELECT text, time_slot, artist_id, is_enabled FROM greeting_templates ORDER BY id').all() as Array<{ text: string; time_slot: string; artist_id: number | null; is_enabled: number }>
      expect(rows).toHaveLength(7)
      expect(rows.map(r => r.text)).toEqual(['早安', '午安', '晚安', '深夜', '凌晨', '随时', '专属问候'])
      expect(rows[6]).toMatchObject({ artist_id: 1, is_enabled: 0, time_slot: 'morning' })
      // 新列全部为 NULL（普通时段池，不含特别日绑定）
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates WHERE special_day_id IS NULL').get() as { n: number }).n).toBe(7)

      // noTransaction 收尾：FK 必须恢复 ON
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(mem.pragma('foreign_key_check')).toEqual([])
    } finally {
      mem.close()
    }
  })

  it('TC-MV64-03: special_day_id 的 ON DELETE CASCADE 生效（删特别日 → 其文案级联删）', () => {
    const mem = preTargetDb(64, revertToV63)
    try {
      // 新建一个特别日 + 一条关联文案
      mem.exec("INSERT INTO greeting_special_days (id, name, date_key) VALUES (10, '生日', '08-14')")
      mem.exec("INSERT INTO greeting_templates (artist_id, text, time_slot, special_day_id) VALUES (NULL, '生日文案', 'any', 10)")
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates WHERE special_day_id = 10').get() as { n: number }).n).toBe(1)

      // 删除特别日 → 关联文案随 CASCADE 一起走（普通文案不受影响）
      mem.exec('DELETE FROM greeting_special_days WHERE id = 10')
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates WHERE special_day_id = 10').get() as { n: number }).n).toBe(0)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates').get() as { n: number }).n).toBe(7)
    } finally {
      mem.close()
    }
  })

  it('TC-MV64-04: date_key 的 GLOB + 语义范围 CHECK 拒绝非法值', () => {
    const mem = preTargetDb(64, revertToV63)
    try {
      // F0107 收紧口径：形态 [0-1][0-9]-[0-3][0-9] 且月份 1-12、日 1-31
      expect(() => mem.prepare("INSERT INTO greeting_special_days (name, date_key) VALUES ('ok', '02-29')").run()).not.toThrow()
      for (const bad of ['13-01', '01-32', '1-1', 'ab-cd', '00-00']) {
        expect(() => mem.prepare("INSERT INTO greeting_special_days (name, date_key) VALUES ('bad', ?)").run(bad),
          `date_key '${bad}' 应被 CHECK 拒绝`).toThrow()
      }
    } finally {
      mem.close()
    }
  })

  it('TC-MV64-05: 幂等守卫——已是新形态（含 special_day_id）时重跑跳过重建，并清掉 _new 残留', () => {
    const mem = preTargetDb(64, revertToV63)
    try {
      // 模拟上次重建失败的残留
      mem.exec('CREATE TABLE greeting_templates_new (id INTEGER PRIMARY KEY)')
      // 真实入口重放：版本行删掉后由调度器再跑一次 v64
      expect(replayVersion(mem, 64), '调度器应重放 v64 并写回版本行').toBe(true)
      // 守卫按列存在性命中 → 不重建，只清残留
      expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates').get() as { n: number }).n).toBe(7)
      expect(columnNames(mem, 'greeting_templates')).toContain('special_day_id')
    } finally {
      mem.close()
    }
  })

  it('TC-MV64-06: 悬空 artist_id → 事务内 foreign_key_check 抛错并整体回滚，旧表零丢失', () => {
    // 断言「迁移必须抛错」→ 用 buildPreTarget（不跑调度器），自己调 initDatabase
    const mem = buildPreTarget(64, d => {
      revertToV63(d)
      // 悬空 artist_id=999（FK 关闭下可写入，模拟 v0.35 事故同款历史脏数据）
      d.pragma('foreign_keys = OFF')
      d.exec("INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (999, '悬空引用行', 'night')")
      d.pragma('foreign_keys = ON')
    })
    try {
      expect(() => initDatabase(mem)).toThrow(/foreign_key_check/)
      // 整批回滚：_new 不存在，旧表数据原样（含那条悬空行，等待人工处置）
      expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates').get() as { n: number }).n).toBe(8)
      // FK 在 finally 恢复为 ON
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
      // 调度器失败后不得把 v64 记成已应用
      expect(isApplied(mem, 64)).toBe(false)
    } finally {
      mem.close()
    }
  })

  it('TC-MV64-07: 崩溃残留（greeting_templates 已 DROP、_new 持数据）—— 如实记录真实行为', () => {
    // ⚠️ 与 v49（TC-V49-02b / TC-B1-F0086-01）同型的窗口：DROP 主表后、RENAME 前被杀。
    // 生产入口先 exec(schema)，而 schema.ts 已把 greeting_templates 定义为当前基线
    // （含 special_day_id）→ CREATE TABLE IF NOT EXISTS 把主表按新形重建 →
    // v64 的列存在性守卫看到 special_day_id 直接 return，**且顺手 DROP 掉 _new**，
    // 唯一数据副本就此消失。
    //
    // 本条钉住当前真实行为；将来若修好（守卫改为「_new 存在时优先续 RENAME」），
    // 本条会变红，提醒把 07/08 一对用例一起翻新。
    const mem = buildPreTarget(64, d => {
      revertToV63(d)
      // _new 持唯一数据副本（v64 真实产物的 DDL 形态）
      d.exec(`
        CREATE TABLE greeting_templates_new (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id      INTEGER,
          text           TEXT NOT NULL,
          time_slot      TEXT NOT NULL DEFAULT 'any'
                         CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
          is_enabled     INTEGER NOT NULL DEFAULT 1,
          special_day_id INTEGER,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      d.exec("INSERT INTO greeting_templates_new (artist_id, text, time_slot) VALUES (NULL, '崩溃前唯一的文案', 'night')")
      d.exec('DROP TABLE greeting_templates')
    })
    try {
      expect((mem.prepare('SELECT COUNT(*) AS c FROM greeting_templates_new').get() as { c: number }).c).toBe(1)
      initDatabase(mem)

      // 实测：_new 被守卫清掉，重建后的空主表 0 行 —— 崩溃前那条文案永久丢失
      expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM greeting_templates').get() as { c: number }).c).toBe(0)
      expect(isApplied(mem, 64)).toBe(true)
    } finally {
      mem.close()
    }
  })

  it('TC-MV64-08: 正常路径不受 07 影响——特别日文案与普通文案共存且互不干扰', () => {
    // 与 07 对照：只要没有崩溃残留，v64 升级后两条池各司其职
    const mem = preTargetDb(64, revertToV63)
    try {
      mem.exec("INSERT INTO greeting_special_days (id, name, date_key, artist_id) VALUES (1, '全平台生日', '08-14', NULL), (2, '画师纪念日', '12-25', 1)")
      mem.exec("INSERT INTO greeting_templates (artist_id, text, time_slot, special_day_id) VALUES (NULL, '全平台文案', 'any', 1), (1, '专属文案', 'any', 2)")
      // 普通时段池查询口径：special_day_id IS NULL
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates WHERE special_day_id IS NULL').get() as { n: number }).n).toBe(7)
      // 特别日池：按 date_key 反查
      const rows = mem.prepare(`
        SELECT g.text, s.date_key, s.artist_id AS day_owner, g.artist_id AS text_owner
        FROM greeting_templates g JOIN greeting_special_days s ON s.id = g.special_day_id
        ORDER BY s.id
      `).all()
      expect(rows).toEqual([
        { text: '全平台文案', date_key: '08-14', day_owner: null, text_owner: null },
        { text: '专属文案', date_key: '12-25', day_owner: 1, text_owner: 1 }
      ])
    } finally {
      mem.close()
    }
  })
})
