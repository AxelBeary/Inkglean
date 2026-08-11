import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 17,
    name: 'platform_urls_and_inspiration_tags',
    up(database) {
      // R58-8: 画师平台链接（JSON 数组 [{url, platform}]）
      // 灵感标签自定义（JSON 数组 [string]）
      const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'platform_urls')) {
        database.exec('ALTER TABLE artists ADD COLUMN platform_urls TEXT DEFAULT NULL')
      }
      if (!cols.some(c => c.name === 'inspiration_tags')) {
        database.exec('ALTER TABLE artists ADD COLUMN inspiration_tags TEXT DEFAULT NULL')
      }
    }
  }
