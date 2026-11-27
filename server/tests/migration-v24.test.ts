import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再谈驱动——
// 否则模块循环求值会让迁移体未完成时进数组，撞版本升序断言。
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase } from '../src/db/init.js'
import { preTargetDb, isApplied, dropColumnIfExists, columnNames, tableExists } from './migration-real-entry.js'

// F0077（B2 high）回归：v24 存量换算旧实现裸 UPDATE 无条件覆盖全体订单 paid_total_cents，
// 改 WHERE 三重条件（偏小才补 + EXISTS 限定目标行 + NOT EXISTS 流水哨兵）。
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，绕开 initDatabase 的
// 版本调度语义。现全部改走 `preTargetDb(24, revert)`：以 schema 基线起库 → 手术回目标前夜 →
// 预置除 v24 外全部版本行 → 调度器自己跑到 v24。断言逐条对应改造前，未削弱。
//
// 两套夹具（对应 v24 的两种真实到达路径）：
//   A. `revertToV23`        —— 真·v23 老库：orders 无 paid_total_cents、无 order_payments 表、
//                              分期表带 v52 前才有的 status 列。→ 验「首跑换算」。
//   B. `revertToV24HalfApplied` —— v24 已加过列/建过表但版本行丢失（崩溃残留/版本表回滚）：
//                              列与流水表在位、存量值非基线。→ 验「重放不覆盖」。

/**
 * 夹具 A：把基线库手术回 v24 前夜（v23 形态）。
 * - orders 去掉 paid_total_cents（v24 第 1 步才加）
 * - order_payment_installments 补回 status 列（v52 退役——v24 的换算守卫正是靠它探测旧形态）
 * - 删掉 order_payments 表（v24 第 2 步才建）
 */
function revertToV23(d: Database.Database): void {
  dropColumnIfExists(d, 'orders', 'paid_total_cents')
  d.exec('DROP TABLE IF EXISTS order_payments')
  dropColumnIfExists(d, 'order_payment_installments', 'status')
  d.exec("ALTER TABLE order_payment_installments ADD COLUMN status TEXT DEFAULT 'unpaid'")
  // 前置自检：夹具确实退回了 v23 形态，否则后续断言是假绿
  if (columnNames(d, 'orders').includes('paid_total_cents')) {
    throw new Error('夹具未退回 v23 形态：orders.paid_total_cents 仍然存在')
  }
  if (!columnNames(d, 'order_payment_installments').includes('status')) {
    throw new Error('夹具未退回 v23 形态：order_payment_installments.status 不存在')
  }
  if (tableExists(d, 'order_payments')) {
    throw new Error('夹具未退回 v23 形态：order_payments 仍然存在')
  }
}

/** 夹具 B：v23 形态 + 手动补齐 v24 的两项产物（列 + 流水表），模拟「v24 已跑过但版本行丢了」 */
function revertToV24HalfApplied(d: Database.Database): void {
  revertToV23(d)
  d.exec('ALTER TABLE orders ADD COLUMN paid_total_cents INTEGER DEFAULT 0')
  d.exec(`
    CREATE TABLE order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      note TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT DEFAULT 'artist'
    )
  `)
}

/**
 * 造一名画师（复用首条）+ 一笔订单。
 * v23 形态没有 paid_total_cents 列 → 该形态下走不带列的 INSERT（付值无意义，恒为「无基线」）。
 */
function seedOrder(database: Database.Database, orderNo: string, paid: number | null): number {
  if (!database.prepare('SELECT id FROM artists LIMIT 1').get()) {
    database.prepare("INSERT INTO artists (qq_number, name, subdomain) VALUES ('24001', '额度池画师', 'quota-artist')").run()
  }
  const artistId = (database.prepare('SELECT id FROM artists LIMIT 1').get() as { id: number }).id
  const hasPaidCol = columnNames(database, 'orders').includes('paid_total_cents')
  const res = hasPaidCol
    ? database.prepare('INSERT INTO orders (order_no, artist_id, client_qq, paid_total_cents) VALUES (?, ?, ?, ?)')
      .run(orderNo, artistId, '2400', paid)
    : database.prepare('INSERT INTO orders (order_no, artist_id, client_qq) VALUES (?, ?, ?)')
      .run(orderNo, artistId, '2400')
  return Number(res.lastInsertRowid)
}

/** 给订单挂一条分期（status 决定是否计入已付） */
function seedInstallment(database: Database.Database, orderId: number, amount: number, status: string): void {
  database.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(orderId, '分期', 0, amount, 0, status)
}

const paidTotal = (database: Database.Database, orderId: number): number | null =>
  (database.prepare('SELECT paid_total_cents AS p FROM orders WHERE id = ?').get(orderId) as { p: number | null }).p

/** 按订单号取 id */
const idsByNo = (database: Database.Database): Record<string, number> =>
  Object.fromEntries((database.prepare('SELECT id, order_no FROM orders').all() as Array<{ id: number; order_no: string }>)
    .map(r => [r.order_no, r.id]))

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
    const mem = preTargetDb(24, d => {
      revertToV23(d)
      const o1 = seedOrder(d, 'O-1', null)
      const o2 = seedOrder(d, 'O-2', null)
      seedOrder(d, 'O-3', null) // 无分期
      seedInstallment(d, o1, 1000, 'paid')
      seedInstallment(d, o1, 2000, 'paid')
      seedInstallment(d, o1, 5000, 'unpaid')
      seedInstallment(d, o2, 4000, 'unpaid')
    })
    try {
      expect(isApplied(mem, 24), 'v24 版本行应由调度器写入').toBe(true)
      const byNo = idsByNo(mem)
      expect(paidTotal(mem, byNo['O-1'])).toBe(3000) // 已付分期 1000+2000
      expect(paidTotal(mem, byNo['O-2'])).toBe(0)    // 仅未付分期
      expect(paidTotal(mem, byNo['O-3'])).toBe(0)    // 无分期
      // 收款流水表建好
      expect(tableExists(mem, 'order_payments')).toBe(true)
      // 幂等重跑：值不变（真实入口：调度器重放 v24）
      mem.prepare('DELETE FROM schema_migrations WHERE version = 24').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(isApplied(mem, 24)).toBe(true)
      expect(paidTotal(mem, byNo['O-1'])).toBe(3000)
    } finally {
      mem.close()
    }
  })

  it('TC-F77-02: 修复重放不覆盖——流水维护过的金额保持原值（F0077 核心）', () => {
    const mem = preTargetDb(24, d => {
      revertToV24HalfApplied(d)
      // o1: 分期和 3000，v24 后 addPayment 又收 3000 → 6000；旧实现重放会冲回 3000
      const o1 = seedOrder(d, 'O-1', 6000)
      // o2: 纯手工收款（无任何分期）；旧实现重放会冲回 0
      seedOrder(d, 'O-2', 700)
      // o3: 从未换算过的基线 0 行（有已付分期）
      const o3 = seedOrder(d, 'O-3', 0)
      // o4: 显式 NULL 基线（COALESCE 按「从未写过」处理）
      const o4 = seedOrder(d, 'O-4', null)
      seedInstallment(d, o1, 1000, 'paid')
      seedInstallment(d, o1, 2000, 'paid')
      seedInstallment(d, o3, 3000, 'paid')
      seedInstallment(d, o4, 900, 'paid')
    })
    try {
      expect(isApplied(mem, 24), 'v24 版本行应由调度器写入').toBe(true)
      const byNo = idsByNo(mem)
      expect(paidTotal(mem, byNo['O-1'])).toBe(6000) // 原值校验拦下：已由流水维护，不再覆盖
      expect(paidTotal(mem, byNo['O-2'])).toBe(700)  // EXISTS 拦下：无已付分期，非目标行
      expect(paidTotal(mem, byNo['O-3'])).toBe(3000) // 基线行照常换算
      expect(paidTotal(mem, byNo['O-4'])).toBe(900)  // NULL 视作基线，照常换算
    } finally {
      mem.close()
    }
  })

  it('TC-F77-02b: 全额退款归零订单重放不复活金额（SVR-01 组合用例）', () => {
    // 复现：旧形态库 → 分期 1000+2000 回填 3000 → 流水收 3000 到 6000 → 退款到 0
    // → 版本表丢失后重放 v24 → 归零金额不得被旧分期和「复活」回 3000。
    const mem = preTargetDb(24, d => {
      revertToV24HalfApplied(d)
      const o1 = seedOrder(d, 'O-1', 0)
      seedInstallment(d, o1, 1000, 'paid')
      seedInstallment(d, o1, 2000, 'paid')
    })
    try {
      expect(isApplied(mem, 24)).toBe(true)
      const o1 = idsByNo(mem)['O-1']
      // 首跑：order_payments 建立且为空，基线订单照常回填到分期和 3000
      expect(paidTotal(mem, o1)).toBe(3000)

      // 流水接管：addPayment +3000（→6000），随后全额退款 -6000（→0），两笔都落 order_payments
      const insPay = mem.prepare('INSERT INTO order_payments (order_id, amount_cents, note) VALUES (?, ?, ?)')
      insPay.run(o1, 3000, '收款')
      mem.prepare('UPDATE orders SET paid_total_cents = 6000 WHERE id = ?').run(o1)
      insPay.run(o1, -6000, '全额退款')
      mem.prepare('UPDATE orders SET paid_total_cents = 0 WHERE id = ?').run(o1)
      expect(paidTotal(mem, o1)).toBe(0)

      // 重放 v24（模拟版本表丢失修复）：NOT EXISTS(order_payments) 哨兵拦下，归零金额不复活
      mem.prepare('DELETE FROM schema_migrations WHERE version = 24').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(paidTotal(mem, o1)).toBe(0)
    } finally {
      mem.close()
    }
  })

  it('TC-F77-03: 新形态库（v52 已退役 status 列）——不触发换算，只补列', () => {
    const mem = preTargetDb(24, d => {
      revertToV23(d)
      // 覆盖成「新形态」：v24 换算守卫要的是「无 status 列」
      dropColumnIfExists(d, 'order_payment_installments', 'status')
      if (columnNames(d, 'order_payment_installments').includes('status')) {
        throw new Error('夹具错误：新形态下分期表不应有 status 列')
      }
      const o1 = seedOrder(d, 'O-1', null)
      d.prepare('INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)')
        .run(o1, '分期', 0, 1000, 0)
    })
    try {
      expect(isApplied(mem, 24)).toBe(true)
      // 列补齐 + 基线 0；无 status 列不换算
      expect(columnNames(mem, 'orders')).toContain('paid_total_cents')
      expect(paidTotal(mem, idsByNo(mem)['O-1'])).toBe(0)
    } finally {
      mem.close()
    }
  })

  it('TC-F77-04 (PR114 MINOR-10): 非零但欠回填的存量行重放时补齐，流水维护过的超额行不受影响', () => {
    const mem = preTargetDb(24, d => {
      revertToV24HalfApplied(d)
      // o1: 欠回填——首跑只算了已付 1000，后来第二期转 paid，重放应从 1000 补到 3000
      const o1 = seedOrder(d, 'O-1', 1000)
      // o2: 流水维护过的超额值 6000（分期和 3000）——不得被放宽后的判据冲回
      const o2 = seedOrder(d, 'O-2', 6000)
      seedInstallment(d, o1, 1000, 'paid')
      seedInstallment(d, o1, 2000, 'paid')
      seedInstallment(d, o2, 1000, 'paid')
      seedInstallment(d, o2, 2000, 'paid')
    })
    try {
      expect(isApplied(mem, 24)).toBe(true)
      const byNo = idsByNo(mem)
      expect(paidTotal(mem, byNo['O-1'])).toBe(3000)
      expect(paidTotal(mem, byNo['O-2'])).toBe(6000)
      // 幂等重跑不漂移
      mem.prepare('DELETE FROM schema_migrations WHERE version = 24').run()
      expect(() => initDatabase(mem)).not.toThrow()
      expect(paidTotal(mem, byNo['O-1'])).toBe(3000)
      expect(paidTotal(mem, byNo['O-2'])).toBe(6000)
    } finally {
      mem.close()
    }
  })
})
