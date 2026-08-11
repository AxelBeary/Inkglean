import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 13,
  name: 'login_codes_expires_at_integer',
  up(database) {
    // R35: login_codes.expires_at 列类型对齐（DATETIME → INTEGER）
    // SQLite 不支持 ALTER COLUMN，需重建表
    // 幂等：检查现有列类型，已是 INTEGER 则跳过
    const cols = database.prepare('PRAGMA table_info(login_codes)').all() as ColumnInfo[]
    const expiresCol = cols.find(c => c.name === 'expires_at')
    if (expiresCol && expiresCol.type.toUpperCase() === 'INTEGER') return // 已对齐

    // 重建表（CREATE → COPY → DROP → RENAME）
    database.exec(`
      CREATE TABLE login_codes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
      )
    `)
    database.exec(`
      INSERT INTO login_codes_new (id, artist_id, code, expires_at, attempts, created_at)
      SELECT id, artist_id, code, CAST(expires_at AS INTEGER), attempts, created_at
      FROM login_codes
    `)
    database.exec('DROP TABLE login_codes')
    database.exec('ALTER TABLE login_codes_new RENAME TO login_codes')
    database.exec('CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at)')
  }
}
