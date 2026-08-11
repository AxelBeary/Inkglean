import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 11,
  name: 'order_quote_focus_and_artist_prefs',
  up(database) {
    backupDbBeforeMigration(11)

    // ─── orders 表新增 4 字段 ───
    const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
    if (!orderCols.some(c => c.name === 'quote_snapshot')) {
      database.exec('ALTER TABLE orders ADD COLUMN quote_snapshot TEXT')
    }
    if (!orderCols.some(c => c.name === 'final_price_cents')) {
      database.exec('ALTER TABLE orders ADD COLUMN final_price_cents INTEGER')
    }
    if (!orderCols.some(c => c.name === 'focus_image_path')) {
      database.exec('ALTER TABLE orders ADD COLUMN focus_image_path TEXT')
    }
    if (!orderCols.some(c => c.name === 'focus_image_mode')) {
      database.exec("ALTER TABLE orders ADD COLUMN focus_image_mode TEXT DEFAULT 'off'")
    }

    // ─── artists 表新增 2 字段 ───
    const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!artistCols.some(c => c.name === 'dashboard_default_panel')) {
      database.exec('ALTER TABLE artists ADD COLUMN dashboard_default_panel TEXT')
    }
    if (!artistCols.some(c => c.name === 'revision_note')) {
      database.exec('ALTER TABLE artists ADD COLUMN revision_note TEXT')
    }
  }
}
