import type { Migration } from './types.js'

export const migration: Migration = {
  version: 58,
  name: 'invite_codes',
  up(database) {
    // REQ-039: 邀请码注册机制（v58）
    // 一次性邀请码：unused → used（注册消费）/ revoked（管理员吊销）；
    // expires_at 为 ISO 8601 文本，service 层按 JS Date 比较（与 discount_codes 同口径）
    database.exec(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused', 'used', 'revoked')),
        expires_at TEXT NOT NULL,
        created_by INTEGER,
        used_by_artist_id INTEGER NULL,
        used_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    // B3-F0088：删除冗余的 idx_invite_codes_code——code 列已 UNIQUE，SQLite 为其自动建
    // sqlite_autoindex，再建普通索引纯属重复占空间；原注释称「供 status 过滤」也不成立（status 索引另建）。
    // 仅保留 status 列表索引；按码校验走 UNIQUE 自动索引，service 层 validateInviteCode 无性能变化。
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_invite_codes_status ON invite_codes(status);
    `)
  }
}
