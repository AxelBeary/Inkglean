import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { calculatePrice } from '../pricing/pricing.service.js'
import { resolvePriceCents } from '../../utils/price.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { toSqliteDate } from '../../utils/date.js'

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

    // ─── SPEC-004: 名额分区 ───
    let queueZone = 'formal'
    if (artist.batch_limit != null) {
      const formalCount = db.prepare(`
        SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')
      `).get(artistId).c
      const bufferCount = db.prepare(`
        SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
      `).get(artistId).c
      if (formalCount < artist.batch_limit) {
        queueZone = 'formal'
      } else if (bufferCount < (artist.buffer_limit ?? 0)) {
        queueZone = 'buffer'
      } else {
        throw new AppError(E.BATCH_FULL)
      }
    }

    const maxPos = db.prepare(
      `SELECT MAX(queue_position) as max_pos FROM orders WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}`
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
      INSERT INTO orders (order_no, artist_id, tier_id, client_qq, client_name, description, priority, status, source, client_notify, queue_position, price_snapshot, total_price_cents, usage_multiplier_id, rush_multiplier_id, quote_snapshot, final_price_cents, queue_zone)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNo, artistId, tierId || null, clientQq, clientName || null,
      description || null, priority || 'medium', source || 'self',
      clientNotify ? 1 : 0, queuePosition,
      priceCalc ? priceCalc.basePrice : null,
      totalPriceCents,
      usageMultiplierId || null,
      rushMultiplierId || null,
      quoteSnapshot,
      totalPriceCents, // R3: 有价格计算时，最终价格初始 = 计算器总价
      queueZone
    )

    const orderId = result.lastInsertRowid

    // R30d: 新订单自动接入工作流（current_stage_id = 画师第一个节点）
    const firstStage = db.prepare(
      'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
    ).get(artistId)
    if (firstStage) {
      db.prepare('UPDATE orders SET current_stage_id = ? WHERE id = ?').run(firstStage.id, orderId)
    }

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

    // ─── 生成分期计划（SPEC-004: 缓冲订单不生成付款节点） ───
    if (queueZone === 'formal' && priceCalc && priceCalc.installments.length > 0) {
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
  // SPEC-003: 附加工作项
  order.extraItems = db.prepare('SELECT * FROM order_extra_items WHERE order_id = ? ORDER BY created_at ASC').all(orderId)

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
      // SPEC-004: 正式区释放名额后尝试自动递补
      tryAutoPromote(order.artist_id)
    }

    return getOrder(orderId)
  })()
}

/**
 * 重排队列位置（删除/交付后调用）
 * 导出供 order-gallery.service.js 的 deliverOrder 使用
 */
export function compactQueue(artistId) {
  const queue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}
    ORDER BY queue_position ASC
  `).all(artistId)

  const updatePos = db.prepare('UPDATE orders SET queue_position = ? WHERE id = ?')
  db.transaction(() => {
    queue.forEach((row, index) => updatePos.run(index + 1, row.id))
  })()
}

/**
 * 更新订单截稿日（v0.15 R51）
 * deadline: ISO 8601 字符串 或 null（清除）
 */
export function updateDeadline(orderId, deadline) {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  let normalized = null
  if (deadline !== null) {
    // 校验 ISO 8601 格式
    const d = new Date(deadline)
    if (isNaN(d.getTime())) {
      throw new AppError(E.INVALID_DEADLINE, 400, { value: deadline })
    }
    // 统一存储为 SQLite 格式（YYYY-MM-DD HH:MM:SS UTC），与 SQL 比较格式一致
    normalized = toSqliteDate(d)
  }

  db.prepare('UPDATE orders SET deadline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(normalized, orderId)

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
 * 删除订单备注（v0.15 R46）
 * 系统备注（created_by='system'）不可删除
 * 带图备注删除后，图片由 GC 孤儿回收机制自动清理（app.js gcUploads 已收集 order_notes.image_path）
 */
export function deleteNote(orderId, noteId) {
  const note = db.prepare('SELECT * FROM order_notes WHERE id = ? AND order_id = ?').get(noteId, orderId)
  if (!note) throw new AppError(E.NOTE_NOT_FOUND, 404)
  if (note.created_by === 'system') throw new AppError(E.SYSTEM_NOTE_PROTECTED, 403)

  db.prepare('DELETE FROM order_notes WHERE id = ?').run(noteId)
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

  // 内联活跃队列查询（避免循环引用 order-queue.service.js）
  const queue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}
    ORDER BY queue_position ASC
  `).all(order.artist_id)
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
    const oldCents = resolvePriceCents(order)

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

// ─── SPEC-003: 附加工作项 ───

/**
 * 获取订单付款节点（客户进度页用）
 * 返回：[{name, amountCents, paid}]
 */
export function getOrderInstallments(orderId) {
  return db.prepare(
    'SELECT label as name, amount_cents as amountCents, status FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId).map(i => ({ name: i.name, amountCents: i.amountCents, paid: i.status === 'paid' }))
}

/**
 * 重算订单最终价格
 * final_price_cents = total_price_cents + Σ(extra_items.price_cents)
 * 无 total_price_cents 时从 0 起算
 */
function recalcFinalPrice(orderId) {
  const order = db.prepare('SELECT total_price_cents FROM orders WHERE id = ?').get(orderId)
  const base = order?.total_price_cents ?? 0
  const sum = db.prepare('SELECT COALESCE(SUM(price_cents), 0) as s FROM order_extra_items WHERE order_id = ?').get(orderId).s
  const finalCents = base + sum
  db.prepare('UPDATE orders SET final_price_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(finalCents, orderId)
  return finalCents
}

/**
 * 附加项金额变动计入最后一个未付节点（SPEC-003 §3.5）
 * deltaCents: 正数=增加，负数=减少
 * 所有节点已付 → 不影响节点，返回 'all_paid'
 * 无节点 → 不影响，返回 'no_installments'
 */
function adjustInstallments(orderId, deltaCents) {
  if (deltaCents === 0) return 'zero_delta'

  const installments = db.prepare(
    'SELECT * FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId)

  if (installments.length === 0) return 'no_installments'

  // 找最后一个未付节点
  const unpaid = installments.filter(i => i.status !== 'paid')
  if (unpaid.length === 0) return 'all_paid'

  const lastUnpaid = unpaid[unpaid.length - 1]
  const newAmount = (lastUnpaid.amount_cents || 0) + deltaCents
  // 金额不能为负（极端情况：删除附加项超过节点金额）→ 兜底 0
  db.prepare('UPDATE order_payment_installments SET amount_cents = ? WHERE id = ?')
    .run(Math.max(0, newAmount), lastUnpaid.id)

  return 'adjusted'
}

/**
 * 金额格式化（分 → 元字符串，用于系统备注）
 */
function formatCents(cents) {
  return `¥${(cents / 100).toFixed(2)}`
}

/**
 * 添加附加工作项
 * 校验：终态拒绝 + 数量上限 20
 * 事务：插入 → 重算 final_price → 调整节点 → 系统备注
 */
export function addExtraItem(orderId, { name, description, priceCents }) {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 终态拒绝
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  // 数量上限
  const count = db.prepare('SELECT COUNT(*) as c FROM order_extra_items WHERE order_id = ?').get(orderId).c
  if (count >= 20) {
    throw new AppError(E.EXTRA_ITEM_LIMIT)
  }

  const cents = priceCents ?? 0

  return db.transaction(() => {
    db.prepare('INSERT INTO order_extra_items (order_id, name, description, price_cents) VALUES (?, ?, ?, ?)')
      .run(orderId, name, description || null, cents)

    // 重算最终价格
    recalcFinalPrice(orderId)

    // 调整付款节点
    const result = adjustInstallments(orderId, cents)

    // 系统备注
    const priceStr = cents > 0 ? `+${formatCents(cents)}` : '（不计费）'
    let noteContent = `📎 附加工作项「${name}」${priceStr}`
    if (result === 'all_paid') {
      noteContent += '（已付清订单追加，线下结算）'
    }
    db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
      .run(orderId, noteContent)

    return getOrder(orderId)
  })()
}

/**
 * 删除附加工作项
 * 校验：归属（item.order_id === orderId）
 * 事务：删除 → 重算 final_price → 调整节点 → 系统备注
 */
export function deleteExtraItem(orderId, itemId) {
  const item = db.prepare('SELECT * FROM order_extra_items WHERE id = ? AND order_id = ?').get(itemId, orderId)
  if (!item) throw new AppError(E.NOT_FOUND, 404)

  return db.transaction(() => {
    db.prepare('DELETE FROM order_extra_items WHERE id = ?').run(itemId)

    // 重算最终价格
    recalcFinalPrice(orderId)

    // 调整付款节点（负向）
    const result = adjustInstallments(orderId, -item.price_cents)

    // 系统备注
    const priceStr = item.price_cents > 0 ? `-${formatCents(item.price_cents)}` : '（不计费）'
    let noteContent = `📎 移除附加工作项「${item.name}」${priceStr}`
    if (result === 'all_paid') {
      noteContent += '（已付清订单移除，线下结算）'
    }
    db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
      .run(orderId, noteContent)

    return getOrder(orderId)
  })()
}

// ─── SPEC-004: 名额与缓冲系统 ───

/**
 * 为订单生成付款节点（递补时按报价快照生成）
 * 从工作流模板的收款节点生成
 */
function generateInstallmentsForOrder(orderId) {
  // 已有节点则跳过（幂等）
  const existing = db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(orderId).c
  if (existing > 0) return

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
  if (!order || !order.total_price_cents) return

  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id)
  const paymentStages = stages.filter(s => s.takes_payment && s.basis_points)
  if (paymentStages.length === 0) return

  const insertInst = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  paymentStages.forEach((stage, i) => {
    const amountCents = Math.round(order.total_price_cents * stage.basis_points / 10000)
    insertInst.run(orderId, stage.name, stage.basis_points, amountCents, i)
  })
}

/**
 * 递补订单：buffer → formal
 * 排到正式队列末尾 + 生成付款节点 + 系统备注
 */
export function promoteOrder(orderId) {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)
  if (order.queue_zone !== 'buffer') throw new AppError(E.NOT_BUFFER_ORDER)
  if (['delivered', 'cancelled'].includes(order.status)) throw new AppError(E.ORDER_FINAL_STATE)

  return db.transaction(() => {
    // 正式队列末尾
    const maxPos = db.prepare(
      `SELECT MAX(queue_position) as m FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')`
    ).get(order.artist_id)
    const newPos = (maxPos?.m ?? 0) + 1

    db.prepare("UPDATE orders SET queue_zone = 'formal', queue_position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(newPos, orderId)

    // 递补后生成付款节点（按下单时报价快照）
    generateInstallmentsForOrder(orderId)

    // 系统备注
    db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
      .run(orderId, '📋 从缓冲区递补到正式排期')

    return getOrder(orderId)
  })()
}

/**
 * 自动递补（auto_promote=1 时，正式区空位后触发）
 * 从缓冲区取最早一单递补，循环直到正式区满或缓冲区空
 */
export function tryAutoPromote(artistId) {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId)
  if (!artist || !artist.auto_promote || artist.batch_limit == null) return

  const N = artist.batch_limit
  for (;;) {
    const formalCount = db.prepare(`
      SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')
    `).get(artistId).c
    if (formalCount >= N) break

    const next = db.prepare(`
      SELECT id FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
      ORDER BY queue_position ASC LIMIT 1
    `).get(artistId)
    if (!next) break

    promoteOrder(next.id)
  }
}
