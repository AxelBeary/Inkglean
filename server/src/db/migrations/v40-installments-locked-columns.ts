import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 40,
    name: 'installments_locked_columns',
    up(database) {
      // REQ-025 第二阶段：节点锁价持久化（R4 完成/付清即锁 + 回退不解锁）
      // ALTER TABLE ADD COLUMN，无 DROP/RENAME 父表，事务内安全（对照 v38 教训：仅重建父表才事务外）
      const cols = database.prepare('PRAGMA table_info(order_payment_installments)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'locked')) {
        database.exec('ALTER TABLE order_payment_installments ADD COLUMN locked INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'locked_reason')) {
        database.exec("ALTER TABLE order_payment_installments ADD COLUMN locked_reason TEXT CHECK(locked_reason IS NULL OR locked_reason IN ('completed','paidOff','prev'))")
      }
    }
  }
