import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { getOrder } from './order.service.js'
import type { ArtistOrderRow, OrderDetail } from '../../types/entities.js'

// ============================================
// 订单队列服务（从 order.service.js 拆出，v0.16）
// 队列查看、拖拽排序、优先级标签
// ============================================

/**
 * 获取画师的活跃队列（按 queue_position 排序）
 * N1-1: 拖拽即绝对顺序，priority 退化为纯展示标签
 * P0-6: 显式列清单（不再 o.*，去掉 quote_snapshot 大字段——队列 UI 不消费）；
 *       可选 limit/offset 分页，默认全量（QueueBoard 拖拽需全量，调用方按需传参）
 */
export function getArtistQueue(artistId: number, options: { limit?: number; offset?: number } = {}): ArtistOrderRow[] {
  const { limit, offset } = options
  const params: Array<string | number> = [artistId]
  let sql = `
    SELECT o.id, o.order_no, o.style_size_id, o.client_qq, o.client_name, o.description,
           o.priority, o.status, o.source, o.client_notify, o.queue_position,
           o.completed_at, o.price_snapshot, o.total_price_cents,
           o.final_price_cents,
           o.focus_image_path, o.focus_image_mode, o.current_stage_id, o.deadline,
           o.start_date, o.queue_zone, o.paid_total_cents, o.discount_code_id,
           o.discount_amount_cents, o.created_at, o.updated_at,
           -- D-1: 队列行携带 version，前端时间条拖拽两步 PUT 用旧值起步、响应新值接力
           o.version,
           (ast.name || ' / ' || ss.name) as tier_name, ss.base_price as tier_price
    FROM orders o
    LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
    LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
    WHERE o.artist_id = ? AND o.${ACTIVE_ORDER_SQL} AND o.queue_zone = 'formal'
    ORDER BY o.queue_position ASC
  `
  if (limit != null) {
    sql += ' LIMIT ?'
    params.push(limit)
  }
  if (offset != null) {
    sql += ' OFFSET ?'
    params.push(offset)
  }
  return db.prepare(sql).all(...params) as ArtistOrderRow[]
}

/**
 * 拖拽排序（重写）
 * 前端传入完整的排序后 ID 数组，后端按序分配 queue_position
 * 拖拽按绝对顺序重排队列；priority 仅为展示标签（对齐 getArtistQueue 的 N1-1 口径）
 */
export function reorderQueue(artistId: number, orderedIds: number[]): ArtistOrderRow[] {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new AppError(E.QUEUE_EMPTY)
  }

  // 校验所有 ID 属于该画师且为正式区活跃订单
    const activeOrders = (db.prepare(`
      SELECT id FROM orders
      WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL} AND queue_zone = 'formal'
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

  // F5: 批量重排同属 orders 写路径——逐行递增 version，让带 version 的写路径
  // 能感知队列变更（D-1 版本链一致性，行为其余不变）
  const updatePos = db.prepare('UPDATE orders SET queue_position = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  db.transaction(() => {
    orderedIds.forEach((id, index) => updatePos.run(index + 1, id))
  })()

  return getArtistQueue(artistId)
}

/**
 * 获取最近 N 天已交付的订单（完成区沉底显示）
 * REQ-013 #7: delivered 订单在看板最下方灰色展示，超过 N 天自动隐藏
 */
export function getCompletedQueue(artistId: number, days: number = 7): ArtistOrderRow[] {
  // SQLite 日期用空格格式（YYYY-MM-DD HH:MM:SS），ISO 的 T 致比较错误
  const cutoff = new Date(Date.now() - days * 86_400_000)
    .toISOString().replace('T', ' ').slice(0, 19)
  return db.prepare(`
    SELECT o.*, (ast.name || ' / ' || ss.name) as tier_name, ss.base_price as tier_price
    FROM orders o
    LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
    LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
    WHERE o.artist_id = ? AND o.status = 'delivered'
      AND o.updated_at >= ?
    ORDER BY o.updated_at DESC
  `).all(artistId, cutoff) as ArtistOrderRow[]
}

/**
 * 更新订单优先级
 * N1-1: 优先级仅作展示标签，不重排队列
 */
export function updatePriority(orderId: number, priority: string): OrderDetail {
  const valid = ['high', 'medium', 'low']
  if (!valid.includes(priority)) throw new AppError(E.INVALID_PRIORITY, 400, { priority })

  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // F5: 优先级写路径递增 version（对齐 reorderQueue/addPayment 相对增量写法）
  db.prepare('UPDATE orders SET priority = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(priority, orderId)

  return getOrder(orderId)!
}
