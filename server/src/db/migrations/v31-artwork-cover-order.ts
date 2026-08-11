import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 31,
    name: 'artwork_cover_order',
    up(database) {
      // v0.31: 多封面排序——cover_order 控制封面轮播顺序（0 = 未排序/非封面）
      const cols = database.prepare('PRAGMA table_info(artworks)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'cover_order')) {
        database.exec('ALTER TABLE artworks ADD COLUMN cover_order INTEGER DEFAULT 0')
      }
      // 存量封面补编号：按 id 升序（先设的排前面）
      database.exec(`
        UPDATE artworks SET cover_order = (
          SELECT COUNT(*) FROM artworks a2
          WHERE a2.artist_id = artworks.artist_id AND a2.is_cover = 1 AND a2.id <= artworks.id
        ) WHERE is_cover = 1 AND cover_order = 0
      `)
    }
  }
