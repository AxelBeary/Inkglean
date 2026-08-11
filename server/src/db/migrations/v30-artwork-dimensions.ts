import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 30,
    name: 'artwork_dimensions',
    up(database) {
      // #15: 瀑布流零跳动——前端需预知图片宽高比，避免加载后 reflow
      const cols = database.prepare('PRAGMA table_info(artworks)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'width')) {
        database.exec('ALTER TABLE artworks ADD COLUMN width INTEGER DEFAULT NULL')
      }
      if (!cols.some(c => c.name === 'height')) {
        database.exec('ALTER TABLE artworks ADD COLUMN height INTEGER DEFAULT NULL')
      }
    }
  }
