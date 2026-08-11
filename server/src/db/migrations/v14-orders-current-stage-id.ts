import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 14,
  name: 'orders_current_stage_id',
  up(database) {
    // R30d: 订单接入自定义工作流 — 新增 current_stage_id 列
    const cols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
    if (!cols.some(c => c.name === 'current_stage_id')) {
      database.exec('ALTER TABLE orders ADD COLUMN current_stage_id INTEGER')
    }
  }
}
