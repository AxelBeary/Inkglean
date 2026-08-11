import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 15,
  name: 'accent_color_and_deadline',
  up(database) {
    // R49: 画师强调色（5 色白名单 + null，service 层校验）
    const artistCols = database.prepare('PRAGMA table_info(artists)').all() as ColumnInfo[]
    if (!artistCols.some(c => c.name === 'accent_color')) {
      database.exec('ALTER TABLE artists ADD COLUMN accent_color TEXT DEFAULT NULL')
    }
    // R51: 订单截稿日
    const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
    if (!orderCols.some(c => c.name === 'deadline')) {
      database.exec('ALTER TABLE orders ADD COLUMN deadline DATETIME DEFAULT NULL')
    }
  }
}
