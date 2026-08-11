import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 4,
  name: 'add_token_version',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'token_version')) {
      database.exec('ALTER TABLE artists ADD COLUMN token_version INTEGER DEFAULT 1')
    }
  }
}
