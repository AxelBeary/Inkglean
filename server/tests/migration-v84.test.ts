import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再直导 v84——
// 范式同 migration-v36/v71.test.ts，避免循环求值撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v84-drop-invite-codes-code-index.js'

// PR114 MINOR-2 回归：历史 v58 原地删 CREATE INDEX 对老实例无效，冗余
// idx_invite_codes_code 永久留存；改为恢复 v58 原文 + 新迁移 v84 DROP INDEX IF EXISTS。

describe('迁移 v84: drop_invite_codes_code_index（PR114 MINOR-2）', () => {
  it('TC-V84-00: 全量链路后 v84 已应用，冗余 code 索引不存在而 status 索引保留', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 84').get() as { version: number } | undefined
    expect(applied?.version).toBe(84)
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invite_codes'").all() as Array<{ name: string }>).map(i => i.name)
    expect(names).not.toContain('idx_invite_codes_code')
    expect(names).toContain('idx_invite_codes_status')
  })

  it('TC-V84-01: 预置冗余索引的库跑 v84 后索引被删除，重复执行幂等', () => {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'unused'
      )
    `)
    // 模拟老实例：v58 原文建过 code 索引 + status 索引
    mem.exec('CREATE INDEX idx_invite_codes_code ON invite_codes(code)')
    mem.exec('CREATE INDEX idx_invite_codes_status ON invite_codes(status)')
    const names = () => (mem.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invite_codes'").all() as Array<{ name: string }>).map(i => i.name)
    expect(names()).toContain('idx_invite_codes_code')

    expect(() => migration.up(mem)).not.toThrow()
    expect(names()).not.toContain('idx_invite_codes_code')
    expect(names()).toContain('idx_invite_codes_status')
    // 半态重跑幂等
    expect(() => migration.up(mem)).not.toThrow()
    expect(names()).not.toContain('idx_invite_codes_code')
    // 唯一约束（sqlite_autoindex）不受影响，按码校验行为不变
    const uniqueCols = (mem.prepare('PRAGMA index_list(invite_codes)').all() as Array<{ origin: string; unique: number }>)
      .filter(i => i.unique === 1 && i.origin === 'u')
    expect(uniqueCols.length).toBeGreaterThanOrEqual(1)
    mem.close()
  })
})
