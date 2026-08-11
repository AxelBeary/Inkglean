import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 34,
    name: 'guestbook_language',
    up(database) {
      // v0.31 REQ-021 F8 前置：留言记录语言（后端写入，不靠前端检测）
      const cols = database.prepare('PRAGMA table_info(guestbook_messages)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'language')) {
        database.exec("ALTER TABLE guestbook_messages ADD COLUMN language TEXT DEFAULT 'zh-CN'")
      }
    }
  }
