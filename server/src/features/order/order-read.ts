import db from '../../db/connection.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import type { ArtistOrderRow, OrderDetail } from '../../types/entities.js'

// ============================================
// 订单服务 - 只读查询子域（从 order.service.ts 拆出）
// ============================================

/**
 * 获取单个订单（含关联数据）
 * R18: clientOnly=true 时 references 只返回 source='client'（客户查询页不泄露画师图）
 */
export function getOrder(orderId: number, { clientOnly = false }: { clientOnly?: boolean } = {}): OrderDetail | null {
  // SPEC-PRICE-2：tier_* 字段名保留（前端过渡），内容 = 画风/尺寸标签、尺寸基础价、尺寸工期
  const order = db.prepare(`
    SELECT o.*, a.name as artist_name, a.subdomain as artist_subdomain,
           (ast.name || ' / ' || ss.name) as tier_name, ss.base_price as tier_price, ss.work_days as tier_work_days
    FROM orders o
    JOIN artists a ON o.artist_id = a.id
    LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
    LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
    WHERE o.id = ?
  `).get(orderId) as OrderDetail | undefined

  if (!order) return null

  const references = db.prepare("SELECT id, order_id, file_path, original_name, source FROM order_references WHERE order_id = ? AND source = 'client'").all(orderId) as Array<{ id: number; order_id: number; file_path: string; original_name: string | null; source: string }>
  const referencesAll = db.prepare('SELECT id, order_id, file_path, original_name, source FROM order_references WHERE order_id = ?').all(orderId) as Array<{ id: number; order_id: number; file_path: string; original_name: string | null; source: string }>
  order.references = clientOnly ? references : referencesAll
  order.notes = db.prepare('SELECT id, order_id, content, created_by, image_path, created_at FROM order_notes WHERE order_id = ? ORDER BY created_at ASC').all(orderId) as Array<{ id: number; order_id: number; content: string; created_by: string; image_path: string | null; created_at: string }>
  order.deliverables = db.prepare('SELECT id, order_id, file_path, original_name, file_size, created_at FROM deliverables WHERE order_id = ?').all(orderId) as Array<{ id: number; order_id: number; file_path: string; original_name: string | null; file_size: number | null; created_at: string }>
  // SPEC-003: 附加工作项
  order.extraItems = db.prepare('SELECT id, order_id, name, description, price_cents, created_at FROM order_extra_items WHERE order_id = ? ORDER BY created_at ASC').all(orderId) as Array<{ id: number; order_id: number; name: string; description: string | null; price_cents: number; created_at: string }>

  return order
}

/**
 * 根据订单号查询
 * R18: clientOnly 透传给 getOrder（客户查询页只看客户图）
 */
export function getOrderByNo(orderNo: string, { clientOnly = false }: { clientOnly?: boolean } = {}): OrderDetail | null {
  const row = db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo) as { id: number } | undefined
  if (!row) return null
  return getOrder(row.id, { clientOnly })
}

/**
 * 获取画师的订单列表（支持状态筛选 + 关键字搜索 + 分页）
 */
export function getArtistOrders(artistId: number, status: string | undefined, { page = 1, pageSize = 50, q }: { page?: number; pageSize?: number; q?: string } = {}): { items: ArtistOrderRow[]; total: number; page: number; pageSize: number } {
  let where = 'WHERE o.artist_id = ?'
  const params: Array<string | number> = [artistId]
  if (status) {
    where += ' AND o.status = ?'
    params.push(status)
  }
  // REQ-020 F1: 关键字搜索（客户昵称、QQ号、订单号、画风/尺寸名）
  if (q && q.trim()) {
    where += ' AND (o.client_name LIKE ? OR o.client_qq LIKE ? OR o.order_no LIKE ? OR ast.name LIKE ? OR ss.name LIKE ?)'
    const like = `%${q.trim()}%`
    params.push(like, like, like, like, like)
  }

  const total = (db.prepare(`
    SELECT COUNT(*) as c FROM orders o
    LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
    LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
    ${where}
  `).get(...params) as { c: number }).c

  const offset = (Math.max(1, page) - 1) * pageSize
  const items = db.prepare(`
    SELECT o.*, (ast.name || ' / ' || ss.name) as tier_name, ss.base_price as tier_price
    FROM orders o
    LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
    LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as ArtistOrderRow[]

  return { items, total, page, pageSize }
}

/**
 * 客户查询排队位置（需同时提供订单号和QQ号验证身份）
 * R18: clientOnly=true，客户只看自己上传的参考图
 */
export function getClientQueuePosition(orderNo: string, clientQq: string): { order: OrderDetail; description: string | null; references: Array<{ file_path: string; original_name?: string | null }>; position: number | null; total: number | null } | null {
  const order = getOrderByNo(orderNo, { clientOnly: true })
  if (!order) return null

  // QQ 号不匹配 → 视为不存在（防枚举）
  if (order.client_qq !== clientQq) return null

  // U1: 客户回顾需求描述 + 参考图（getOrder 的 clientOnly 已过滤 source='client'）
  const base = {
    order,
    description: order.description ?? null,
    references: order.references || []
  }

  if (['delivered', 'cancelled'].includes(order.status)) {
    return { ...base, position: null, total: null }
  }

  // 内联活跃队列查询（避免循环引用 order-queue.service.js）
  const queue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND queue_zone = ? AND ${ACTIVE_ORDER_SQL}
    ORDER BY queue_position ASC
  `).all(order.artist_id, order.queue_zone || 'formal') as Array<{ id: number }>
  const position = queue.findIndex(o => o.id === order.id) + 1

  return { ...base, position, total: queue.length }
}

/**
 * 客户凭 QQ 号查询在某画师处的所有订单（"不知道订单号"场景）
 */
export function getClientOrdersByQq(artistId: number, clientQq: string): Array<{ order_no: string; status: string; created_at: string; updated_at: string; tier_name: string | null }> {
  return db.prepare(`
    SELECT o.order_no, o.status, o.created_at, o.updated_at,
           (ast.name || ' / ' || ss.name) as tier_name
    FROM orders o
    LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
    LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
    WHERE o.artist_id = ? AND o.client_qq = ?
    ORDER BY o.id DESC
    LIMIT 20
  `).all(artistId, clientQq) as Array<{ order_no: string; status: string; created_at: string; updated_at: string; tier_name: string | null }>
}

/**
 * 检查客户QQ在某画师处是否有订单
 */
export function hasClientOrders(artistId: number, clientQq: string): boolean {
  const row = db.prepare(
    'SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND client_qq = ?'
  ).get(artistId, clientQq) as { c: number }
  return row.c > 0
}

/**
 * 读取平台配置
 */
export function getPlatformConfig(key: string): string | null {
  const row = db.prepare('SELECT value FROM platform_config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}
