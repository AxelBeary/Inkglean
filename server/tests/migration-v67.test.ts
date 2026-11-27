import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { preTargetDb, isApplied, tableExists } from './migration-real-entry.js'

// v67: 问候系统重构——7 档时段（旧 6 档搬家：night/latenight→midnight，新增 early/noon）
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)` 造搬家断言。v67 是
// noTransaction：真实路径是「调度器 COMMIT 释放锁 → 事务外执行 → 重新抢锁 + 刷新 applied」，
// 直调根本走不到这段。现改走 `preTargetDb(67, revertToV66)`，由调度器自己跑到 v67。
// 断言逐条对应改造前，未削弱。

describe('迁移 v67: greeting_slot_rework', () => {
  it('TC-MV67-01: v67 已应用且 CHECK 为 7 档新口径', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 67'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(67)

    const sql = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='greeting_templates'"
    ).get() as { sql: string } | undefined)?.sql
    for (const slot of ['early', 'morning', 'noon', 'afternoon', 'evening', 'midnight', 'any']) {
      expect(sql).toContain(`'${slot}'`)
    }
    expect(sql).not.toContain("'latenight'")
    expect(sql).not.toContain("'night'")
  })

  it('TC-MV67-02: 幂等——重跑 initDatabase 不抛错且结构不变', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const sql = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='greeting_templates'"
    ).get() as { sql: string } | undefined)?.sql
    expect(sql).toContain("'midnight'")
  })

  it('TC-MV67-02b: noTransaction 必须为 true（重建父表须事务外，PRAGMA 事务内是 no-op）', () => {
    expect(MIGRATIONS.find(m => m.version === 67)!.noTransaction).toBe(true)
  })
})

// 搬家语义测试：由 initDatabase 调度器在 v66 形态库上真实跑到 v67
describe('迁移 v67 旧数据搬家', () => {
  /**
   * 把基线库手术回 v67 前夜（v66 形态）：
   * greeting_templates 的 CHECK 回到旧 6 档（含 night/latenight，无 early/noon），
   * 并塞入各档位数据（含画师专属 + 特别日关联 + 旧索引）。
   *
   * CHECK 无法 ALTER，故与 v67 自身同法重建：建 old 表 → 搬数据 → DROP → RENAME。
   */
  function revertToV66(d: Database.Database): void {
    d.exec(`
      CREATE TABLE greeting_templates_old (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id      INTEGER,
        text           TEXT NOT NULL,
        time_slot      TEXT NOT NULL DEFAULT 'any'
                       CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
        is_enabled     INTEGER NOT NULL DEFAULT 1,
        special_day_id INTEGER,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
        FOREIGN KEY (special_day_id) REFERENCES greeting_special_days(id) ON DELETE CASCADE
      )
    `)
    d.exec(`
      INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '67001', '问候画师', 'greeting-artist');
      INSERT INTO greeting_special_days (id, name, date_key) VALUES (1, '生日', '08-14');
    `)
    // 全局六档各一条 + 画师专属一条（night 档）+ 特别日关联一条
    d.exec(`
      INSERT INTO greeting_templates_old (artist_id, text, time_slot, is_enabled, special_day_id) VALUES
        (NULL, '早', 'morning', 1, NULL),
        (NULL, '午', 'afternoon', 1, NULL),
        (NULL, '晚', 'evening', 1, NULL),
        (NULL, '夜', 'night', 1, NULL),
        (NULL, '午夜', 'latenight', 1, NULL),
        (NULL, '全天', 'any', 1, NULL),
        (1, '专属夜', 'night', 1, NULL),
        (NULL, '生日文案', 'any', 1, 1)
    `)
    d.exec('CREATE INDEX IF NOT EXISTS idx_greeting_artist ON greeting_templates_old(artist_id, time_slot)')
    d.exec('DROP TABLE greeting_templates')
    d.exec('ALTER TABLE greeting_templates_old RENAME TO greeting_templates')
    // 索引随表改名失效（索引名绑在旧表上），用规范名重挂
    d.exec('DROP INDEX IF EXISTS idx_greeting_artist')
    d.exec('CREATE INDEX idx_greeting_artist ON greeting_templates(artist_id, time_slot)')
    // 前置自检：夹具确实是 v66 形态（CHECK 含 night/latenight、无 midnight），
    // 否则 v67 的幂等守卫会命中早退 → 后面的断言是假绿
    const sql = (d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='greeting_templates'").get() as { sql: string }).sql
    if (sql.includes("'midnight'")) throw new Error('夹具未退回 v66 形态：CHECK 已含 midnight')
    if (!sql.includes("'latenight'")) throw new Error('夹具未退回 v66 形态：CHECK 缺 latenight')
  }

  it('TC-MV67-03: 六档按规则搬家（night/latenight 合并 midnight），行数不丢', () => {
    const mem = preTargetDb(67, revertToV66)
    try {
      expect(isApplied(mem, 67), 'v67 版本行应由调度器写入').toBe(true)

      const rows = mem.prepare('SELECT text, time_slot, artist_id FROM greeting_templates ORDER BY id').all() as Array<{ text: string; time_slot: string; artist_id: number | null }>
      expect(rows).toHaveLength(8)
      const slotOf = Object.fromEntries(rows.map(r => [r.text, r.time_slot] as [string, string]))
      expect(slotOf['早']).toBe('morning')
      expect(slotOf['午']).toBe('afternoon')
      expect(slotOf['晚']).toBe('evening')
      expect(slotOf['夜']).toBe('midnight')
      expect(slotOf['午夜']).toBe('midnight')
      expect(slotOf['全天']).toBe('any')
      expect(slotOf['专属夜']).toBe('midnight')
    } finally {
      mem.close()
    }
  })

  it('TC-MV67-04: 归属（专属/全局）、启停、特别日关联、索引不变', () => {
    const mem = preTargetDb(67, revertToV66)
    try {
      const owned = mem.prepare("SELECT artist_id FROM greeting_templates WHERE text = '专属夜'").get() as { artist_id: number }
      expect(owned.artist_id).toBe(1)
      const special = mem.prepare("SELECT special_day_id FROM greeting_templates WHERE text = '生日文案'").get() as { special_day_id: number }
      expect(special.special_day_id).toBe(1)
      // 旧索引随重建恢复
      const idx = mem.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='greeting_templates' AND name='idx_greeting_artist'"
      ).get() as { name: string } | undefined
      expect(idx?.name).toBe('idx_greeting_artist')
      // 新 CHECK 生效：旧档插入被拒
      expect(() => mem.prepare(
        "INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, 'x', 'latenight')"
      ).run()).toThrow()
      // noTransaction 迁移收尾 FK 必须恢复 ON
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-MV67-05: 幂等守卫——已是新形态时重跑跳过且清残留', () => {
    const mem = preTargetDb(67, revertToV66)
    try {
      mem.exec('CREATE TABLE greeting_templates_new (id INTEGER PRIMARY KEY)') // 模拟失败残留
      // 真实入口重放：版本行删掉后由调度器再跑一次 v67
      mem.prepare('DELETE FROM schema_migrations WHERE version = 67').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 67)).toBe(true)
      expect(tableExists(mem, 'greeting_templates_new')).toBe(false)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates').get() as { n: number }).n).toBe(8)
    } finally {
      mem.close()
    }
  })
})
