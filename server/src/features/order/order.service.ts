import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { calculatePrice } from '../pricing/pricing.service.js'
import { validateDiscountCode, computeDiscountCents, incrementUsage } from '../pricing/discount.service.js'
import { resolvePriceCents } from '../../utils/price.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { toSqliteDate } from '../../utils/date.js'
import type { Artist, Order, WorkflowStage, PriceResult } from '../../types/entities.js'

// ============================================
// 订单服务 - 核心业务逻辑
// ============================================

// ─── 报价快照字符串生成（v0.11 R2） ───

/** 金额格式化：整数不带小数，非整数保留两位 */
function formatYuan(amount: number): string {
  return Number.isInteger(amount) ? `¥${amount}` : `¥${amount.toFixed(2)}`
}

/**
 * 从价格计算结果生成报价快照字符串
 * 格式："档位名 ¥X + 增项A×n ¥Y，倍率×z → 总价 ¥T"
 * 无计算结果时返回 null（手动录单无价格场景）
 */
function buildQuoteSnapshot(priceCalc: PriceResult | null): string | null {
  if (!priceCalc || !priceCalc.breakdown || priceCalc.breakdown.length === 0) return null

  const parts: string[] = []
  const multipliers: string[] = []

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
const STATUS_TRANSITIONS: Record<string, string[]> = {
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
export function generateOrderNo(artistId: number, artistCode: string): string {
  const last = db.prepare(
    "SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(`${artistCode}-%`) as { order_no: string } | undefined

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

/** createOrder 参数 */
interface CreateOrderParams {
  artistId: number
  tierId?: number | null
  clientQq: string
  clientName?: string | null
  description?: string | null
  priority?: string
  source?: string
  clientNotify?: boolean
  references?: string[]
  addons?: Array<{ addonId: number; quantity?: number }>
  usageMultiplierId?: number | null
  rushMultiplierId?: number | null
  discountCode?: string | null
}

/**
 * 创建订单（客户自助 或 画师手动录入）
 * 事务包裹，防止订单号竞态
 * 支持价格计算器：addons + 倍率 → breakdown + 分期
 * v0.31 F3: 折扣码（先倍率后折扣，REQ-023 已定）
 */
export function createOrder({ artistId, tierId, clientQq, clientName, description, priority, source, clientNotify, references, addons, usageMultiplierId, rushMultiplierId, discountCode }: CreateOrderParams): any {
  return db.transaction(() => {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND)

    const code = artist.artist_code || artist.subdomain.toUpperCase()
    const orderNo = generateOrderNo(artistId, code)

    // ─── SPEC-004: 名额分区 ───
    let queueZone = 'formal'
    if (artist.batch_limit != null) {
      const formalCount = (db.prepare(`
        SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')
      `).get(artistId) as { c: number }).c
      const bufferCount = (db.prepare(`
        SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
      `).get(artistId) as { c: number }).c
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
    ).get(artistId) as { max_pos: number | null } | undefined
    const queuePosition = (maxPos?.max_pos ?? 0) + 1

    // ─── 价格计算（有 tierId 时） ───
    let totalPriceCents: number | null = null
    let priceCalc: PriceResult | null = null
    if (tierId) {
      priceCalc = calculatePrice(artistId, {
        tierId,
        addons: addons || [],
        usageMultiplierId: usageMultiplierId || null,
        rushMultiplierId: rushMultiplierId || null
      })
      totalPriceCents = priceCalc.totalPriceCents
    }

    // ─── v0.31 F3: 折扣码（先倍率后折扣，REQ-023 已定） ───
    let discountCodeId: number | null = null
    let discountAmountCents = 0
    if (discountCode && totalPriceCents != null && totalPriceCents > 0) {
      const dc = validateDiscountCode(artistId, discountCode)
      discountAmountCents = computeDiscountCents(dc, totalPriceCents)
      discountCodeId = dc.id
      totalPriceCents = totalPriceCents - discountAmountCents
    }

    // ─── 报价快照字符串（v0.11 R2） ───
    const quoteSnapshot = buildQuoteSnapshot(priceCalc)

    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, tier_id, client_qq, client_name, description, priority, status, source, client_notify, queue_position, price_snapshot, total_price_cents, usage_multiplier_id, rush_multiplier_id, quote_snapshot, final_price_cents, queue_zone, discount_code_id, discount_amount_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNo, artistId, tierId || null, clientQq, clientName || null,
      description || null, priority || 'medium', source || 'self',
      clientNotify ? 1 : 0, queuePosition,
      priceCalc ? priceCalc.basePrice : null,
      totalPriceCents,
      usageMultiplierId || null,
      rushMultiplierId || null,
      quoteSnapshot,
      totalPriceCents, // R3: 有价格计算时，最终价格初始 = 计算器总价（已含折扣）
      queueZone,
      discountCodeId,
      discountAmountCents
    )

    const orderId = Number(result.lastInsertRowid)

    // v0.31 F3: 折扣码使用次数 +1（事务内，下单失败自动回滚）
    if (discountCodeId) incrementUsage(discountCodeId)

    // R30d: 新订单自动接入工作流（current_stage_id = 画师第一个节点）
    const firstStage = db.prepare(
      'SELECT id FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC LIMIT 1'
    ).get(artistId) as { id: number } | undefined
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
export function getOrder(orderId: number, { clientOnly = false }: { clientOnly?: boolean } = {}): any {
  const order = db.prepare(`
    SELECT o.*, a.name as artist_name, a.subdomain as artist_subdomain, t.name as tier_name, t.price as tier_price, t.work_days as tier_work_days
    FROM orders o
    JOIN artists a ON o.artist_id = a.id
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.id = ?
  `).get(orderId) as any

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
export function getOrderByNo(orderNo: string, { clientOnly = false }: { clientOnly?: boolean } = {}): any {
  const row = db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo) as { id: number } | undefined
  if (!row) return null
  return getOrder(row.id, { clientOnly })
}

/**
 * 更新订单状态（带状态机校验）
 * 事务包裹，防止中途崩溃留下不一致状态
 */
export function updateOrderStatus(orderId: number, newStatus: string): any {
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
export function compactQueue(artistId: number): void {
  const queue = db.prepare(`
    SELECT id FROM orders
    WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}
    ORDER BY queue_position ASC
  `).all(artistId) as Array<{ id: number }>

  const updatePos = db.prepare('UPDATE orders SET queue_position = ? WHERE id = ?')
  db.transaction(() => {
    queue.forEach((row, index) => updatePos.run(index + 1, row.id))
  })()
}

/**
 * 更新订单截稿日（v0.15 R51）
 * deadline: ISO 8601 字符串 或 null（清除）
 */
export function updateDeadline(orderId: number, deadline: string | null): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  let normalized: string | null = null
  if (deadline !== null) {
    // 校验 ISO 8601 格式
    const d = new Date(deadline)
    if (isNaN(d.getTime())) {
      throw new AppError(E.INVALID_DEADLINE, 400, { value: deadline })
    }
    // 统一存储为 SQLite 格式（YYYY-MM-DD HH:MM:SS UTC），与 SQL 比较格式一致
    normalized = toSqliteDate(d)
    // #35: 交叉校验——截稿日不得早于开工日
    if (order.start_date) {
      const startStr = String(order.start_date).slice(0, 10)
      if (normalized.slice(0, 10) < startStr) {
        throw new AppError(E.INVALID_DEADLINE, 400, { value: deadline })
      }
    }
  }

  db.prepare('UPDATE orders SET deadline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(normalized, orderId)

  return getOrder(orderId)
}

/**
 * v0.26 B: 更新订单开工日
 * startDate: 'YYYY-MM-DD' 字符串 或 null（清除）
 */
export function updateStartDate(orderId: number, startDate: string | null): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  let normalized: string | null = null
  if (startDate !== null) {
    // 校验日期格式（YYYY-MM-DD）
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      throw new AppError(E.INVALID_DEADLINE, 400, { value: startDate })
    }
    const d = new Date(startDate + 'T00:00:00')
    if (isNaN(d.getTime())) {
      throw new AppError(E.INVALID_DEADLINE, 400, { value: startDate })
    }
    normalized = startDate
    // #35: 交叉校验——开工日不得晚于截稿日
    if (order.deadline) {
      const deadlineStr = String(order.deadline).slice(0, 10)
      if (normalized > deadlineStr) {
        throw new AppError(E.INVALID_START_DATE, 400, { value: startDate })
      }
    }
  }

  db.prepare('UPDATE orders SET start_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(normalized, orderId)

  return getOrder(orderId)
}

/**
 * 添加订单备注
 * R19: 支持可选附图 imagePath（notes/{artistId}/ 目录）
 */
export function addNote(orderId: number, content: string, createdBy: string = 'artist', imagePath: string | null = null): any {
  db.prepare('INSERT INTO order_notes (order_id, content, created_by, image_path) VALUES (?, ?, ?, ?)')
    .run(orderId, content, createdBy, imagePath)
  return getOrder(orderId)
}

/**
 * 删除订单备注（v0.15 R46）
 * 系统备注（created_by='system'）不可删除
 * 带图备注删除后，图片由 GC 孤儿回收机制自动清理（app.js gcUploads 已收集 order_notes.image_path）
 */
export function deleteNote(orderId: number, noteId: number): any {
  const note = db.prepare('SELECT * FROM order_notes WHERE id = ? AND order_id = ?').get(noteId, orderId) as { created_by: string } | undefined
  if (!note) throw new AppError(E.NOTE_NOT_FOUND, 404)
  if (note.created_by === 'system') throw new AppError(E.SYSTEM_NOTE_PROTECTED, 403)

  db.prepare('DELETE FROM order_notes WHERE id = ?').run(noteId)
  return getOrder(orderId)
}

/**
 * 获取画师的订单列表（支持状态筛选 + 关键字搜索 + 分页）
 */
export function getArtistOrders(artistId: number, status: string | undefined, { page = 1, pageSize = 50, q }: { page?: number; pageSize?: number; q?: string } = {}): any {
  let where = 'WHERE o.artist_id = ?'
  const params: any[] = [artistId]
  if (status) {
    where += ' AND o.status = ?'
    params.push(status)
  }
  // REQ-020 F1: 关键字搜索（客户昵称、QQ号、订单号、档位名）
  if (q && q.trim()) {
    where += ' AND (o.client_name LIKE ? OR o.client_qq LIKE ? OR o.order_no LIKE ? OR t.name LIKE ?)'
    const like = `%${q.trim()}%`
    params.push(like, like, like, like)
  }

  const total = (db.prepare(`
    SELECT COUNT(*) as c FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    ${where}
  `).get(...params) as { c: number }).c

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
export function getClientQueuePosition(orderNo: string, clientQq: string): any {
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
  `).all(order.artist_id) as Array<{ id: number }>
  const position = queue.findIndex(o => o.id === order.id) + 1

  return { order, position, total: queue.length }
}

/**
 * 客户凭 QQ 号查询在某画师处的所有订单（"不知道订单号"场景）
 */
export function getClientOrdersByQq(artistId: number, clientQq: string): any[] {
  return db.prepare(`
    SELECT o.order_no, o.status, o.created_at, o.updated_at,
           t.name as tier_name
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
    WHERE o.artist_id = ? AND o.client_qq = ?
    ORDER BY o.id DESC
    LIMIT 20
  `).all(artistId, clientQq) as any[]
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

// ─── v0.11 R2: 最终价格修改 ───

/**
 * 修改订单最终价格
 * 校验：正整数（分），上限 99999999（999999.99 元）
 * 改价时自动追加订单备注 "最终价格从 ¥A 改为 ¥B"
 */
export function updateFinalPrice(orderId: number, finalPriceCents: number, quoteSnapshot?: string | null): any {
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

    // v0.31 F4: 改价后节点应收联动
    recalcInstallmentAmounts(orderId)

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
 * 获取订单付款节点（客户进度页 + 画师端节点收款）
 * v0.31 F4: 返回节点维度 paid_cents / amount_cents / 差额
 */
export function getOrderInstallments(orderId: number): Array<{ id: number; name: string; amountCents: number; paidCents: number; remainingCents: number; status: string }> {
  const rows = db.prepare(
    'SELECT id, label as name, amount_cents as amountCents, paid_cents as paidCents, status FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId) as Array<{ id: number; name: string; amountCents: number; paidCents: number; status: string }>
  return rows.map(r => ({
    ...r,
    amountCents: r.amountCents || 0,
    paidCents: r.paidCents || 0,
    remainingCents: Math.max(0, (r.amountCents || 0) - (r.paidCents || 0)),
    status: (r.paidCents || 0) >= (r.amountCents || 0) && (r.amountCents || 0) > 0 ? 'paid'
      : (r.paidCents || 0) > 0 ? 'partial' : 'pending'
  }))
}

/**
 * B7: 根据 paid_total_cents 推算每期状态（三态）
 * paid: 完全覆盖 | partial: 部分覆盖 | pending: 未覆盖
 */
export function computeInstallmentStatuses(
  installments: Array<{ name: string; amountCents: number }>,
  paidTotalCents: number
): Array<{ name: string; amountCents: number; status: string; paidCents: number }> {
  let covered = paidTotalCents
  return installments.map(inst => {
    const amt = inst.amountCents || 0
    if (covered >= amt) {
      covered -= amt
      return { ...inst, status: 'paid', paidCents: amt }
    } else if (covered > 0) {
      const partial = covered
      covered = 0
      return { ...inst, status: 'partial', paidCents: partial }
    }
    return { ...inst, status: 'pending', paidCents: 0 }
  })
}

/**
 * 加减法调整订单最终价格（P0-2: 替代 recalcFinalPrice 重算）
 * 在当前 final_price_cents 基础上加减 delta，不从头重算
 * 手动改价不会被后续增项操作覆盖
 */
function adjustFinalPrice(orderId: number, deltaCents: number): number {
  const order = db.prepare('SELECT final_price_cents, total_price_cents FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null } | undefined
  const currentFinal = order?.final_price_cents ?? order?.total_price_cents ?? 0
  const newFinal = currentFinal + deltaCents
  db.prepare('UPDATE orders SET final_price_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newFinal, orderId)
  return newFinal
}

/**
 * 金额格式化（分 → 元字符串，用于系统备注）
 */
function formatCents(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** 附加工作项参数 */
interface ExtraItemParams {
  name: string
  description?: string | null
  priceCents?: number
}

/**
 * 添加附加工作项
 * 校验：终态拒绝 + 数量上限 20
 * 事务：插入 → 重算 final_price → 系统备注
 * B7: 不再调 adjustInstallments（额度池模型不关心"计入哪个节点"）
 */
export function addExtraItem(orderId: number, { name, description, priceCents }: ExtraItemParams): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 终态拒绝
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  // 数量上限
  const count = (db.prepare('SELECT COUNT(*) as c FROM order_extra_items WHERE order_id = ?').get(orderId) as { c: number }).c
  if (count >= 20) {
    throw new AppError(E.EXTRA_ITEM_LIMIT)
  }

  const cents = priceCents ?? 0

  return db.transaction(() => {
      db.prepare('INSERT INTO order_extra_items (order_id, name, description, price_cents) VALUES (?, ?, ?, ?)')
        .run(orderId, name, description || null, cents)

      // P0-2: 加减法调整最终价格（不重算，保护手动改价）
      const finalCents = adjustFinalPrice(orderId, cents)

      // v0.31 F4: 加钱后节点应收联动
      recalcInstallmentAmounts(orderId)

      // 系统备注
      const priceStr = cents > 0 ? `+${formatCents(cents)}` : '（不计费）'
      let noteContent = `📎 附加工作项「${name}」${priceStr}`
      const paidTotal = order.paid_total_cents ?? 0
      if (paidTotal >= finalCents) {
        noteContent += '（已付清订单追加，线下结算）'
      }
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
        .run(orderId, noteContent)

      return getOrder(orderId)
    })()
}

/** 附加工作项行 */
interface ExtraItemRow {
  id: number
  order_id: number
  name: string
  description: string | null
  price_cents: number
}

/**
 * 删除附加工作项
 * 校验：归属（item.order_id === orderId）
 * 事务：删除 → 重算 final_price → 系统备注
 * B7: 不再调 adjustInstallments
 */
export function deleteExtraItem(orderId: number, itemId: number): any {
  const item = db.prepare('SELECT * FROM order_extra_items WHERE id = ? AND order_id = ?').get(itemId, orderId) as ExtraItemRow | undefined
  if (!item) throw new AppError(E.NOT_FOUND, 404)

  return db.transaction(() => {
      db.prepare('DELETE FROM order_extra_items WHERE id = ?').run(itemId)

      // P0-2: 加减法调整最终价格（不重算，保护手动改价）
      const finalCents = adjustFinalPrice(orderId, -item.price_cents)

      // v0.31 F4: 移除加钱后节点应收联动
      recalcInstallmentAmounts(orderId)

      // 系统备注
      const priceStr = item.price_cents > 0 ? `-${formatCents(item.price_cents)}` : '（不计费）'
      let noteContent = `📎 移除附加工作项「${item.name}」${priceStr}`
      const order = getOrder(orderId)
      const paidTotal = order?.paid_total_cents ?? 0
      if (paidTotal >= finalCents) {
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
function generateInstallmentsForOrder(orderId: number): void {
  // 已有节点则跳过（幂等）
  const existing = (db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(orderId) as { c: number }).c
  if (existing > 0) return

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Order | undefined
  if (!order || !order.total_price_cents) return

  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as WorkflowStage[]
  const paymentStages = stages.filter(s => s.takes_payment && s.basis_points)
  if (paymentStages.length === 0) return

  const insertInst = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  paymentStages.forEach((stage, i) => {
    const amountCents = Math.round(order.total_price_cents! * stage.basis_points / 10000)
    insertInst.run(orderId, stage.name, stage.basis_points, amountCents, i)
  })
}

/**
 * 递补订单：buffer → formal
 * 排到正式队列末尾 + 生成付款节点 + 系统备注
 */
export function promoteOrder(orderId: number): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)
  if (order.queue_zone !== 'buffer') throw new AppError(E.NOT_BUFFER_ORDER)
  if (['delivered', 'cancelled'].includes(order.status)) throw new AppError(E.ORDER_FINAL_STATE)

  return db.transaction(() => {
    // 正式队列末尾
    const maxPos = db.prepare(
      `SELECT MAX(queue_position) as m FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')`
    ).get(order.artist_id) as { m: number | null } | undefined
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
export function tryAutoPromote(artistId: number): void {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
  if (!artist || !artist.auto_promote || artist.batch_limit == null) return

  const N = artist.batch_limit
  for (;;) {
    const formalCount = (db.prepare(`
      SELECT COUNT(*) as c FROM orders WHERE artist_id = ? AND queue_zone = 'formal' AND status NOT IN ('delivered', 'cancelled')
    `).get(artistId) as { c: number }).c
    if (formalCount >= N) break

    const next = db.prepare(`
      SELECT id FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
      ORDER BY queue_position ASC LIMIT 1
    `).get(artistId) as { id: number } | undefined
    if (!next) break

    promoteOrder(next.id)
  }
}

// ─── B7: 额度池收款（v0.31 F4: 节点维度增强） ───

/** 收款流水行 */
interface PaymentRow {
  id: number
  order_id: number
  installment_id: number | null
  amount_cents: number
  note: string | null
  created_at: string
  created_by: string
}

/**
 * 记录一笔收款（正数）或撤销/退款（负数）
 * 事务原子：INSERT 流水 + UPDATE paid_total_cents + UPDATE 节点 paid_cents
 * v0.31 F4: 可选 installmentId 关联到具体节点
 */
export function addPayment(orderId: number, { amountCents, note, createdBy, installmentId }: { amountCents: number; note?: string | null; createdBy?: string; installmentId?: number | null }): PaymentRow {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  if (!Number.isInteger(amountCents) || amountCents === 0) {
    throw new AppError(E.INVALID_PRICE, 400, { value: amountCents })
  }

  // 负数（撤销/退款）必须带 note
  if (amountCents < 0 && !note) {
    throw new AppError(E.VALIDATION, 400, { field: 'note', message: '撤销/退款必须填写原因' })
  }

  const currentPaid = order.paid_total_cents ?? 0
  if (currentPaid + amountCents < 0) {
    throw new AppError(E.INVALID_PRICE, 400, { value: amountCents, message: '撤销金额不能超过已收金额' })
  }

  // v0.31 F4: 校验节点归属
  if (installmentId) {
    const inst = db.prepare('SELECT * FROM order_payment_installments WHERE id = ? AND order_id = ?').get(installmentId, orderId)
    if (!inst) throw new AppError(E.NOT_FOUND, 404, { installmentId })
  }

  return db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO order_payments (order_id, installment_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(orderId, installmentId || null, amountCents, note || null, createdBy || 'artist')

    db.prepare('UPDATE orders SET paid_total_cents = paid_total_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(amountCents, orderId)

    // v0.31 F4: 更新节点 paid_cents
    if (installmentId) {
      db.prepare('UPDATE order_payment_installments SET paid_cents = paid_cents + ? WHERE id = ?')
        .run(amountCents, installmentId)
      // 自动标记已付清
      const inst = db.prepare('SELECT paid_cents, amount_cents FROM order_payment_installments WHERE id = ?').get(installmentId) as { paid_cents: number; amount_cents: number }
      if (inst.paid_cents >= inst.amount_cents) {
        db.prepare("UPDATE order_payment_installments SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(installmentId)
      }
    }

    return db.prepare('SELECT * FROM order_payments WHERE id = ?').get(result.lastInsertRowid) as PaymentRow
  })()
}

/**
 * 获取订单收款流水列表
 */
export function getPayments(orderId: number): PaymentRow[] {
  return db.prepare(
    'SELECT * FROM order_payments WHERE order_id = ? ORDER BY created_at ASC'
  ).all(orderId) as PaymentRow[]
}

/**
 * v0.31 F4: 总价变更后重算节点应收金额（按 basis_points 比例）
 * 加钱/改价后调用，保持节点金额之和 = 新总价
 */
export function recalcInstallmentAmounts(orderId: number): void {
  const order = db.prepare('SELECT final_price_cents, total_price_cents FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null } | undefined
  const totalCents = order?.final_price_cents ?? order?.total_price_cents ?? 0
  if (totalCents <= 0) return

  const installments = db.prepare(
    'SELECT id, basis_points FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId) as Array<{ id: number; basis_points: number }>
  if (installments.length === 0) return

  const update = db.prepare('UPDATE order_payment_installments SET amount_cents = ? WHERE id = ?')
  db.transaction(() => {
    for (const inst of installments) {
      const amountCents = Math.round(totalCents * inst.basis_points / 10000)
      update.run(amountCents, inst.id)
    }
  })()
}
