import type { Migration } from './types.js'

export const migration: Migration = {
    version: 44,
    name: 'tracking_events_anon_tokens',
    up(database) {
      // REQ-033: 业务埋点——匿名凭证 + 事件表
      // 纯 CREATE TABLE + INDEX，无 ALTER/DROP，事务内安全（对照 v42）
      database.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          ts INTEGER NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          artist_id INTEGER,
          anon_id INTEGER,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name, ts)')
      database.exec(`
        CREATE TABLE IF NOT EXISTS anon_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
    }
  }
