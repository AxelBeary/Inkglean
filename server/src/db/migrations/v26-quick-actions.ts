import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 26,
    name: 'quick_actions',
    up(database) {
      // v0.24-C: 快捷按钮 DB 持久化（JSON 数组）
      const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'quick_actions')) {
        database.exec('ALTER TABLE artists ADD COLUMN quick_actions TEXT DEFAULT NULL')
      }
    }
  }
