import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 10,
  name: 'add_palette_id_column',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'palette_id')) {
      database.exec("ALTER TABLE artists ADD COLUMN palette_id TEXT DEFAULT 'paper'")
    }
  }
}
