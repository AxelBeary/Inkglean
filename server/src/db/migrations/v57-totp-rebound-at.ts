import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 57,
  name: 'totp_rebound_at',
  up(database) {
    // REQ-040: TOTP 自助重绑冷却期记录
    // 重绑时写入当前时间戳，24h 内禁止再次自助重绑（管理员豁免）
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'totp_rebound_at')) {
      database.exec('ALTER TABLE artists ADD COLUMN totp_rebound_at TEXT')
    }
  }
}
