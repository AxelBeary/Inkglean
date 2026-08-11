import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 2,
  name: 'add_contact_qq_column',
  up(database) {
    const columns = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!columns.some(c => c.name === 'contact_qq')) {
      database.exec('ALTER TABLE artists ADD COLUMN contact_qq TEXT')
    }
  }
}
