import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 9,
  name: 'price_calculator',
  up(database) {
    // ─── 增项表 ───
    database.exec(`
      CREATE TABLE IF NOT EXISTS price_addons (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id     INTEGER NOT NULL,
        category      TEXT NOT NULL CHECK(category IN (
                        'expression', 'outfit', 'background', 'weapon', 'other'
                      )),
        name          TEXT NOT NULL,
        price_type    TEXT NOT NULL DEFAULT 'fixed' CHECK(price_type IN ('fixed', 'percent')),
        price_value   REAL NOT NULL,
        select_mode   TEXT NOT NULL DEFAULT 'quantity' CHECK(select_mode IN (
                        'quantity', 'toggle', 'inquiry'
                      )),
        max_qty       INTEGER DEFAULT 5,
        description   TEXT,
        sort_order    INTEGER DEFAULT 0,
        enabled       INTEGER DEFAULT 1,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_addons_artist ON price_addons(artist_id, sort_order)')

    // ─── 增项-档位关联表 ───
    database.exec(`
      CREATE TABLE IF NOT EXISTS addon_tiers (
        addon_id  INTEGER NOT NULL,
        tier_id   INTEGER NOT NULL,
        PRIMARY KEY (addon_id, tier_id),
        FOREIGN KEY (addon_id) REFERENCES price_addons(id) ON DELETE CASCADE,
        FOREIGN KEY (tier_id) REFERENCES price_tiers(id) ON DELETE CASCADE
      )
    `)

    // ─── 倍率表 ───
    database.exec(`
      CREATE TABLE IF NOT EXISTS price_multipliers (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id     INTEGER NOT NULL,
        type          TEXT NOT NULL CHECK(type IN ('usage', 'rush')),
        name          TEXT NOT NULL,
        multiplier    REAL NOT NULL DEFAULT 1.0,
        description   TEXT,
        sort_order    INTEGER DEFAULT 0,
        enabled       INTEGER DEFAULT 1,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_multipliers_artist ON price_multipliers(artist_id, type)')

    // ─── 订单价格明细快照 ───
    database.exec(`
      CREATE TABLE IF NOT EXISTS order_price_breakdown (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id     INTEGER NOT NULL,
        item_type    TEXT NOT NULL CHECK(item_type IN ('tier', 'addon', 'usage', 'rush')),
        item_name    TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        multiplier   REAL DEFAULT 1.0,
        quantity     INTEGER DEFAULT 1,
        sort_order   INTEGER DEFAULT 0,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `)

    // ─── orders 表新增字段 ───
    const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
    if (!orderCols.some(c => c.name === 'total_price_cents')) {
      database.exec('ALTER TABLE orders ADD COLUMN total_price_cents INTEGER')
    }
    if (!orderCols.some(c => c.name === 'usage_multiplier_id')) {
      database.exec('ALTER TABLE orders ADD COLUMN usage_multiplier_id INTEGER')
    }
    if (!orderCols.some(c => c.name === 'rush_multiplier_id')) {
      database.exec('ALTER TABLE orders ADD COLUMN rush_multiplier_id INTEGER')
    }
  }
}
