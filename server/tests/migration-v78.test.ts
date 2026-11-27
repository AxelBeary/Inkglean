import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { preTargetDb, isApplied } from './migration-real-entry.js'

// ============================================
// v78: idempotency_keys.request_hash（审计 #21 条目 3）
//   单列可空 TEXT、无默认值（照 v74/v76 范式：已应用 / 列结构 / 幂等 / 老库升级）
//   NULL = 该行写入时未记录载荷指纹，读侧维持旧重放语义
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，现改走
// `preTargetDb(78, revertToV77)`，由 initDatabase 调度器真实跑到 v78。断言未削弱。
// ============================================

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null }

/** 把基线库手术回 v78 前夜（v77 形态）：去掉 request_hash 列 + 留一条历史幂等行 */
function revertToV77(database: Database.Database): void {
  database.exec('ALTER TABLE idempotency_keys DROP COLUMN request_hash')
  // 前置自检：夹具确实退回了 v77 形态，否则后续断言是假绿
  const cols = (database.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]).map(c => c.name)
  if (cols.includes('request_hash')) throw new Error('夹具未退回 v77 形态：idempotency_keys.request_hash 仍然存在')
  database.exec(`
    INSERT INTO idempotency_keys (scope, key, status_code, response_json)
    VALUES ('payment:1', 'legacy-key', 200, '{"seq":1}')
  `)
}

describe('迁移 v78: idempotency_request_hash', () => {
  it('TC-MV78-01: v78 已应用（schema_migrations 有版本 78）', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 78'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(78)
  })

  it('TC-MV78-02: idempotency_keys.request_hash 存在——TEXT / 可空 / 无默认', () => {
    const cols = db.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]
    const col = cols.find(c => c.name === 'request_hash')
    expect(col, 'idempotency_keys.request_hash 应存在').toBeDefined()
    expect(col!.type).toBe('TEXT')
    expect(col!.notnull).toBe(0)
    expect(col!.dflt_value).toBeNull()
  })

  it('TC-MV78-03: 幂等——重跑 initDatabase 不抛错且列不重复（schema 建表与迁移双轨收敛）', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]
    expect(cols.filter(c => c.name === 'request_hash')).toHaveLength(1)
  })

  it('TC-MV78-04: 老库升级——列加出、存量行不丢、旧行指纹为 NULL', () => {
    const mem = preTargetDb(78, revertToV77)
    try {
      expect(isApplied(mem, 78), 'v78 版本行应由 initDatabase 调度器写入').toBe(true)

      const cols = mem.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]
      expect(cols.some(c => c.name === 'request_hash')).toBe(true)

      const row = mem.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get('legacy-key') as
        { status_code: number; response_json: string; request_hash: string | null }
      expect(row.status_code).toBe(200)
      expect(row.response_json).toBe('{"seq":1}')
      expect(row.request_hash).toBeNull()
    } finally {
      mem.close()
    }
  })

  it('TC-MV78-05: 幂等守卫——已是新形态时重跑跳过且存量行不受影响', () => {
    const mem = preTargetDb(78, revertToV77)
    try {
      expect(() => initDatabase(mem)).not.toThrow()

      const cols = mem.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]
      expect(cols.filter(c => c.name === 'request_hash')).toHaveLength(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM idempotency_keys').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })
})
