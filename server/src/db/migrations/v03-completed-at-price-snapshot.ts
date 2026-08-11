import type { ColumnInfo, Migration } from './types.js'

export const migration: Migration = {
  version: 3,
  name: 'add_completed_at_and_price_snapshot',
  up(database) {
    const orderCols = database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]
    if (!orderCols.some(c => c.name === 'completed_at')) {
      database.exec('ALTER TABLE orders ADD COLUMN completed_at DATETIME')
    }
    if (!orderCols.some(c => c.name === 'price_snapshot')) {
      database.exec('ALTER TABLE orders ADD COLUMN price_snapshot REAL')
    }
    // 回填已有的 done/delivered 订单的 completed_at
    database.exec("UPDATE orders SET completed_at = updated_at WHERE status IN ('done', 'delivered') AND completed_at IS NULL")
    // 回填已有的 price_snapshot（形状感知守卫：新库基线已无 tier_id 列（SPEC-PRICE-2 v50），跳过）
    if (orderCols.some(c => c.name === 'tier_id')) {
      database.exec(`UPDATE orders SET price_snapshot = (
        SELECT t.price FROM price_tiers t WHERE t.id = orders.tier_id
      ) WHERE price_snapshot IS NULL AND tier_id IS NOT NULL`)
    }
  }
}
