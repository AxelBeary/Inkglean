import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 29,
    name: 'order_start_date',
    up(database) {
      // v0.26 B: 开工日（画师手动设定，用于截稿日自动建议 + 日历带子起点）
      const cols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'start_date')) {
        database.exec('ALTER TABLE orders ADD COLUMN start_date TEXT DEFAULT NULL')
      }
    }
  }
