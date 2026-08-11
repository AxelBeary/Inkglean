import type { Migration } from './types.js'

export const migration: Migration = {
    version: 47,
    name: 'standalone_incomes',
    up(database) {
      // REQ-035 批C: 散单收入记账（不走订单流程，只记钱）
      database.exec(`
        CREATE TABLE IF NOT EXISTS standalone_incomes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          client_name TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          income_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_standalone_incomes_artist_date ON standalone_incomes(artist_id, income_date);
      `)
    }
  }
