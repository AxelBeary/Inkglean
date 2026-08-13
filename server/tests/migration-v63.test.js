import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// v63: F1 围剿——orders 新增 customer_token_hash（sha256 hex，不存明文）
// setup.js import 时 initDatabase 已跑全量迁移（含 v63），以下按迁移真实产物做回读断言
describe('迁移 v63: orders_customer_token', () => {
  it('TC-MV63-01: v63 已应用且 customer_token_hash 列存在', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 63'
    ).get()
    expect(applied?.version).toBe(63)
    const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name)
    expect(cols).toContain('customer_token_hash')
  })

  it('TC-MV63-02: 幂等——重跑 initDatabase 不抛错且列结构不变', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name)
    expect(cols).toContain('customer_token_hash')
  })
})
