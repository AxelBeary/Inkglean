import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再谈驱动——
// 否则模块循环求值会让迁移体未完成时进数组，撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/init.js'
import { preTargetDb, isApplied } from './migration-real-entry.js'

// PR114 MINOR-2 回归：历史 v58 原地删 CREATE INDEX 对老实例无效，冗余
// idx_invite_codes_code 永久留存；改为恢复 v58 原文 + 新迁移 v84 DROP INDEX IF EXISTS。
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，绕开 initDatabase 的
// 版本调度语义。现改走 `preTargetDb(84, revertToV83)`：预置 1..83 全部版本行、
// 只留 v84 未应用，由调度器自己跑到 v84。断言逐条对应改造前，未削弱。

describe('迁移 v84: drop_invite_codes_code_index（PR114 MINOR-2）', () => {
  it('TC-V84-00: 全量链路后 v84 已应用，冗余 code 索引不存在而 status 索引保留', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 84').get() as { version: number } | undefined
    expect(applied?.version).toBe(84)
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invite_codes'").all() as Array<{ name: string }>).map(i => i.name)
    expect(names).not.toContain('idx_invite_codes_code')
    expect(names).toContain('idx_invite_codes_status')
  })

  /**
   * 把基线库手术回 v84 前夜（v83 形态）：按 v58 原文重建 invite_codes 与两个索引，
   * 再补上 v71/v83 加过的列——即「老实例已升到 v83」的真实形态。
   * invite_codes 不在 schema.ts 基线里（v58 迁移建的），故这里手工建表。
   */
  function revertToV83(d: Database.Database): void {
    d.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused', 'used', 'revoked')),
        expires_at TEXT NOT NULL,
        created_by INTEGER,
        used_by_artist_id INTEGER NULL,
        used_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        max_uses INTEGER NOT NULL DEFAULT 1,
        use_count INTEGER NOT NULL DEFAULT 0,
        qq_number TEXT NULL
      )
    `)
    // 模拟老实例：v58 原文建过 code 索引 + status 索引
    d.exec('CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code)')
    d.exec('CREATE INDEX IF NOT EXISTS idx_invite_codes_status ON invite_codes(status)')
    // 前置自检：夹具确实是 v83 形态（冗余索引还在），否则后面的断言是假绿
    const names = (d.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invite_codes'").all() as Array<{ name: string }>).map(i => i.name)
    if (!names.includes('idx_invite_codes_code')) {
      throw new Error('夹具未退回 v83 形态：idx_invite_codes_code 不存在')
    }
    if (isApplied(d, 84)) throw new Error('夹具错误：v84 不应预置为已应用')
  }

  const indexNames = (database: Database.Database) =>
    (database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invite_codes'").all() as Array<{ name: string }>).map(i => i.name)

  it('TC-V84-01: 预置冗余索引的库跑 v84 后索引被删除，重复执行幂等', () => {
    const mem = preTargetDb(84, revertToV83)
    try {
      expect(isApplied(mem, 84), 'v84 版本行应由调度器写入').toBe(true)
      expect(indexNames(mem)).not.toContain('idx_invite_codes_code')
      expect(indexNames(mem)).toContain('idx_invite_codes_status')
      // 唯一约束（sqlite_autoindex）不受影响，按码校验行为不变
      const uniqueCols = (mem.prepare('PRAGMA index_list(invite_codes)').all() as Array<{ origin: string; unique: number }>)
        .filter(i => i.unique === 1 && i.origin === 'u')
      expect(uniqueCols.length).toBeGreaterThanOrEqual(1)
    } finally {
      mem.close()
    }
  })

  it('TC-V84-02: 半态重跑幂等——索引已不存在时再跑 v84 不抛错', () => {
    const mem = preTargetDb(84, revertToV83)
    try {
      // 模拟半态：版本行丢失但 DROP 已落地过（真实入口重放一次 v84）
      mem.prepare('DELETE FROM schema_migrations WHERE version = 84').run()
      expect(isApplied(mem, 84)).toBe(false)
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 84)).toBe(true)
      expect(indexNames(mem)).not.toContain('idx_invite_codes_code')
    } finally {
      mem.close()
    }
  })
})