import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 25,
    name: 'tier_visibility',
    up(database) {
      // v0.24 #10: 档位三态（visible/showcase/hidden）
      const cols = database.prepare('PRAGMA table_info(price_tiers)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'visibility')) {
        database.exec("ALTER TABLE price_tiers ADD COLUMN visibility TEXT DEFAULT 'visible'")
      }
    }
  }
