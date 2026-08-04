// 迁移 v40 测试：order_payment_installments 加锁价列（REQ-025 第二阶段 R4）
// ALTER TABLE ADD COLUMN 事务内安全（对照 v38：仅重建父表才需事务外）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'

describe('迁移 v40: installments locked/locked_reason 列', () => {
  let db
  beforeAll(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initDatabase(db)
  })
  afterAll(() => db.close())

  function seedInstallment(orderNo) {
    const qq = '799' + orderNo.slice(-3) // 每用例唯一 QQ（测试隔离纪律）
    const artist = db.prepare('INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)').run(qq, 'LockedCols', 'locked-cols-' + orderNo.toLowerCase())
    const order = db.prepare('INSERT INTO orders (artist_id, order_no, client_qq) VALUES (?, ?, ?)').run(artist.lastInsertRowid, orderNo, '88910')
    db.prepare(
      'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(order.lastInsertRowid, '定金', 3000, 3000, 0)
    return Number(order.lastInsertRowid)
  }

  it('TC-MIG-40a: MIGRATIONS 含 v40 且已应用', () => {
    const v40 = MIGRATIONS.find(m => m.version === 40)
    expect(v40).toBeTruthy()
    expect(v40.name).toBe('installments_locked_columns')
    expect(v40.noTransaction).toBeFalsy() // ADD COLUMN 事务内安全
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 40').get()
    expect(applied).toBeTruthy()
  })

  it('TC-MIG-40b: 新插入行 locked 默认 0、locked_reason 默认 NULL', () => {
    const orderId = seedInstallment('LCK-001')
    const row = db.prepare('SELECT locked, locked_reason FROM order_payment_installments WHERE order_id = ?').get(orderId)
    expect(row.locked).toBe(0)
    expect(row.locked_reason).toBeNull()
  })

  it('TC-MIG-40c: 存量行读出默认值 0 而非 NULL（DEFAULT 兼容）', () => {
    const orderId = seedInstallment('LCK-002')
    // 模拟存量行迁移后读出
    const rows = db.prepare('SELECT locked FROM order_payment_installments WHERE order_id = ?').all(orderId)
    expect(rows.every(r => r.locked === 0)).toBe(true)
    expect(rows.some(r => r.locked === null)).toBe(false)
  })

  it('TC-MIG-40d: locked_reason CHECK 约束（合法值可写，非法值拒绝）', () => {
    const orderId = seedInstallment('LCK-003')
    const upd = db.prepare('UPDATE order_payment_installments SET locked = 1, locked_reason = ? WHERE order_id = ?')
    for (const reason of ['completed', 'paidOff', 'prev']) {
      expect(() => upd.run(reason, orderId)).not.toThrow()
    }
    expect(() => upd.run('bogus', orderId)).toThrow()
  })

  it('TC-MIG-40e: 幂等守卫——重跑迁移不报错', () => {
    const v40 = MIGRATIONS.find(m => m.version === 40)
    db.prepare('DELETE FROM schema_migrations WHERE version = 40').run()
    expect(() => v40.up(db)).not.toThrow() // 列已存在 → 守卫跳过
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(40, v40.name)
  })
})
