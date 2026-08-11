import type { Migration } from './types.js'

export const migration: Migration = {
    version: 48,
    name: 'totp_used_codes',
    up(database) {
      // P1-1：TOTP 重放防护——已用动态码记录表（唯一索引防并发插入，与 schema 区幂等）
      database.exec(`
        CREATE TABLE IF NOT EXISTS totp_used_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          code_hash TEXT NOT NULL,
          used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (artist_id, code_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_totp_used_artist ON totp_used_codes(artist_id);
      `)
    }
  }
