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
 * 按前缀查最大序号（跨画师），防止改码后订单号碰撞
 */
export function generateOrderNo(artistId, artistCode) {
  const last = db.prepare(
    "SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(`${artistCode}-%`)

  let seq = 1
  if (last) {
    const dashIdx = last.order_no.lastIndexOf('-')
    if (dashIdx !== -1) {
      const num = parseInt(last.order_no.slice(dashIdx + 1), 10)
      if (!isNaN(num)) seq = num + 1
    }
  }

  const SEQ_PAD_THRESHOLD = 999
  const seqStr = seq <= SEQ_PAD_THRESHOLD ? String(seq).padStart(3, '0') : String(seq)
  return `${artistCode}-${seqStr}`
}

/**
 * 创建订单（客户自助 或 画师手动录入）
 * 事务包裹，防止订单号竞态
 */
export function createOrder({ artistId, tierId, clientQq, clientName, description, priority, source, clientNotify, references }) {
  return db.transaction(() => {
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

    const orderId = result.lastInsertRowid

    // R0-1: 参考图在事务内落库
    if (Array.isArray(references) && references.length > 0) {
      const insertRef = db.prepare('INSERT INTO order_references (order_id, file_path) VALUES (?, ?)')
      for (const ref of references.slice(0, 5)) {
        insertRef.run(orderId, ref)
      }
    }

    // N0-1: 创建订单时快照价格
    // 安全：tierId 必须属于该画师，防止跨画师污染价格快照
    if (tierId) {
      const tier = db.prepare('SELECT price FROM price_tiers WHERE id = ? AND artist_id = ?').get(tierId, artistId)
      if (!tier) {
        throw new Error('价格档位不存在或不属于该画师')
      }
      db.prepare('UPDATE orders SET price_snapshot = ? WHERE id = ?').run(tier.price, orderId)
    }

    return getOrder(orderId)
  })()
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
 * 获取画师的活跃队列（按 queue_position 排序）
 * N1-1: 拖拽即绝对顺序，priority 退化为纯展示标签
 */
export function getArtistQueue(artistId) {
  return db.prepare(`
    SELECT o.*, t.name as tier_name, t.price as tier_price
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ? AND o.status NOT IN ('delivered', 'cancelled')
    ORDER BY o.queue_position ASC
  `).all(artistId)
}

/**
 * 更新订单状态（带状态机校验）
 * 事务包裹，防止中途崩溃留下不一致状态
 */
export function updateOrderStatus(orderId, newStatus) {
  const validStatuses = ['pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled']
  if (!validStatuses.includes(newStatus)) throw new Error(`无效状态: ${newStatus}`)

  const order = getOrder(orderId)
  if (!order) throw new Error('订单不存在')

  const allowed = STATUS_TRANSITIONS[order.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new Error(`不能从「${order.status}」转为「${newStatus}」`)
  }

  return db.transaction(() => {
    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStatus, orderId)

    if (['done', 'delivered'].includes(newStatus)) {
      db.prepare('UPDATE orders SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ?')
        .run(orderId)
    }

    if (['delivered', 'cancelled'].includes(newStatus)) {
      compactQueue(order.artist_id)
    }

    return getOrder(orderId)
  })()
}

/**
 * 拖拽排序（重写）
 * 前端传入完整的排序后 ID 数组，后端按序分配 queue_position
 * 拖拽不改变优先级，只改变同优先级内的位置
 */
export function reorderQueue(artistId, orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error('排序列表不能为空')
  }

  // 校验所有 ID 属于该画师且为活跃订单
  const activeOrders = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')
  `).all(artistId).map(r => r.id)

  const idSet = new Set(activeOrders)
  for (const id of orderedIds) {
    if (!idSet.has(id)) throw new Error(`订单 ${id} 不属于当前队列`)
  }
  if (orderedIds.length !== activeOrders.length) {
    throw new Error('排序列表长度与队列不一致')
  }
  // 校验无重复 ID
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error('排序列表存在重复订单')
  }

  const updatePos = db.prepare('UPDATE orders SET queue_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
  db.transaction(() => {
    orderedIds.forEach((id, index) => updatePos.run(index + 1, id))
  })()

  return getArtistQueue(artistId)
}

/**
 * 重排队列位置（删除/交付后调用）— 内部函数
 */
function compactQueue(artistId) {
  const queue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')
    ORDER BY queue_position ASC
  `).all(artistId)

  const updatePos = db.prepare('UPDATE orders SET queue_position = ? WHERE id = ?')
  db.transaction(() => {
    queue.forEach((row, index) => updatePos.run(index + 1, row.id))
  })()
}

/**
 * 更新订单优先级
 * N1-1: 优先级仅作展示标签，不重排队列
 */
export function updatePriority(orderId, priority) {
  const valid = ['high', 'medium', 'low']
  if (!valid.includes(priority)) throw new Error(`无效优先级: ${priority}`)

  const order = getOrder(orderId)
  if (!order) throw new Error('订单不存在')

  db.prepare('UPDATE orders SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(priority, orderId)

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
 * 获取画师的订单列表（支持状态筛选 + 分页）
 */
export function getArtistOrders(artistId, status, { page = 1, pageSize = 50 } = {}) {
  let where = 'WHERE o.artist_id = ?'
  const params = [artistId]
  if (status) {
    where += ' AND o.status = ?'
    params.push(status)
  }

  const total = db.prepare(`
    SELECT COUNT(*) as c FROM orders o ${where}
  `).get(...params).c

  const offset = (Math.max(1, page) - 1) * pageSize
  const items = db.prepare(`
    SELECT o.*, t.name as tier_name, t.price as tier_price
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset)

  return { items, total, page, pageSize }
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
  // 收入统计 — 使用 completed_at + price_snapshot
  // 时区修正：在应用层计算本地时区的月初 UTC 时间戳，避免 UTC+8 用户月初订单被算入上月
  const now = new Date()
  const localMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStartUTC = localMonthStart.toISOString().slice(0, 19).replace('T', ' ')
  const monthRevenue = db.prepare(`
    SELECT COALESCE(SUM(o.price_snapshot), 0) as total
    FROM orders o
    WHERE o.artist_id = ? AND o.status IN ('done', 'delivered')
      AND o.completed_at >= ?
  `).get(artistId, monthStartUTC).total
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
 * 交付订单（事务化）
 * 仅 wip/revision/done 状态允许上传交付文件
 */
export function deliverOrder(orderId, filePath, fileName, fileSize) {
  return db.transaction(() => {
    const order = getOrder(orderId)
    if (!order) throw new Error('订单不存在')
    if (!['wip', 'revision', 'done'].includes(order.status)) {
      throw new Error(`当前状态「${order.status}」不能上传交付文件`)
    }

    addDeliverable(orderId, filePath, fileName, fileSize)

    let statusChanged = false
    if (order.status === 'done') {
      db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('delivered', orderId)
      compactQueue(order.artist_id)
      statusChanged = true
    }

    return { order: getOrder(orderId), statusChanged }
  })()
}

/**
 * 添加订单参考图
 */
export function addReference(orderId, filePath, fileName, fileSize) {
  db.prepare('INSERT INTO order_references (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)')
    .run(orderId, filePath, fileName || '参考图', fileSize || 0)
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
