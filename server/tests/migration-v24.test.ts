import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再直导 v24——
// 否则 v24→migrate.ts→index.ts 循环求值会让 v24 模块体未完成时进数组，撞顺序断言（范式同 migration-v50.test.ts）
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v24-quota-pool-paid-total.js'

// F0077（B2 high）回归：v24 存量换算旧实现裸 UPDATE 无条件覆盖全体订单 paid_total_cents，
// 改 WHERE 双条件（EXISTS 限定目标行 + 基线原值校验）。范式同 migration-v50.test.ts 直调 up。

/** 构造 v24 前夜旧形态库：orders（可选 paid_total_cents 列）+ 含 status 列的分期表 */
function buildOldShapeDb(opts: { ordersPaidCol: boolean }): Database.Database {
  const mem = new Database(':memory:')
  const paidCol = opts.ordersPaidCol ? ', paid_total_cents INTEGER DEFAULT 0' : ''
  mem.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT${paidCol}
    )
  `)
  mem.exec(`
    CREATE TABLE order_payment_installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'unpaid'
    )
  `)
  return mem
}

describe('迁移 v24: quota_pool_paid_total（F0077 回填限定与原值校验）', () => {
  it('TC-F77-00: 全量链路（setup.js initDatabase）后 paid_total_cents 在位，新形态不触发换算', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 24').get() as { version: number } | undefined
    expect(applied?.version).toBe(24)
    const oCols = (db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map(c => c.name)
    expect(oCols).toContain('paid_total_cents')
    // v52 已退役分期表 status 列：v24 探测守卫在全量链路上不再触发换算
    const iCols = (db.prepare('PRAGMA table_info(order_payment_installments)').all() as Array<{ name: string }>).map(c => c.name)
    expect(iCols).not.toContain('status')
    // 收款流水表随 v24 建立
    expect(!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_payments'").get()).toBe(true)
  })

  it('TC-F77-01: 首跑换算正确——已付分期求和落库，未付/无分期订单保持基线 0，重跑幂等', () => {
    const mem = buildOldShapeDb({ ordersPaidCol: false })
    const insOrder = mem.prepare('INSERT INTO orders (order_no) VALUES (?)')
    const o1 = Number(insOrder.run('O-1').lastInsertRowid)
    const o2 = Number(insOrder.run('O-2').lastInsertRowid)
    const o3 = Number(insOrder.run('O-3').lastInsertRowid)
    const insInst = mem.prepare('INSERT INTO order_payment_installments (order_id, amount_cents, status) VALUES (?, ?, ?)')
    insInst.run(o1, 1000, 'paid')
    insInst.run(o1, 2000, 'paid')
    insInst.run(o1, 5000, 'unpaid')
    insInst.run(o2, 4000, 'unpaid')
    // o3 无分期

    expect(() => migration.up(mem)).not.toThrow()
    const paid = (id: number) => (mem.prepare('SELECT paid_total_cents AS p FROM orders WHERE id = ?').get(id) as { p: number }).p
    expect(paid(o1)).toBe(3000) // 已付分期 1000+2000
    expect(paid(o2)).toBe(0)    // 仅未付分期
    expect(paid(o3)).toBe(0)     // 无分期
    // 收款流水表建好
    expect(!!mem.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_payments'").get()).toBe(true)
    // 幂等重跑：值不变
    expect(() => migration.up(mem)).not.toThrow()
    expect(paid(o1)).toBe(3000)
    mem.close()
  })

  it('TC-F77-02: 修复重放不覆盖——流水维护过的金额保持原值（F0077 核心）', () => {
    const mem = buildOldShapeDb({ ordersPaidCol: true })
    const insOrder = mem.prepare('INSERT INTO orders (order_no, paid_total_cents) VALUES (?, ?)')
    // o1: 分期和 3000，v24 后 addPayment 又收 3000 → 6000；旧实现重放会冲回 3000
    const o1 = Number(insOrder.run('O-1', 6000).lastInsertRowid)
    // o2: 纯手工收款（无任何分期）；旧实现重放会冲回 0
    const o2 = Number(insOrder.run('O-2', 700).lastInsertRowid)
    // o3: 从未换算过的基线 0 行（有已付分期）
    const o3 = Number(insOrder.run('O-3', 0).lastInsertRowid)
    // o4: 显式 NULL 基线（COALESCE 按「从未写过」处理）
    const o4 = Number(insOrder.run('O-4', null).lastInsertRowid)
    const insInst = mem.prepare('INSERT INTO order_payment_installments (order_id, amount_cents, status) VALUES (?, ?, ?)')
    insInst.run(o1, 1000, 'paid')
    insInst.run(o1, 2000, 'paid')
    insInst.run(o3, 3000, 'paid')
    insInst.run(o4, 900, 'paid')

    expect(() => migration.up(mem)).not.toThrow()
    const paid = (id: number) => (mem.prepare('SELECT paid_total_cents AS p FROM orders WHERE id = ?').get(id) as { p: number | null }).p
    expect(paid(o1)).toBe(6000) // 原值校验拦下：已由流水维护，不再覆盖
    expect(paid(o2)).toBe(700)  // EXISTS 拦下：无已付分期，非目标行
    expect(paid(o3)).toBe(3000) // 基线行照常换算
    expect(paid(o4)).toBe(900)   // NULL 视作基线，照常换算
    mem.close()
  })

  it('TC-F77-03: 新形态库（v52 已退役 status 列）——不触发换算，只补列', () => {
    const mem = new Database(':memory:')
    mem.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT)')
    // v52 后分期表无 status 列（节点已收一律由 paid_total 顺序推导）
    mem.exec(`
      CREATE TABLE order_payment_installments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL
      )
    `)
    const o1 = Number(mem.prepare('INSERT INTO orders (order_no) VALUES (?)').run('O-1').lastInsertRowid)
    mem.prepare('INSERT INTO order_payment_installments (order_id, amount_cents) VALUES (?, ?)').run(o1, 1000)

    expect(() => migration.up(mem)).not.toThrow()
    // 列补齐 + 基线 0；无 status 列不换算
    const cols = (mem.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>).map(c => c.name)
    expect(cols).toContain('paid_total_cents')
    const paid = (mem.prepare('SELECT paid_total_cents AS p FROM orders WHERE id = ?').get(o1) as { p: number }).p
    expect(paid).toBe(0)
    mem.close()
  })
})
