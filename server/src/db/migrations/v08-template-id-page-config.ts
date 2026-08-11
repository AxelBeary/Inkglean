import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 8,
  name: 'add_template_id_and_page_config',
  up(database) {
    const cols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'template_id')) {
      database.exec("ALTER TABLE artists ADD COLUMN template_id TEXT DEFAULT 'default'")
    }
    if (!cols.some(c => c.name === 'custom_page_path')) {
      database.exec("ALTER TABLE artists ADD COLUMN custom_page_path TEXT")
    }
  }
}
