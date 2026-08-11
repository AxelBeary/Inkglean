import { backupDbBeforeMigration, migrateF5OldModelArtists } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 37,
    name: 'style_unify_sizes_artwork_tags_f5',
    up(database) {
      // REQ-024 画风档位统一（F1/F2/F5/F6 数据层，一次建全避免二次迁移）
      backupDbBeforeMigration(37)

      // ─── 1. style_sizes: 尺寸带图/描述/天数（F1） ───
      // image: 独立上传路径；image_artwork_id: 从作品集挑（删作品自动置空）
      const sizeCols = database.prepare('PRAGMA table_info(style_sizes)').all() as ColumnInfo[]
      if (!sizeCols.some(c => c.name === 'image')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN image TEXT DEFAULT NULL')
      }
      if (!sizeCols.some(c => c.name === 'image_artwork_id')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN image_artwork_id INTEGER DEFAULT NULL REFERENCES artworks(id) ON DELETE SET NULL')
      }
      if (!sizeCols.some(c => c.name === 'description')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN description TEXT DEFAULT NULL')
      }
      if (!sizeCols.some(c => c.name === 'work_days')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN work_days INTEGER DEFAULT NULL')
      }

      // ─── 2. artists: 多画风开关（F2，默认关） ───
      const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!artistCols.some(c => c.name === 'multi_style_enabled')) {
        database.exec('ALTER TABLE artists ADD COLUMN multi_style_enabled INTEGER DEFAULT 0')
      }

      // ─── 3. artworks: 自由描述（F6） ───
      const artworkCols = database.prepare('PRAGMA table_info(artworks)').all() as ColumnInfo[]
      if (!artworkCols.some(c => c.name === 'description')) {
        database.exec('ALTER TABLE artworks ADD COLUMN description TEXT DEFAULT NULL')
      }

      // ─── 4. artwork_size_tags: 作品↔尺寸多对多标注（F6，双向 CASCADE） ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS artwork_size_tags (
          artwork_id INTEGER NOT NULL,
          style_size_id INTEGER NOT NULL,
          PRIMARY KEY (artwork_id, style_size_id),
          FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
          FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_artwork_size_tags_size ON artwork_size_tags(style_size_id)')

      // ─── 5. F5: 旧模型画师迁移（showcase/hidden 丢弃——用户拍板） ───
      migrateF5OldModelArtists(database)
    }
  }
