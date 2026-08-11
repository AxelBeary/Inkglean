import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 7,
  name: 'add_deleted_at_column',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'deleted_at')) {
      database.exec('ALTER TABLE artists ADD COLUMN deleted_at DATETIME')
    }
  }
}
