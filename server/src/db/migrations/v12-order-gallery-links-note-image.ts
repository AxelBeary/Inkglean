import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 12,
  name: 'order_gallery_links_note_image',
  up(database) {
    backupDbBeforeMigration(12)

    // R15: artists.custom_links（JSON TEXT 列）
    const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!artistCols.some(c => c.name === 'custom_links')) {
      database.exec('ALTER TABLE artists ADD COLUMN custom_links TEXT')
    }

    // R18: order_references.source（DEFAULT 'client' 兼容存量）
    const refCols = database.prepare('PRAGMA table_info(order_references)').all() as ColumnInfo[]
    if (!refCols.some(c => c.name === 'source')) {
      database.exec("ALTER TABLE order_references ADD COLUMN source TEXT DEFAULT 'client'")
    }

    // R19: order_notes.image_path
    const noteCols = database.prepare('PRAGMA table_info(order_notes)').all() as ColumnInfo[]
    if (!noteCols.some(c => c.name === 'image_path')) {
      database.exec('ALTER TABLE order_notes ADD COLUMN image_path TEXT')
    }
  }
}
