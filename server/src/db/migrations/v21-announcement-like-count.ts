import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 21,
    name: 'announcement_and_like_count',
    up(database) {
      // F3: 画师小公告（announcement + 过期时间）
      // F1: 作品点赞计数
      backupDbBeforeMigration(21)
      // artists: announcement + announcement_expires_at
      const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!artistCols.some(c => c.name === 'announcement')) {
        database.exec('ALTER TABLE artists ADD COLUMN announcement TEXT DEFAULT NULL')
      }
      if (!artistCols.some(c => c.name === 'announcement_expires_at')) {
        database.exec('ALTER TABLE artists ADD COLUMN announcement_expires_at DATETIME DEFAULT NULL')
      }
      // artworks: like_count
      const artworkCols = database.prepare('PRAGMA table_info(artworks)').all() as ColumnInfo[]
      if (!artworkCols.some(c => c.name === 'like_count')) {
        database.exec('ALTER TABLE artworks ADD COLUMN like_count INTEGER DEFAULT 0')
      }
    }
  }
