import db from '../../db/connection.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'

// ============================================
// 管理员服务 - 全局统计查询
// ============================================

/**
 * 系统全局统计数据
 */
export function getGlobalStats() {
  const artistCount = db.prepare('SELECT COUNT(*) as c FROM artists').get().c
  const orderCount = db.prepare('SELECT COUNT(*) as c FROM orders').get().c
  const activeOrders = db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE ${ACTIVE_ORDER_SQL}`
  ).get().c

  return { artistCount, orderCount, activeOrders }
}
