import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { calculatePrice } from '../pricing/pricing.service.js'

// ============================================
// 订单服务 - 核心业务逻辑
// ============================================

// ─── 报价快照字符串生成（v0.11 R2） ───

/** 金额格式化：整数不带小数，非整数保留两位 */
function formatYuan(amount) {
  return Number.isInteger(amount) ? `¥${amount}` : `¥${amount.toFixed(2)}`
}

/**
 * 从价格计算结果生成报价快照字符串
 * 格式："档位名 ¥X + 增项A×n ¥Y，倍率×z → 总价 ¥T"
 * 无计算结果时返回 null（手动录单无价格场景）
 */
function buildQuoteSnapshot(priceCalc) {
  if (!priceCalc || !priceCalc.breakdown || priceCalc.breakdown.length === 0) return null

  const parts = []
  const multipliers = []

  for (const item of priceCalc.breakdown) {
    if (item.type === 'tier' || item.type === 'addon') {
      parts.push(`${item.name} ${formatYuan(item.amount)}`)
    } else if (item.type === 'usage' || item.type === 'rush') {
      multipliers.push(item.name) // 已含 "×倍率" 格式
    }
  }

  let snapshot = parts.join(' + ')
  if (multipliers.length > 0) {
    snapshot += `，${multipliers.join('，')}`
  }
  snapshot += ` → 总价 ${formatYuan(priceCalc.totalPrice)}`

  return snapshot
}

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
 * 支持价格计算器：addons + 倍率 → breakdown + 分期
 */
export function createOrder({ artistId, tierId, clientQq, clientName, description, priority, source, clientNotify, references, addons, usageMultiplierId, rushMultiplierId }) {
  return db.transaction(() => {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND)

    const code = artist.artist_code || artist.subdomain.toUpperCase()
    const orderNo = generateOrderNo(artistId, code)

    const maxPos = db.prepare(
      "SELECT MAX(queue_position) as max_pos FROM orders WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')"
    ).get(artistId)
    const queuePosition = (maxPos?.max_pos ?? 0) + 1

    // ─── 价格计算（有 tierId 时） ───
    let totalPriceCents = null
    let priceCalc = null
    if (tierId) {
      priceCalc = calculatePrice(artistId, {
        tierId,
        addons: addons || [],
        usageMultiplierId: usageMultiplierId || null,
        rushMultiplierId: rushMultiplierId || null
      })
      totalPriceCents = priceCalc.totalPriceCents
    }

    // ─── 报价快照字符串（v0.11 R2） ───
    const quoteSnapshot = buildQuoteSnapshot(priceCalc)

    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, tier_id, client_qq, client_name, description, priority, status, source, client_notify, queue_position, price_snapshot, total_price_cents, usage_multiplier_id, rush_multiplier_id, quote_snapshot, final_price_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNo, artistId, tierId || null, clientQq, clientName || null,
      description || null, priority || 'medium', source || 'self',
      clientNotify ? 1 : 0, queuePosition,
      priceCalc ? priceCalc.basePrice : null,
      totalPriceCents,
      usageMultiplierId || null,
      rushMultiplierId || null,
      quoteSnapshot,
      totalPriceCents // R3: 有价格计算时，最终价格初始 = 计算器总价
    )

    const orderId = result.lastInsertRowid

    // R0-1: 参考图在事务内落库（R18: 显式传 source='client'，不依赖 DEFAULT）
    if (Array.isArray(references) && references.length > 0) {
      const insertRef = db.prepare("INSERT INTO order_references (order_id, file_path, source) VALUES (?, ?, 'client')")
      for (const ref of references.slice(0, 5)) {
        insertRef.run(orderId, ref)
      }
    }

    // ─── 价格明细快照 ───
    if (priceCalc && priceCalc.breakdown.length > 0) {
      const insertBd = db.prepare(
        'INSERT INTO order_price_breakdown (order_id, item_type, item_name, amount_cents, multiplier, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      priceCalc.breakdown.forEach((item, i) => {
        insertBd.run(orderId, item.type, item.name, Math.round(item.amount * 100), item.multiplier, item.quantity, i)
      })
    }

    // ─── 生成分期计划 ───
    if (priceCalc && priceCalc.installments.length > 0) {
      const insertInst = db.prepare(
        'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
      )
      priceCalc.installments.forEach((inst, i) => {
        insertInst.run(orderId, inst.label, inst.basisPoints, Math.round(inst.amount * 100), i)
      })
    }

    return getOrder(orderId)
  })()
}

/**
 * 获取单个订单（含关联数据）
 * R18: clientOnly=true 时 references 只返回 source='client'（客户查询页不泄露画师图）
 */
export function getOrder(orderId, { clientOnly = false } = {}) {
  const order = db.prepare(`
    SELECT o.*, a.name as artist_name, a.subdomain as artist_subdomain, t.name as tier_name, t.price as tier_price
    FROM orders o
    JOIN artists a ON o.artist_id = a.id
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.id = ?
  `).get(orderId)

  if (!order) return null

  if (clientOnly) {
    order.references = db.prepare("SELECT * FROM order_references WHERE order_id = ? AND source = 'client'").all(orderId)
  } else {
    order.references = db.prepare('SELECT * FROM order_references WHERE order_id = ?').all(orderId)
  }
  order.notes = db.prepare('SELECT * FROM order_notes WHERE order_id = ? ORDER BY created_at ASC').all(orderId)
  order.deliverables = db.prepare('SELECT * FROM deliverables WHERE order_id = ?').all(orderId)

  return order
}

/**
 * 根据订单号查询
 * R18: clientOnly 透传给 getOrder（客户查询页只看客户图）
 */
export function getOrderByNo(orderNo, { clientOnly = false } = {}) {
  const row = db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo)
  if (!row) return null
  return getOrder(row.id, { clientOnly })
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
  if (!validStatuses.includes(newStatus)) throw new AppError(E.ORDER_INVALID_STATUS, 400, { status: newStatus })

  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  const allowed = STATUS_TRANSITIONS[order.status]
  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(E.INVALID_TRANSITION, 400, { from: order.status, to: newStatus })
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
    throw new AppError(E.QUEUE_EMPTY)
  }

  // 校验所有 ID 属于该画师且为活跃订单
  const activeOrders = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND status NOT IN ('delivered', 'cancelled')
  `).all(artistId).map(r => r.id)

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
  if (!valid.includes(priority)) throw new AppError(E.INVALID_PRIORITY, 400, { priority })

  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  db.prepare('UPDATE orders SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(priority, orderId)

  return getOrder(orderId)
}

/**
 * 添加订单备注
 * R19: 支持可选附图 imagePath（notes/{artistId}/ 目录）
 */
export function addNote(orderId, content, createdBy = 'artist', imagePath = null) {
  db.prepare('INSERT INTO order_notes (order_id, content, created_by, image_path) VALUES (?, ?, ?, ?)')
    .run(orderId, content, createdBy, imagePath)
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
  // 收入统计 — 使用 completed_at + final_price_cents（回退 total_price_cents，再回退 price_snapshot）
  // 时区修正：在应用层计算本地时区的月初 UTC 时间戳，避免 UTC+8 用户月初订单被算入上月
  const now = new Date()
  const localMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStartUTC = localMonthStart.toISOString().slice(0, 19).replace('T', ' ')
  const monthRevenue = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN o.final_price_cents IS NOT NULL THEN o.final_price_cents
        WHEN o.total_price_cents IS NOT NULL THEN o.total_price_cents
        ELSE COALESCE(o.price_snapshot, 0) * 100
      END
    ), 0) as total_cents
    FROM orders o
    WHERE o.artist_id = ? AND o.status IN ('done', 'delivered')
      AND o.completed_at >= ?
  `).get(artistId, monthStartUTC).total_cents
  const totalCompleted = db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND status IN ('done', 'delivered')"
  ).get(artistId).c
  return {
    pendingCount,
    activeCount,
    monthRevenue: monthRevenue / 100,   // 元（REAL），兼容现有 Dashboard.vue
    monthRevenueCents: monthRevenue,    // 分（INTEGER），R8 仪表盘重构时切换
    totalCompleted
  }
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
    if (!order) throw new AppError(E.ORDER_NOT_FOUND)
    if (!['wip', 'revision', 'done'].includes(order.status)) {
      throw new AppError(E.DELIVER_WRONG_STATUS, 400, { status: order.status })
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
 * R18: source 区分来源（'client'/'artist'），20 张总量校验
 * ⚠️ 务必显式传 source 值，不要依赖 DEFAULT（显式传 NULL 会写成 null）
 */
export function addReference(orderId, filePath, fileName, fileSize, source = 'client') {
  // R18: 订单生命周期总量限制 20 张
  const count = db.prepare('SELECT COUNT(*) AS c FROM order_references WHERE order_id = ?').get(orderId).c
  if (count >= 20) {
    throw new AppError(E.REFERENCES_LIMIT)
  }
  db.prepare('INSERT INTO order_references (order_id, file_path, original_name, file_size, source) VALUES (?, ?, ?, ?, ?)')
    .run(orderId, filePath, fileName || '参考图', fileSize || 0, source)
}

/**
 * 客户查询排队位置（需同时提供订单号和QQ号验证身份）
 * R18: clientOnly=true，客户只看自己上传的参考图
 */
export function getClientQueuePosition(orderNo, clientQq) {
  const order = getOrderByNo(orderNo, { clientOnly: true })
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

// ─── v0.11 R2: 最终价格修改 ───

/**
 * 修改订单最终价格
 * 校验：正整数（分），上限 99999999（999999.99 元）
 * 改价时自动追加订单备注 "最终价格从 ¥A 改为 ¥B"
 */
export function updateFinalPrice(orderId, finalPriceCents, quoteSnapshot) {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 校验：正整数，1 ~ 99999999
  if (!Number.isInteger(finalPriceCents) || finalPriceCents < 1 || finalPriceCents > 99999999) {
    throw new AppError(E.INVALID_PRICE, 400, { value: finalPriceCents })
  }

  return db.transaction(() => {
    // 计算旧价格（用于备注）
    const oldCents = order.final_price_cents ?? order.total_price_cents ?? (order.price_snapshot != null ? Math.round(order.price_snapshot * 100) : null)

    db.prepare('UPDATE orders SET final_price_cents = ?, quote_snapshot = COALESCE(?, quote_snapshot), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(finalPriceCents, quoteSnapshot ?? null, orderId)

    // 自动追加备注
    const oldStr = oldCents != null ? `¥${(oldCents / 100).toFixed(2)}` : '未定价'
    const newStr = `¥${(finalPriceCents / 100).toFixed(2)}`
    db.prepare('INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, ?)')
      .run(orderId, `最终价格从 ${oldStr} 改为 ${newStr}`, 'system')

    return getOrder(orderId)
  })()
}

// ─── v0.11 R4: 焦点图 ───

const VALID_FOCUS_MODES = ['off', 'small', 'large']

/**
 * 设置订单焦点图
 * 焦点图路径必须是该订单已有参考图之一（校验归属）
 * mode 为 'off' 时清空焦点图
 */
export function setFocusImage(orderId, imagePath, mode) {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  if (!VALID_FOCUS_MODES.includes(mode)) {
    throw new AppError(E.INVALID_FOCUS_MODE, 400, { mode })
  }

  if (mode === 'off') {
    db.prepare("UPDATE orders SET focus_image_path = NULL, focus_image_mode = 'off', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(orderId)
    return getOrder(orderId)
  }

  // 校验参考图归属
  if (!imagePath) throw new AppError(E.FOCUS_IMAGE_NOT_FOUND)
  const ref = db.prepare('SELECT id FROM order_references WHERE order_id = ? AND file_path = ?').get(orderId, imagePath)
  if (!ref) throw new AppError(E.FOCUS_IMAGE_NOT_OWNED, 400, { path: imagePath })

  db.prepare('UPDATE orders SET focus_image_path = ?, focus_image_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(imagePath, mode, orderId)

  return getOrder(orderId)
}

/**
 * 删除订单参考图
 * 删除时检查并清理焦点图字段
 */
export function removeReference(orderId, referenceId) {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  const ref = db.prepare('SELECT * FROM order_references WHERE id = ? AND order_id = ?').get(referenceId, orderId)
  if (!ref) throw new AppError(E.FOCUS_IMAGE_NOT_FOUND, 404)

  return db.transaction(() => {
    db.prepare('DELETE FROM order_references WHERE id = ?').run(referenceId)

    // 如果删除的是焦点图，清理焦点图字段
    if (order.focus_image_path === ref.file_path) {
      db.prepare("UPDATE orders SET focus_image_path = NULL, focus_image_mode = 'off', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(orderId)
    }

    return getOrder(orderId)
  })()
}
