import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 27,
    name: 'artwork_is_cover',
    up(database) {
      // v0.25 #5: 封面图指定（一个画师最多 1 个封面）
      const cols = database.prepare('PRAGMA table_info(artworks)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'is_cover')) {
        database.exec('ALTER TABLE artworks ADD COLUMN is_cover INTEGER DEFAULT 0')
      }
    }
  }
