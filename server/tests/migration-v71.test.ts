import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再谈驱动——
// 否则模块循环求值会让迁移体未完成时进数组，撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/init.js'
import { preTargetDb, isApplied, dropColumnIfExists, columnNames } from './migration-real-entry.js'

// PR114 MINOR-11 回归：v58 的 invite_codes.used_by_artist_id 无 FK 约束，可能残留悬空值；
// v71 回填 invite_code_uses.artist_id（REFERENCES artists）时 INSERT OR IGNORE 挡不住 FK 违例，
// 且该迁移 noTransaction——一条悬空行就会中断整条迁移链。修法：回填前 EXISTS 过滤悬空引用。
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，绕开 initDatabase 的
// 版本调度语义。v71 是 noTransaction：真实路径是「调度器 COMMIT 释放锁 → 事务外执行 →
// 重新抢锁 + 刷新 applied」，直调根本走不到这段。现改走 `preTargetDb(71, revertToV70)`，
// 由调度器自己跑到 v71。断言逐条对应改造前，未削弱。

describe('迁移 v71: invite_codes_multi_use（PR114 MINOR-11 悬空外键过滤）', () => {
  it('TC-V71-00: 全量链路（setup.js initDatabase）后 v71 已应用，明细表在位', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 71').get() as { version: number } | undefined
    expect(applied?.version).toBe(71)
    expect(!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invite_code_uses'").get()).toBe(true)
  })

  /**
   * 把基线库手术回 v71 前夜（v70 形态）：invite_codes 去掉 max_uses/use_count、
   * 删掉明细表，并塞入「有效已用码 + 悬空已用码」两行。
   * 悬空引用是 v58 DDL 无 FK 约束留下的历史形态，画师 999 不存在。
   */
  function revertToV70(d: Database.Database): void {
    // invite_codes 由 v58 建立、不进 schema.ts 基线 → 这里按 v58 原文 DDL 补上，
    // 再把 v71 才加的两列与明细表摘掉，即得 v70 形态。
    d.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused', 'used', 'revoked')),
        expires_at TEXT NOT NULL,
        created_by INTEGER,
        used_by_artist_id INTEGER NULL,
        used_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    dropColumnIfExists(d, 'invite_codes', 'max_uses')
    dropColumnIfExists(d, 'invite_codes', 'use_count')
    d.exec('DROP TABLE IF EXISTS invite_code_uses')
    // 前置自检：夹具确实退回了 v70 形态，否则后续断言是假绿
    const cols = columnNames(d, 'invite_codes')
    if (cols.includes('max_uses') || cols.includes('use_count')) {
      throw new Error('夹具未退回 v70 形态：invite_codes 仍有 max_uses/use_count')
    }
    d.exec(`
      INSERT INTO artists (id, qq_number, name, subdomain) VALUES (1, '71001', '邀请码画师', 'invite-artist');
      INSERT INTO invite_codes (code, status, expires_at, used_by_artist_id, used_at)
        VALUES ('OK', 'used', '2030-01-01', 1, '2026-01-01');
      INSERT INTO invite_codes (code, status, expires_at, used_by_artist_id, used_at)
        VALUES ('DANGLING', 'used', '2030-01-01', 999, '2026-01-02');
    `)
  }

  it('TC-V71-01 (MINOR-11): 悬空 used_by_artist_id 的已用码回填被跳过，迁移不中断', () => {
    // 打开外键才能真正暴露「INSERT OR IGNORE 不忽略 FK 违例」的原始缺陷
    //（preTargetDb 默认已经 foreign_keys = ON）
    const mem = preTargetDb(71, revertToV70)
    try {
      // 修复前此处抛 SQLITE_CONSTRAINT_FOREIGNKEY 并中断 noTransaction 迁移；
      // 修复后静默跳过该行。能走到这里 = preTargetDb 里的 initDatabase 没抛。
      expect(isApplied(mem, 71), 'v71 版本行应由调度器写入').toBe(true)
      const uses = mem.prepare('SELECT invite_code_id, artist_id FROM invite_code_uses ORDER BY id').all() as Array<{ invite_code_id: number; artist_id: number }>
      expect(uses).toHaveLength(1)
      expect(uses[0].artist_id).toBe(1)
      // 悬空码的 use_count 仍置 1（「已用」语义不变），只是没有明细行
      const dangling = mem.prepare("SELECT use_count FROM invite_codes WHERE code = 'DANGLING'").get() as { use_count: number }
      expect(dangling.use_count).toBe(1)
      expect(mem.pragma('foreign_key_check')).toEqual([])

      // 幂等重跑：明细表 UNIQUE 冲突被 OR IGNORE 兜住，行数不增（真实入口：调度器重放 v71）
      mem.prepare('DELETE FROM schema_migrations WHERE version = 71').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 71)).toBe(true)
      expect((mem.prepare('SELECT COUNT(*) AS c FROM invite_code_uses').get() as { c: number }).c).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-V71-02: 版本行由调度器写入，且 noTransaction 迁移执行后 FK 恢复 ON', () => {
    const mem = preTargetDb(71, revertToV70)
    try {
      // noTransaction 迁移自己不管 FK；调度器也从不关它 —— 全程必须保持 ON，
      // 否则后续 CASCADE 全部失效（v38 事故同款陷阱）
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
      // 半态修复：手工删掉明细表后重放，调度器应把表补回来（完整性守卫）
      mem.exec('DROP TABLE invite_code_uses')
      mem.prepare('DELETE FROM schema_migrations WHERE version = 71').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(!!mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invite_code_uses'").get()).toBe(true)
    } finally {
      mem.close()
    }
  })
})
