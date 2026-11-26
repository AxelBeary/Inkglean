import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import Database from 'better-sqlite3'
// 先经 setup.js 拉起共享模块图（connection → init → migrate → migrations/index）再直导 v24，
// 否则 v24 → migrate.ts → index.ts 循环求值会撞顺序断言（范式同 migration-v50.test.ts）
import { migration } from '../src/db/migrations/v24-quota-pool-paid-total.js'

// GIT-2: v24 存量换算裸 UPDATE 在重放（版本表丢失）时会冲回流水维护的 paid_total_cents；
// 改三重 WHERE（基线原值 0 + EXISTS 已付分期 + NOT EXISTS 流水），流水表提前于换算建立
function buildOldShapeDb(): Database.Database {
  const mem = new Database(':memory:')
  mem.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT, paid_total_cents INTEGER DEFAULT 0);
    CREATE TABLE order_payment_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'unpaid'
    )
  `)
  return mem
}

describe('迁移 v24（GIT-2）paid_total_cents 回填守卫', () => {
  it('TC-B2-V24-00: 全量链路已应用 v24，收款流水表在位', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 24').get() as { version: number } | undefined
    expect(applied?.version).toBe(24)
    expect(!!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_payments'").get()).toBe(true)
  })

  it('TC-B2-V24-01: 基线行照常回填，流水维护/退款归零/无已付分期行不动，重跑幂等', () => {
    const mem = buildOldShapeDb()
    const insOrder = mem.prepare('INSERT INTO orders (order_no, paid_total_cents) VALUES (?, ?)')
    const baseline = Number(insOrder.run('O-1', 0).lastInsertRowid)
    const maintained = Number(insOrder.run('O-2', 6000).lastInsertRowid)
    const refunded = Number(insOrder.run('O-3', 0).lastInsertRowid)
    const unpaid = Number(insOrder.run('O-4', 0).lastInsertRowid)
    const insInst = mem.prepare('INSERT INTO order_payment_installments (order_id, amount_cents, status) VALUES (?, ?, ?)')
    insInst.run(baseline, 1000, 'paid')
    insInst.run(baseline, 2000, 'paid')
    insInst.run(maintained, 3000, 'paid')
    insInst.run(refunded, 5000, 'paid')
    insInst.run(unpaid, 400, 'unpaid')
    // 重放场景：该单已有收/退款流水（全额退款后净 0），旧实现会把 5000 旧分期「复活」
    mem.exec('CREATE TABLE order_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL)')
    const insPay = mem.prepare('INSERT INTO order_payments (order_id, amount_cents) VALUES (?, ?)')
    insPay.run(refunded, 5000)
    insPay.run(refunded, -5000)

    expect(() => migration.up(mem)).not.toThrow()
    const paid = (id: number) => (mem.prepare('SELECT paid_total_cents AS p FROM orders WHERE id = ?').get(id) as { p: number }).p
    expect(paid(baseline)).toBe(3000)
    expect(paid(maintained)).toBe(6000)
    expect(paid(refunded)).toBe(0)
    expect(paid(unpaid)).toBe(0)
    expect(() => migration.up(mem)).not.toThrow()
    expect(paid(baseline)).toBe(3000)
    mem.close()
  })
})
