import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 59,
  name: 'req042_compliance',
  up(database) {
    // REQ-042 合规与内容安全：单迁移合并两事项（举报表 + 处理留痕表 + 画师封禁独立态）
    // 举报表：先发后审机制的事实源（匿名可提交，管理员处理后落 resolved）
    database.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL CHECK(target_type IN ('artist_home', 'artwork', 'message', 'other')),
        target_id INTEGER NULL,
        description TEXT NOT NULL,
        contact TEXT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
        resolved_by INTEGER NULL,
        resolved_at TEXT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    `)

    // 处理留痕表：下架/封禁/举报处理全部登记（admin_id 必填，reason 可选）
    database.exec(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER NULL,
        reason TEXT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_type, target_id);
    `)

    // 封禁独立态：不动 status 三态（open/full/break/hidden），1=封禁
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'is_banned')) {
      database.exec('ALTER TABLE artists ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0')
    }
  }
}
