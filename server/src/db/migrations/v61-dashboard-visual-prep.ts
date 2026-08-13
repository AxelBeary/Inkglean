import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 61,
  name: 'dashboard_visual_prep',
  up(database) {
    // 视觉批备料：仪表盘视觉批所需画师字段
    // last_login_at / last_greeting_shown_at 可空文本时间戳；
    // dashboard_modules 为 JSON 文本，NULL = 全部模块显示
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'last_login_at')) {
      database.exec('ALTER TABLE artists ADD COLUMN last_login_at TEXT')
    }
    if (!cols.some(c => c.name === 'last_greeting_shown_at')) {
      database.exec('ALTER TABLE artists ADD COLUMN last_greeting_shown_at TEXT')
    }
    if (!cols.some(c => c.name === 'dashboard_modules')) {
      database.exec('ALTER TABLE artists ADD COLUMN dashboard_modules TEXT DEFAULT NULL')
    }
  }
}
