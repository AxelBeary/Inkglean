import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import db from '../../db/connection.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import type { ArtistOrderRow, OrderDetail } from '../../types/entities.js'

// ============================================
// 订单服务 - 只读查询子域（从 order.service.ts 拆出）
// ============================================

// ─── F1 围剿：客户访问令牌工具 ───
// 放在 order-read.ts 的原因：order-create.ts 已依赖本模块（getOrder），
// 把工具放这里可避免新增模块/循环依赖；生成/校验语义都围绕「客户访问」。
// 订单号 CODE-xxx 保持人类友好，安全由 144bit 高熵令牌承担（用户拍板）。

/** 生成客户访问令牌：crypto 强随机 18 字节 → base64url（熵 144bit） */
export function generateCustomerToken(): string {
  return randomBytes(18).toString('base64url')
}

/** 令牌 → sha256 hex（库中只存哈希，不存明文） */
export function hashCustomerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** 追踪页 URL 片段（完整路径，前端拼 origin 后可展示/扫码/复制） */
export function buildCustomerTrackUrl(subdomain: string, orderNo: string, token: string): string {
  return `/artist/${encodeURIComponent(subdomain)}/track?no=${encodeURIComponent(orderNo)}&token=${encodeURIComponent(token)}`
}

/**
 * 客户令牌校验：订单号 + token → 订单（clientOnly 视图）
 * 常量时间比较（timingSafeEqual）；不存在/缺令牌/哈希不符一律返回 null，
 * 路由层统一 404 ORDER_NOT_FOUND——不暴露订单存在性。
 */
export function getClientOrderByToken(orderNo: string, customerToken: string | undefined | null): OrderDetail | null {
  if (typeof customerToken !== 'string' || !customerToken) return null
  const row = db.prepare(
    'SELECT customer_token_hash FROM orders WHERE order_no = ?'
  ).get(orderNo) as { customer_token_hash: string | null } | undefined
  if (!row?.customer_token_hash) return null

  const provided = Buffer.from(hashCustomerToken(customerToken), 'hex')
  const stored = Buffer.from(row.customer_token_hash, 'hex')
  // timingSafeEqual 要求等长；不等长直接视为不符（同样返回 null）
  if (provided.length === 0 || provided.length !== stored.length) return null
  return timingSafeEqual(provided, stored)
    ? getOrderByNo(orderNo, { clientOnly: true })
    : null
}

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
  order.deliverables = db.prepare('SELECT id, order_id, file_path, original_name, file_size, created_at, download_locked FROM deliverables WHERE order_id = ?').all(orderId) as Array<{ id: number; order_id: number; file_path: string; original_name: string | null; file_size: number | null; created_at: string; download_locked: number }>
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
 * 客户查询排队位置（F1 围剿：需订单号 + 高熵客户令牌验证身份）
 * R18: clientOnly=true，客户只看自己上传的参考图
 */
export function getClientQueuePosition(orderNo: string, customerToken: string): { order: OrderDetail; description: string | null; references: Array<{ file_path: string; original_name?: string | null }>; position: number | null; total: number | null } | null {
  // F1 围剿：身份验证改为高熵令牌（QQ 不再作为查询凭据）
  const order = getClientOrderByToken(orderNo, customerToken)
  if (!order) return null

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
 * 读取平台配置
 */
export function getPlatformConfig(key: string): string | null {
  const row = db.prepare('SELECT value FROM platform_config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}
