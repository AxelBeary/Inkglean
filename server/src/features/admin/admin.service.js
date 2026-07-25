import db from '../../db/connection.js'

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
    "SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('delivered', 'cancelled')"
  ).get().c

  return { artistCount, orderCount, activeOrders }
}
