import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
    version: 19,
    name: 'batch_buffer_system',
    up(database) {
      // SPEC-004: 名额与缓冲系统
      backupDbBeforeMigration(19, database)
      // artists 表：6 个新字段
      const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
      if (!artistCols.some(c => c.name === 'batch_limit')) {
        database.exec('ALTER TABLE artists ADD COLUMN batch_limit INTEGER DEFAULT NULL')
      }
      if (!artistCols.some(c => c.name === 'buffer_limit')) {
        database.exec('ALTER TABLE artists ADD COLUMN buffer_limit INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'auto_promote')) {
        database.exec('ALTER TABLE artists ADD COLUMN auto_promote INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'hide_queue_position')) {
        database.exec('ALTER TABLE artists ADD COLUMN hide_queue_position INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'hide_promote_notify')) {
        database.exec('ALTER TABLE artists ADD COLUMN hide_promote_notify INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'buffer_short_form')) {
        database.exec('ALTER TABLE artists ADD COLUMN buffer_short_form INTEGER DEFAULT 0')
      }
      // orders 表：queue_zone
      const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
      if (!orderCols.some(c => c.name === 'queue_zone')) {
        database.exec("ALTER TABLE orders ADD COLUMN queue_zone TEXT DEFAULT 'formal'")
      }
      database.exec('CREATE INDEX IF NOT EXISTS idx_orders_queue_zone ON orders(artist_id, queue_zone)')
    }
  }
