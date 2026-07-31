import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { getOrder } from './order.service.js'

// ============================================
// 订单队列服务（从 order.service.js 拆出，v0.16）
// 队列查看、拖拽排序、优先级标签
// ============================================

/**
 * 获取画师的活跃队列（按 queue_position 排序）
 * N1-1: 拖拽即绝对顺序，priority 退化为纯展示标签
 */
export function getArtistQueue(artistId: number): any[] {
  return db.prepare(`
    SELECT o.*, t.name as tier_name, t.price as tier_price
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ? AND o.${ACTIVE_ORDER_SQL}
    ORDER BY o.queue_position ASC
  `).all(artistId) as any[]
}

/**
 * 拖拽排序（重写）
 * 前端传入完整的排序后 ID 数组，后端按序分配 queue_position
 * 拖拽不改变优先级，只改变同优先级内的位置
 */
export function reorderQueue(artistId: number, orderedIds: number[]): any[] {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new AppError(E.QUEUE_EMPTY)
  }

  // 校验所有 ID 属于该画师且为活跃订单
  const activeOrders = (db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}
  `).all(artistId) as Array<{ id: number }>).map(r => r.id)

  const idSet = new Set(activeOrders)
  for (const id of orderedIds) {
    if (!idSet.has(id)) throw new AppError(E.QUEUE_NOT_OWNED, 400, { id })
  }
  if (orderedIds.length !== activeOrders.length) {
    throw new AppError(E.QUEUE_LENGTH)
  }
  // 校验无重复 ID
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new AppError(E.QUEUE_DUPLICATE)
  }

  const updatePos = db.prepare('UPDATE orders SET queue_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  db.transaction(() => {
    orderedIds.forEach((id, index) => updatePos.run(index + 1, id))
  })()

  return getArtistQueue(artistId)
}

/**
 * 更新订单优先级
 * N1-1: 优先级仅作展示标签，不重排队列
 */
export function updatePriority(orderId: number, priority: string): any {
  const valid = ['high', 'medium', 'low']
  if (!valid.includes(priority)) throw new AppError(E.INVALID_PRIORITY, 400, { priority })

  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  db.prepare('UPDATE orders SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(priority, orderId)

  return getOrder(orderId)
}
