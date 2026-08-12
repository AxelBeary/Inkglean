import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// v52: 退役 order_payment_installments 僵尸列 paid_cents/status/paid_at/requested_at
// （节点已收一律由 orders.paid_total_cents 顺序推导）
// setup.js import 时 initDatabase 已跑全量迁移（含 v52），以下按迁移真实产物做回读断言
describe('迁移 v52: retire_installment_paid_columns', () => {
  const tableCols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)

  it('TC-MV-08: v52 已应用且分期表列数收敛为 9', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 52'
    ).get()
    expect(applied?.version).toBe(52)
    expect(tableCols('order_payment_installments')).toHaveLength(9)
  })

  it('TC-MV-09: 四个退役列确认不存在', () => {
    const cols = tableCols('order_payment_installments')
    for (const col of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
      expect(cols).not.toContain(col)
    }
  })

  it('TC-MV-10: 幂等——重跑 initDatabase 不报错且列结构不变', () => {
    expect(() => initDatabase(db)).not.toThrow()

    const cols = tableCols('order_payment_installments')
    expect(cols).toHaveLength(9)
    for (const col of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
      expect(cols).not.toContain(col)
    }
  })
})
