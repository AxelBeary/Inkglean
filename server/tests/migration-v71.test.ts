import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再直导 v71——
// 范式同 migration-v36/v24.test.ts，避免循环求值撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v71-invite-codes-multi-use.js'

// PR114 MINOR-11 回归：v58 的 invite_codes.used_by_artist_id 无 FK 约束，可能残留悬空值；
// v71 回填 invite_code_uses.artist_id（REFERENCES artists）时 INSERT OR IGNORE 挡不住 FK 违例，
// 且该迁移 noTransaction——一条悬空行就会中断整条迁移链。修法：回填前 EXISTS 过滤悬空引用。

describe('迁移 v71: invite_codes_multi_use（PR114 MINOR-11 悬空外键过滤）', () => {
  it('TC-V71-00: 全量链路（setup.js initDatabase）后 v71 已应用，明细表在位', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 71').get() as { version: number } | undefined
    expect(applied?.version).toBe(71)
    expect(!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invite_code_uses'").get()).toBe(true)
  })

  it('TC-V71-01 (MINOR-11): 悬空 used_by_artist_id 的已用码回填被跳过，迁移不中断', () => {
    const mem = new Database(':memory:')
    // 打开外键才能真正暴露「INSERT OR IGNORE 不忽略 FK 违例」的原始缺陷
    mem.pragma('foreign_keys = ON')
    mem.exec('CREATE TABLE artists (id INTEGER PRIMARY KEY)')
    mem.exec(`
      CREATE TABLE invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'unused',
        used_by_artist_id INTEGER NULL,
        used_at TEXT NULL
      )
    `)
    mem.prepare('INSERT INTO artists (id) VALUES (?)').run(1)
    // 有效已用码：画师 1 存在，应回填一条明细
    mem.prepare("INSERT INTO invite_codes (code, status, used_by_artist_id, used_at) VALUES ('OK', 'used', 1, '2026-01-01')").run()
    // 悬空引用（v58 DDL 无 FK 约束，老库可能残留）：画师 999 不存在
    mem.prepare("INSERT INTO invite_codes (code, status, used_by_artist_id, used_at) VALUES ('DANGLING', 'used', 999, '2026-01-02')").run()

    // 修复前此处抛 SQLITE_CONSTRAINT_FOREIGNKEY 并中断 noTransaction 迁移；修复后静默跳过该行
    expect(() => migration.up(mem)).not.toThrow()
    const uses = mem.prepare('SELECT invite_code_id, artist_id FROM invite_code_uses ORDER BY id').all() as Array<{ invite_code_id: number; artist_id: number }>
    expect(uses).toHaveLength(1)
    expect(uses[0].artist_id).toBe(1)
    // 悬空码的 use_count 仍置 1（「已用」语义不变），只是没有明细行
    const dangling = mem.prepare("SELECT use_count FROM invite_codes WHERE code = 'DANGLING'").get() as { use_count: number }
    expect(dangling.use_count).toBe(1)
    expect(mem.pragma('foreign_key_check')).toEqual([])

    // 幂等重跑：明细表 UNIQUE 冲突被 OR IGNORE 兜住，行数不增
    expect(() => migration.up(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS c FROM invite_code_uses').get() as { c: number }).c).toBe(1)
    mem.close()
  })
})
