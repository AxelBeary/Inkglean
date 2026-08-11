import { backupDbBeforeMigration } from '../migrate.js'
import type { Migration } from './types.js'

export const migration: Migration = {
    version: 18,
    name: 'order_extra_items',
    up(database) {
      // SPEC-003: 订单附加工作项（下单后追加需求）
      backupDbBeforeMigration(18)
      // 纯新表，无 ALTER TABLE，无存量数据影响
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_extra_items (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id     INTEGER NOT NULL,
          name         TEXT    NOT NULL,
          description  TEXT,
          price_cents  INTEGER NOT NULL DEFAULT 0,
          created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_extra_items_order ON order_extra_items(order_id)')
    }
  }
