import db from '../../db/connection.js'

// ============================================
// 订单服务 - 核心业务逻辑
// ============================================

/**
 * 订单状态机：定义每个状态允许转换到的下一个状态
 */
const STATUS_TRANSITIONS = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['wip', 'cancelled'],
  wip:       ['revision', 'done', 'cancelled'],
  revision:  ['wip', 'done', 'cancelled'],
  done:      ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
}

/**
 * 生成订单号：画师身份码 + 动态位数序号
 * 序号 ≤999 时补零到3位；>999 时自然增长（1000、1001…）
 * 查询范围限定为该画师，避免跨画师碰撞
 */
export function generateOrderNo(artistId, artistCode) {
  const last = db.prepare(
    "SELECT order_no FROM orders WHERE artist_id = ? ORDER BY id DESC LIMIT 1"
  ).get(artistId)

  let seq = 1
  if (last) {
    // 订单号格式: CODE-SEQ（如 ALICE-001、QY-1024）
    const dashIdx = last.order_no.lastIndexOf('-')
    if (dashIdx !== -1) {
      const num = parseInt(last.order_no.slice(dashIdx + 1), 10)
      if (!isNaN(num)) seq = num + 1
    }
  }

  // 动态位数：≤999 补零到3位，>999 自然宽度
  const seqStr = seq <= 999 ? String(seq).padStart(3, '0') : String(seq)
  return `${artistCode}-${seqStr}`
}

/**
 * 创建订单（客户自助 或 画师手动录入）
 */
export function createOrder({ artistId, tierId, clientQq, clientName, description, priority, source, clientNotify }) {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId)
  if (!artist) throw new Error('画师不存在')

  const code = artist.artist_code || artist.subdomain.toUpperCase()
  const orderNo = generateOrderNo(artistId, code)

  const maxPos = db.prepare(
    "SELECT MAX(queue_position) as max_pos FROM orders WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')"
  ).get(artistId)
  const queuePosition = (maxPos?.max_pos ?? 0) + 1

  const result = db.prepare(`
    INSERT INTO orders (order_no, artist_id, tier_id, client_qq, client_name, description, priority, status, source, client_notify, queue_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(orderNo, artistId, tierId || null, clientQq, clientName || null, description || null, priority || 'medium', source || 'self', clientNotify ? 1 : 0, queuePosition)

  return getOrder(result.lastInsertRowid)
}

/**
 * 获取单个订单（含关联数据）
 */
export function getOrder(orderId) {
  const order = db.prepare(`
    SELECT o.*, a.name as artist_name, a.subdomain as artist_subdomain, t.name as tier_name, t.price as tier_price
    FROM orders o
    JOIN artists a ON o.artist_id = a.id
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.id = ?
  `).get(orderId)

  if (!order) return null

  order.references = db.prepare('SELECT * FROM order_references WHERE order_id = ?').all(orderId)
  order.notes = db.prepare('SELECT * FROM order_notes WHERE order_id = ? ORDER BY created_at ASC').all(orderId)
  order.deliverables = db.prepare('SELECT * FROM deliverables WHERE order_id = ?').all(orderId)

  return order
}

/**
 * 根据订单号查询
 */
export function getOrderByNo(orderNo) {
  const row = db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo)
  if (!row) return null
  return getOrder(row.id)
}

/**
 * 获取画师的活跃队列（按优先级 + 位置排序）
 */
export function getArtistQueue(artistId) {
  return db.prepare(`
    SELECT o.*, t.name as tier_name, t.price as tier_price
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ? AND o.status NOT IN ('delivered', 'cancelled')
    ORDER BY
      CASE o.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      o.queue_position ASC
  `).all(artistId)
}

/**
 * 更新订单状态（带状态机校验）
 */
export function updateOrderStatus(orderId, newStatus) {
  const validStatuses = ['pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled']
  if (!validStatuses.includes(newStatus)) throw new Error(`无效状态: ${newStatus}`)

  const order = getOrder(orderId)
  if (!order) throw new Error('订单不存在')

  // 状态机校验：只允许合法转换
  const allowed = STATUS_TRANSITIONS[order.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`不能从「${order.status}」转为「${newStatus}」`)
  }

  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newStatus, orderId)

  if (['delivered', 'cancelled'].includes(newStatus)) {
    reorderQueue(order.artist_id)
  }

  return getOrder(orderId)
}

/**
 * 拖拽排序
 * 规则：被拖动的订单获得目标位置的优先级，同优先级的其他订单顺延（不交换）
 */
export function reorderQueueByDrag(artistId, draggedOrderId, targetPosition) {
  const dragged = db.prepare('SELECT * FROM orders WHERE id = ? AND artist_id = ?').get(draggedOrderId, artistId)
  if (!dragged) throw new Error('订单不存在')

  const queue = getArtistQueue(artistId)
  const targetOrder = queue[targetPosition]
  const newPriority = targetOrder ? targetOrder.priority : dragged.priority

  // 更新被拖动订单的优先级
  db.prepare('UPDATE orders SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newPriority, draggedOrderId)

  // 重排：按优先级分组，被拖项插入到目标位置（而非组首）
  const updatedQueue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      CASE WHEN id = ? THEN ? ELSE queue_position END ASC
  `).all(artistId, draggedOrderId, targetPosition + 1)

  const updatePos = db.prepare('UPDATE orders SET queue_position = ? WHERE id = ?')
  db.transaction(() => {
    updatedQueue.forEach((row, index) => updatePos.run(index + 1, row.id))
  })()

  return getArtistQueue(artistId)
}

/**
 * 重排队列位置（删除/交付后调用）
 */
function reorderQueue(artistId) {
  const queue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      queue_position ASC
  `).all(artistId)

  const updatePos = db.prepare('UPDATE orders SET queue_position = ? WHERE id = ?')
  db.transaction(() => {
    queue.forEach((row, index) => updatePos.run(index + 1, row.id))
  })()
}

/**
 * 更新订单优先级
 */
export function updatePriority(orderId, priority) {
  const valid = ['high', 'medium', 'low']
  if (!valid.includes(priority)) throw new Error(`无效优先级: ${priority}`)

  const order = getOrder(orderId)
  if (!order) throw new Error('订单不存在')

  db.prepare('UPDATE orders SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(priority, orderId)

  reorderQueue(order.artist_id)
  return getOrder(orderId)
}

/**
 * 添加订单备注
 */
export function addNote(orderId, content, createdBy = 'artist') {
  db.prepare('INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, ?)')
    .run(orderId, content, createdBy)
  return getOrder(orderId)
}

/**
 * 获取画师的订单列表（支持状态筛选）
 */
export function getArtistOrders(artistId, status) {
  let query = `
    SELECT o.*, t.name as tier_name, t.price as tier_price
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ?
  `
  const params = [artistId]
  if (status) {
    query += ' AND o.status = ?'
    params.push(status)
  }
  query += ' ORDER BY o.created_at DESC'
  return db.prepare(query).all(...params)
}

/**
 * 仪表盘统计数据
 */
export function getArtistStats(artistId) {
  const pendingCount = db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND status = 'pending'"
  ).get(artistId).c
  const activeCount = db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')"
  ).get(artistId).c
  const monthRevenue = db.prepare(`
    SELECT COALESCE(SUM(t.price), 0) as total
    FROM orders o LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ? AND o.status IN ('done', 'delivered')
      AND o.updated_at >= date('now', 'start of month')
  `).get(artistId).total
  const totalCompleted = db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND status IN ('done', 'delivered')"
  ).get(artistId).c
  return { pendingCount, activeCount, monthRevenue, totalCompleted }
}

/**
 * 添加交付文件
 */
export function addDeliverable(orderId, filePath, fileName, fileSize) {
  db.prepare('INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)')
    .run(orderId, filePath, fileName || '交付文件', fileSize || 0)
}

/**
 * 客户查询排队位置（需同时提供订单号和QQ号验证身份）
 */
export function getClientQueuePosition(orderNo, clientQq) {
  const order = getOrderByNo(orderNo)
  if (!order) return null

  // QQ 号不匹配 → 视为不存在（防枚举）
  if (order.client_qq !== clientQq) return null

  if (['delivered', 'cancelled'].includes(order.status)) {
    return { order, position: null, total: null }
  }

  const queue = getArtistQueue(order.artist_id)
  const position = queue.findIndex(o => o.id === order.id) + 1

  return { order, position, total: queue.length }
}

/**
 * 客户凭 QQ 号查询在某画师处的所有订单（"不知道订单号"场景）
 */
export function getClientOrdersByQq(artistId, clientQq) {
  return db.prepare(`
    SELECT o.order_no, o.status, o.created_at, o.updated_at,
           t.name as tier_name
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ? AND o.client_qq = ?
    ORDER BY o.id DESC
    LIMIT 20
  `).all(artistId, clientQq)
}

/**
 * 检查客户QQ在某画师处是否有订单
 */
export function hasClientOrders(artistId, clientQq) {
  const row = db.prepare(
    'SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND client_qq = ?'
  ).get(artistId, clientQq)
  return row.c > 0
}

/**
 * 读取平台配置
 */
export function getPlatformConfig(key) {
  const row = db.prepare('SELECT value FROM platform_config WHERE key = ?').get(key)
  return row?.value ?? null
}
