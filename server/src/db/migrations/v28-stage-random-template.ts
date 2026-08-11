import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 28,
    name: 'stage_random_template',
    up(database) {
      // v0.25 #8: 多模板随机（节点话术随机选择开关）
      const cols = database.prepare('PRAGMA table_info(artist_workflow_stages)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'random_template')) {
        database.exec('ALTER TABLE artist_workflow_stages ADD COLUMN random_template INTEGER DEFAULT 0')
      }
    }
  }
