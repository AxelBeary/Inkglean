import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v79-payment-revoke-link.js'

// ============================================
// v79: order_payments.revoke_of_payment_id（审计 #21 条目 4）
//   单列可空 INTEGER、无默认值（照 v74/v78 范式：已应用 / 列结构 / 幂等 / 老库升级）
//   NULL = 未关联撤销（历史退款/手工冲正），不计入某笔正数收款的已撤额度
// ============================================

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null }

/** 迁移前形态：order_payments 无 revoke_of_payment_id 列 */
function buildOldDb() {
  const mem = new Database(':memory:')
  mem.exec(`
    CREATE TABLE order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      installment_id INTEGER DEFAULT NULL,
      amount_cents INTEGER NOT NULL,
      note TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT 'artist'
    )
  `)
  mem.exec(`
    INSERT INTO order_payments (order_id, amount_cents, note) VALUES (1, 10000, '定金'), (1, -10000, '撤销 #1');
  `)
  return mem
}

describe('迁移 v79: payment_revoke_link', () => {
  it('TC-MV79-01: v79 已应用（schema_migrations 有版本 79）', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 79'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(79)
  })

  it('TC-MV79-02: order_payments.revoke_of_payment_id 存在——INTEGER / 可空 / 无默认', () => {
    const cols = db.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]
    const col = cols.find(c => c.name === 'revoke_of_payment_id')
    expect(col, 'order_payments.revoke_of_payment_id 应存在').toBeDefined()
    expect(col!.type).toBe('INTEGER')
    expect(col!.notnull).toBe(0)
    expect(col!.dflt_value).toBeNull()
  })

  it('TC-MV79-03: 幂等——重跑 initDatabase 不抛错且列不重复（schema 建表与迁移双轨收敛）', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]
    expect(cols.filter(c => c.name === 'revoke_of_payment_id')).toHaveLength(1)
  })

  it('TC-MV79-04: 老库升级——列加出、存量正负流水都不丢、旧行关联为 NULL', () => {
    const mem = buildOldDb()
    expect(() => migration.up(mem)).not.toThrow()

    const cols = mem.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]
    expect(cols.some(c => c.name === 'revoke_of_payment_id')).toBe(true)

    const rows = mem.prepare('SELECT * FROM order_payments ORDER BY id').all() as Array<
      { amount_cents: number; note: string; revoke_of_payment_id: number | null }
    >
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ amount_cents: 10000, revoke_of_payment_id: null })
    expect(rows[1]).toMatchObject({ amount_cents: -10000, revoke_of_payment_id: null })
    mem.close()
  })

  it('TC-MV79-05: 幂等守卫——已是新形态时重跑跳过且存量行不受影响', () => {
    const mem = buildOldDb()
    migration.up(mem)
    expect(() => migration.up(mem)).not.toThrow()

    const cols = mem.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]
    expect(cols.filter(c => c.name === 'revoke_of_payment_id')).toHaveLength(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM order_payments').get() as { n: number }).n).toBe(2)
    mem.close()
  })
})
