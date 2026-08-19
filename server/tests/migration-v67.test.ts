import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v67-greeting-slot-rework.js'

// v67: 问候系统重构——7 档时段（旧 6 档搬家：night/latenight→midnight，新增 early/noon）
// setup.js import 时 initDatabase 已跑全量迁移（含 v67），以下按迁移真实产物做回读断言
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
})

// 搬家语义测试：合成旧形态库（v66 形态）→ 跑 v67 → 断言档位搬家 + 归属不变
describe('迁移 v67 旧数据搬家', () => {
  /** 构造 v66 形态库：旧 6 档 CHECK + 各档位都有数据（含画师专属/特别日关联） */
  function buildOldDb() {
    const mem = new Database(':memory:')
    mem.exec('CREATE TABLE artists (id INTEGER PRIMARY KEY)')
    mem.exec(`
      CREATE TABLE greeting_special_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date_key TEXT NOT NULL,
        artist_id INTEGER,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    mem.exec(`
      CREATE TABLE greeting_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER,
        text TEXT NOT NULL,
        time_slot TEXT NOT NULL DEFAULT 'any'
                   CHECK(time_slot IN ('morning','afternoon','evening','night','latenight','any')),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        special_day_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
        FOREIGN KEY (special_day_id) REFERENCES greeting_special_days(id) ON DELETE CASCADE
      )
    `)
    mem.exec('CREATE INDEX idx_greeting_artist ON greeting_templates(artist_id, time_slot)')
    mem.exec('INSERT INTO artists (id) VALUES (1)')
    mem.exec("INSERT INTO greeting_special_days (name, date_key) VALUES ('生日', '08-14')")
    const ins = mem.prepare(
      'INSERT INTO greeting_templates (artist_id, text, time_slot, is_enabled, special_day_id) VALUES (?, ?, ?, ?, ?)'
    )
    // 全局六档各一条
    ins.run(null, '早', 'morning', 1, null)
    ins.run(null, '午', 'afternoon', 1, null)
    ins.run(null, '晚', 'evening', 1, null)
    ins.run(null, '夜', 'night', 1, null)
    ins.run(null, '午夜', 'latenight', 1, null)
    ins.run(null, '全天', 'any', 1, null)
    // 画师专属一条（night 档）+ 特别日关联一条
    ins.run(1, '专属夜', 'night', 1, null)
    ins.run(null, '生日文案', 'any', 1, 1)
    return mem
  }

  it('TC-MV67-03: 六档按规则搬家（night/latenight 合并 midnight），行数不丢', () => {
    const mem = buildOldDb()
    expect(() => migration.up(mem)).not.toThrow()

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
  })

  it('TC-MV67-04: 归属（专属/全局）、启停、特别日关联、索引不变', () => {
    const mem = buildOldDb()
    migration.up(mem)

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
    mem.close()
  })

  it('TC-MV67-05: 幂等守卫——已是新形态时重跑跳过且清残留', () => {
    const mem = buildOldDb()
    migration.up(mem)
    mem.exec('CREATE TABLE greeting_templates_new (id INTEGER PRIMARY KEY)') // 模拟失败残留
    expect(() => migration.up(mem)).not.toThrow()
    const leftover = mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='greeting_templates_new'").get()
    expect(leftover).toBeUndefined()
    expect((mem.prepare('SELECT COUNT(*) AS n FROM greeting_templates').get() as { n: number }).n).toBe(8)
    mem.close()
  })
})
