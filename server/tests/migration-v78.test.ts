import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v78-idempotency-request-hash.js'

// ============================================
// v78: idempotency_keys.request_hash（审计 #21 条目 3）
//   单列可空 TEXT、无默认值（照 v74/v76 范式：已应用 / 列结构 / 幂等 / 老库升级）
//   NULL = 该行写入时未记录载荷指纹，读侧维持旧重放语义
// ============================================

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null }

/** 迁移前形态：idempotency_keys 无 request_hash 列 */
function buildOldDb() {
  const mem = new Database(':memory:')
  mem.exec(`
    CREATE TABLE idempotency_keys (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (scope, key)
    )
  `)
  mem.exec(`
    INSERT INTO idempotency_keys (scope, key, status_code, response_json)
    VALUES ('payment:1', 'legacy-key', 200, '{"seq":1}');
  `)
  return mem
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
    const mem = buildOldDb()
    expect(() => migration.up(mem)).not.toThrow()

    const cols = mem.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]
    expect(cols.some(c => c.name === 'request_hash')).toBe(true)

    const row = mem.prepare('SELECT * FROM idempotency_keys WHERE key = ?').get('legacy-key') as
      { status_code: number; response_json: string; request_hash: string | null }
    expect(row.status_code).toBe(200)
    expect(row.response_json).toBe('{"seq":1}')
    expect(row.request_hash).toBeNull()
    mem.close()
  })

  it('TC-MV78-05: 幂等守卫——已是新形态时重跑跳过且存量行不受影响', () => {
    const mem = buildOldDb()
    migration.up(mem)
    expect(() => migration.up(mem)).not.toThrow()

    const cols = mem.prepare('PRAGMA table_info(idempotency_keys)').all() as ColInfo[]
    expect(cols.filter(c => c.name === 'request_hash')).toHaveLength(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM idempotency_keys').get() as { n: number }).n).toBe(1)
    mem.close()
  })
})
