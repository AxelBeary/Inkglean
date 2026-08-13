import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 62,
  name: 'artworks_source_deliverable_id',
  up(database) {
    // F7: 发布作品幂等——artworks.source_deliverable_id 记录「该作品来自哪条交付物」，
    // 部分唯一索引实现一图一作品的发布源唯一：历史数据/普通上传为 NULL 不受约束，
    // 已发布的 deliverable 再次发布由唯一索引兜底（并发双发走幂等回查，不产生重复行）。
    const cols = database.prepare('PRAGMA table_info(artworks)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'source_deliverable_id')) {
      database.exec('ALTER TABLE artworks ADD COLUMN source_deliverable_id INTEGER')
    }
    database.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_artworks_source_deliverable ON artworks(source_deliverable_id) WHERE source_deliverable_id IS NOT NULL'
    )
  }
}
