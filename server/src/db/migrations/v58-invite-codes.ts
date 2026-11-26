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
    // PR114 MINOR-2：历史迁移原文恢复（不得原地改写）——已应用 v58 的老实例曾建
    // idx_invite_codes_code，迁移框架按 version 跳过，原地删 CREATE 对老实例无效，
    // 还会让新库（无该索引）与老库（有该索引）形态分叉。冗余索引的统一清理改由
    // 新迁移 v84 执行 DROP INDEX IF EXISTS idx_invite_codes_code。
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
      CREATE INDEX IF NOT EXISTS idx_invite_codes_status ON invite_codes(status);
    `)
  }
}
