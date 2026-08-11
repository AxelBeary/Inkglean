import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 32,
    name: 'discount_codes',
    up(database) {
      // v0.31 F3: 折扣码（画师可开关，默认关；全局码，v0.32 多画风后再扩展）
      database.exec(`
        CREATE TABLE IF NOT EXISTS discount_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          discount_type TEXT NOT NULL DEFAULT 'percent' CHECK(discount_type IN ('percent', 'fixed')),
          discount_value REAL NOT NULL,
          max_uses INTEGER DEFAULT NULL,
          used_count INTEGER DEFAULT 0,
          expires_at DATETIME DEFAULT NULL,
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
          UNIQUE(artist_id, code)
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_discount_codes_artist ON discount_codes(artist_id, enabled)')

      // 画师级开关（默认关）
      const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!artistCols.some(c => c.name === 'discount_enabled')) {
        database.exec('ALTER TABLE artists ADD COLUMN discount_enabled INTEGER DEFAULT 0')
      }

      // 订单记录折扣信息（审计追溯）
      const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!orderCols.some(c => c.name === 'discount_code_id')) {
        database.exec('ALTER TABLE orders ADD COLUMN discount_code_id INTEGER DEFAULT NULL')
      }
      if (!orderCols.some(c => c.name === 'discount_amount_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN discount_amount_cents INTEGER DEFAULT 0')
      }
    }
  }
