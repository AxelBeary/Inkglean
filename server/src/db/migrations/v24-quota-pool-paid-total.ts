import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 24,
    name: 'quota_pool_paid_total',
    up(database) {
      // B7: 额度池 — orders.paid_total_cents + order_payments 表 + 存量换算
      backupDbBeforeMigration(24, database)
      // 1. orders 加 paid_total_cents
      const cols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'paid_total_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN paid_total_cents INTEGER DEFAULT 0')
      }
      // 2. 存量换算：已付分期 SUM → paid_total_cents
      // 守卫（批4B）：新形态库已退役 status 节点列（v52），空表无存量，换算自然不适用；
      // 仅旧形态库（含 status 列）照常执行。探测风格与第 1 步一致：PRAGMA table_info
      const instCols = database.prepare('PRAGMA table_info(order_payment_installments)').all() as ColumnInfo[]
      if (instCols.some(c => c.name === 'status')) {
        database.exec(`
          UPDATE orders SET paid_total_cents = (
            SELECT COALESCE(SUM(amount_cents), 0)
            FROM order_payment_installments
            WHERE order_id = orders.id AND status = 'paid'
          )
        `)
      }
      // 3. 收款流水表
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          amount_cents INTEGER NOT NULL,
          note TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT DEFAULT 'artist',
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id)')
    }
  }
