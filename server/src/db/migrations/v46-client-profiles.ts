import type { Migration } from './types.js'

export const migration: Migration = {
    version: 46,
    name: 'client_profiles',
    up(database) {
      // REQ-035 批A: 画师私有客户标记（标签+备注，挂 client_qq 维度）
      database.exec(`
        CREATE TABLE IF NOT EXISTS client_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
          client_qq TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(artist_id, client_qq)
        );
        CREATE INDEX IF NOT EXISTS idx_client_profiles_artist ON client_profiles(artist_id);
      `)
    }
  }
