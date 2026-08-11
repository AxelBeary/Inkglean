import type { Migration } from './types.js'

export const migration: Migration = {
    version: 35,
    name: 'order_activity_logs',
    up(database) {
      // v0.31 REQ-021 F1: 操作日志（永久保留，不清理）
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          action_type TEXT NOT NULL CHECK(action_type IN (
            'status_change', 'price_change', 'extra_item', 'payment', 'stage_advance', 'note_update'
          )),
          actor TEXT NOT NULL DEFAULT 'artist',
          detail_json TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_activity_logs_order ON order_activity_logs(order_id, created_at)')
    }
  }
