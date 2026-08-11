import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 16,
    name: 'order_template_id',
    up(database) {
      // R58-7: 下单页多模板机制 — 画师可选下单模板
      const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'order_template_id')) {
        database.exec("ALTER TABLE artists ADD COLUMN order_template_id TEXT DEFAULT 'default'")
      }
    }
  }
