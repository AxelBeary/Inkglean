import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 1,
  name: 'add_artist_code_column',
  up(database) {
    const columns = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!columns.some(c => c.name === 'artist_code')) {
      database.exec('ALTER TABLE artists ADD COLUMN artist_code TEXT')
      database.exec("UPDATE artists SET artist_code = UPPER(subdomain) WHERE artist_code IS NULL")
    }
    // 数据完整性：先删除可能被 schema 旧版创建的同名非唯一索引，再建唯一索引
    database.exec('DROP INDEX IF EXISTS idx_artists_code')
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS uniq_artists_code ON artists(artist_code)')
  }
}
