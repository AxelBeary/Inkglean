import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { preTargetDb, isApplied } from './migration-real-entry.js'

// ============================================
// v79: order_payments.revoke_of_payment_id（审计 #21 条目 4）
//   单列可空 INTEGER、无默认值（照 v74/v78 范式：已应用 / 列结构 / 幂等 / 老库升级）
//   NULL = 未关联撤销（历史退款/手工冲正），不计入某笔正数收款的已撤额度
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，现改走
// `preTargetDb(79, revertToV78)`，由 initDatabase 调度器真实跑到 v79。断言未削弱。
// ============================================

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null }

/** 把基线库手术回 v79 前夜（v78 形态）：去掉 revoke_of_payment_id 列 + 留正负两笔流水 */
function revertToV78(database: Database.Database): void {
  database.exec('ALTER TABLE order_payments DROP COLUMN revoke_of_payment_id')
  // 前置自检：夹具确实退回了 v78 形态，否则后续断言是假绿
  const cols = (database.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]).map(c => c.name)
  if (cols.includes('revoke_of_payment_id')) {
    throw new Error('夹具未退回 v78 形态：order_payments.revoke_of_payment_id 仍然存在')
  }
  database.exec(`
    INSERT INTO artists (qq_number, name, subdomain) VALUES ('79001', '撤销画师', 'revoke-artist');
    INSERT INTO orders (artist_id, order_no, client_qq) VALUES (1, 'RV-001', '7900');
    INSERT INTO order_payments (order_id, amount_cents, note) VALUES (1, 10000, '定金'), (1, -10000, '撤销 #1');
  `)
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
    const mem = preTargetDb(79, revertToV78)
    try {
      expect(isApplied(mem, 79), 'v79 版本行应由 initDatabase 调度器写入').toBe(true)

      const cols = mem.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]
      expect(cols.some(c => c.name === 'revoke_of_payment_id')).toBe(true)

      const rows = mem.prepare('SELECT * FROM order_payments ORDER BY id').all() as Array<
        { amount_cents: number; note: string; revoke_of_payment_id: number | null }
      >
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({ amount_cents: 10000, revoke_of_payment_id: null })
      expect(rows[1]).toMatchObject({ amount_cents: -10000, revoke_of_payment_id: null })
    } finally {
      mem.close()
    }
  })

  it('TC-MV79-05: 幂等守卫——已是新形态时重跑跳过且存量行不受影响', () => {
    const mem = preTargetDb(79, revertToV78)
    try {
      expect(() => initDatabase(mem)).not.toThrow()

      const cols = mem.prepare('PRAGMA table_info(order_payments)').all() as ColInfo[]
      expect(cols.filter(c => c.name === 'revoke_of_payment_id')).toHaveLength(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM order_payments').get() as { n: number }).n).toBe(2)
    } finally {
      mem.close()
    }
  })
})
