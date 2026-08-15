import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 23,
    name: 'artist_monthly_quota',
    up(database) {
      // S5: 月度额度池（NULL=不限）
      backupDbBeforeMigration(23, database)
      const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!cols.some(c => c.name === 'monthly_quota')) {
        database.exec('ALTER TABLE artists ADD COLUMN monthly_quota INTEGER DEFAULT NULL')
      }
    }
  }
