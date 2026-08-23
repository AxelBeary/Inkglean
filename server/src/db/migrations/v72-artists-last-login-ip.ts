import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 72,
  name: 'artists_last_login_ip',
  up(database) {
    // 登录留痕批：画师上次登录来源 IP（last_login_at 已在 v61 备料，此处只补 IP 列）
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'last_login_ip')) {
      database.exec('ALTER TABLE artists ADD COLUMN last_login_ip TEXT')
    }
  }
}
