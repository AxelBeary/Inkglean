import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 33,
    name: 'installment_paid_cents',
    up(database) {
      // v0.31 F4: 节点收款重做——每节点记录实收金额
      const instCols = database.prepare('PRAGMA table_info(order_payment_installments)').all() as ColumnInfo[]
      if (!instCols.some(c => c.name === 'paid_cents')) {
        database.exec('ALTER TABLE order_payment_installments ADD COLUMN paid_cents INTEGER DEFAULT 0')
      }
      // 收款流水关联到具体节点（可选，null = 额度池兜底）
      const payCols = database.prepare('PRAGMA table_info(order_payments)').all() as ColumnInfo[]
      if (!payCols.some(c => c.name === 'installment_id')) {
        database.exec('ALTER TABLE order_payments ADD COLUMN installment_id INTEGER DEFAULT NULL')
      }
    }
  }
