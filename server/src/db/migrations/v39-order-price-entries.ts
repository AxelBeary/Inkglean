import { backupDbBeforeMigration } from '../migrate.js'
import type { Migration } from './types.js'

export const migration: Migration = {
    version: 39,
    name: 'order_price_entries',
    up(database) {
      // REQ-025 动态节点计价 第一阶段：价格条目账本表（总价 = Σ 条目 delta）
      // 只追加不删不改（服务层不提供 UPDATE/DELETE 路径）；纯建表，事务内安全（无 DROP/RENAME 父表）
      backupDbBeforeMigration(39)
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_price_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN (
            'base', 'manual_adjust', 'extra_item', 'discount_item',
            'refund_item', 'extra_charge_after_close', 'extra_refund_after_close'
          )),
          delta_cents INTEGER NOT NULL,
          name TEXT,
          note TEXT,
          created_by TEXT NOT NULL DEFAULT 'artist',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_price_entries_order ON order_price_entries(order_id, created_at)')
    }
  }
