import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 41,
    name: 'totp_login',
    up(database) {
      // REQ-027：TOTP 动态口令登录
      // 1) artists 加 TOTP 绑定/防爆破列（ADD COLUMN 事务内安全，对照 v40）
      // 2) R7 一刀切：移除旧登录码表（DROP 子表 login_codes 不触发父表 CASCADE，对照 v38 教训：仅 DROP/RENAME 父表才事务外）
      const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'totp_secret')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_secret TEXT')
      }
      if (!cols.some(c => c.name === 'totp_verified')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_verified INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'totp_failed_attempts')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_failed_attempts INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'totp_locked_until')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_locked_until INTEGER')
      }
      database.exec('DROP TABLE IF EXISTS login_codes')
    }
  }
