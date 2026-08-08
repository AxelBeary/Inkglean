import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { calculatePrice } from '../pricing/pricing.service.js'
import { calculateStylePrice } from '../pricing/style-pricing.service.js'
import type { StylePriceResult } from '../pricing/style-pricing.service.js'
import { validateDiscountCode, computeDiscountCents, incrementUsage } from '../pricing/discount.service.js'
import { allocateInitial, allocateDelta, computeLockedState, assertConservation, sumEntryDeltas } from '../pricing/pricing-engine.js'
import type { EngineInstallment, PriceEntry } from '../pricing/pricing-engine.js'
import { logActivity } from './activity-log.service.js'
import { resolvePriceCents } from '../../utils/price.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { toSqliteDate } from '../../utils/date.js'
import type { Artist, Order, WorkflowStage, PriceResult, OrderDetail, ArtistOrderRow } from '../../types/entities.js'

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
 * 画风模式报价快照
 * 格式："[日系 / 全身] 基础¥600 + 加人×2 ¥400 + 加背景 ¥150 = ¥1150 × 商用2.0 = ¥2300"
 */
function buildStyleQuoteSnapshot(sc: StylePriceResult, finalTotal: number): string {
  const parts: string[] = [`基础${formatYuan(sc.basePrice)}`]
  for (const item of sc.addonItems) {
    if (item.quantity > 1) {
      parts.push(`${item.name}×${item.quantity} ${formatYuan(item.amount)}`)
    } else {
      parts.push(`${item.name} ${formatYuan(item.amount)}`)
    }
  }
  let snapshot = `[${sc.styleName} / ${sc.sizeName}] ${parts.join(' + ')} = ${formatYuan(sc.subtotal)}`
  const factors: string[] = []
  if (sc.usageMultiplier) factors.push(`${sc.usageMultiplier.name}${sc.usageMultiplier.factor}`)
  if (sc.rushMultiplier) factors.push(`${sc.rushMultiplier.name}${sc.rushMultiplier.factor}`)
  if (factors.length > 0) {
    snapshot += ` × ${factors.join(' × ')} = ${formatYuan(sc.multiplierTotal)}`
  }
  snapshot += ` → 总价 ${formatYuan(finalTotal)}`
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
  usageMultiplierId?: number | null
  rushMultiplierId?: number | null
  discountCode?: string | null
  styleSizeId?: number | null
  styleAddons?: Array<{ styleAddonId: number; quantity?: number; optionLabel?: string }>
}

/**
 * 创建订单（客户自助 或 画师手动录入）
 * 事务包裹，防止订单号竞态
 * 支持价格计算器：倍率 → breakdown + 分期（旧增项 addons 已冻结删除，v43）
 * v0.31 F3: 折扣码（先倍率后折扣，REQ-023 已定）
 */
export function createOrder({ artistId, tierId, clientQq, clientName, description, priority, source, clientNotify, references, usageMultiplierId, rushMultiplierId, discountCode, styleSizeId, styleAddons }: CreateOrderParams): OrderDetail {
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

    // ─── 价格计算（画风模式 或 旧档位模式，互斥） ───
    if (styleSizeId && tierId) {
      throw new AppError(E.VALIDATION, 400, { reason: 'styleSizeId 与 tierId 互斥，只能传其一' })
    }
    let totalPriceCents: number | null = null
    let priceCalc: PriceResult | null = null
    let styleCalc: StylePriceResult | null = null
    if (styleSizeId) {
      // 画风模式：调 calculateStylePrice（不含折扣，折扣走下面统一逻辑）
      styleCalc = calculateStylePrice(artistId, {
        styleSizeId,
        addons: styleAddons || [],
        usageMultiplierId: usageMultiplierId || null,
        rushMultiplierId: rushMultiplierId || null,
        discountCode: null
      })
      totalPriceCents = Math.round(styleCalc.multiplierTotal * 100)
    } else if (tierId) {
      priceCalc = calculatePrice(artistId, {
        tierId,
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

    // ─── 报价快照字符串（v0.11 R2 / v0.32 画风模式） ───
    const quoteSnapshot = styleCalc
      ? buildStyleQuoteSnapshot(styleCalc, totalPriceCents != null ? totalPriceCents / 100 : 0)
      : buildQuoteSnapshot(priceCalc)

    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, tier_id, client_qq, client_name, description, priority, status, source, client_notify, queue_position, price_snapshot, total_price_cents, usage_multiplier_id, rush_multiplier_id, quote_snapshot, final_price_cents, queue_zone, discount_code_id, discount_amount_cents)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNo, artistId, tierId || null, clientQq, clientName || null,
      description || null, priority || 'medium', source || 'self',
      clientNotify ? 1 : 0, queuePosition,
      styleCalc ? styleCalc.basePrice : (priceCalc ? priceCalc.basePrice : null),
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
    if (styleCalc) {
      // 画风模式：用 'tier'/'addon' 语义兼容（避免改 CHECK 约束）
      const insertBd = db.prepare(
        'INSERT INTO order_price_breakdown (order_id, item_type, item_name, amount_cents, multiplier, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      let sortIdx = 0
      insertBd.run(orderId, 'tier', `${styleCalc.styleName} / ${styleCalc.sizeName}`, Math.round(styleCalc.basePrice * 100), 1.0, 1, sortIdx++)
      for (const item of styleCalc.addonItems) {
        insertBd.run(orderId, 'addon', item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name, Math.round(item.amount * 100), 1.0, item.quantity, sortIdx++)
      }
      if (styleCalc.usageMultiplier) {
        const umAmount = styleCalc.subtotal * (styleCalc.usageMultiplier.factor - 1) * (styleCalc.rushMultiplier?.factor ?? 1)
        insertBd.run(orderId, 'usage', `${styleCalc.usageMultiplier.name} ×${styleCalc.usageMultiplier.factor}`, Math.round(umAmount * 100), styleCalc.usageMultiplier.factor, 1, sortIdx++)
      }
      if (styleCalc.rushMultiplier) {
        const rmAmount = styleCalc.subtotal * (styleCalc.usageMultiplier?.factor ?? 1) * (styleCalc.rushMultiplier.factor - 1)
        insertBd.run(orderId, 'rush', `${styleCalc.rushMultiplier.name} ×${styleCalc.rushMultiplier.factor}`, Math.round(rmAmount * 100), styleCalc.rushMultiplier.factor, 1, sortIdx++)
      }
    } else if (priceCalc && priceCalc.breakdown.length > 0) {
      const insertBd = db.prepare(
        'INSERT INTO order_price_breakdown (order_id, item_type, item_name, amount_cents, multiplier, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      priceCalc.breakdown.forEach((item, i) => {
        insertBd.run(orderId, item.type, item.name, Math.round(item.amount * 100), item.multiplier, item.quantity, i)
      })
    }

    // ─── 生成分期计划（SPEC-004: 缓冲订单不生成付款节点） ───
    // REQ-025 第二阶段：统一走引擎 allocateInitial（合并原画风/priceCalc 两处内联分支——
    // 两者分期来源同为 artist_workflow_stages takes_payment 节点；末节点吸收舍入尾差，BUG-4 语义）
    // 同时写 base 条目（R1：条目账本是总价真相源）
    if (queueZone === 'formal' && totalPriceCents != null && totalPriceCents > 0) {
      const stages = db.prepare(
        'SELECT name, basis_points FROM artist_workflow_stages WHERE artist_id = ? AND takes_payment = 1 ORDER BY sort_order ASC'
      ).all(artistId) as Array<{ name: string; basis_points: number }>
      if (stages.length > 0) {
        const engineNodes = stages.map((s, i) => ({ sortOrder: i, basisPoints: s.basis_points, amountCents: 0 }))
        const amounts = allocateInitial(engineNodes, totalPriceCents)
        const insertInst = db.prepare(
          'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
        )
        stages.forEach((s, i) => {
          insertInst.run(orderId, s.name, s.basis_points, amounts[i], i)
        })
      }
      appendPriceEntry(orderId, 'base', totalPriceCents, '初始报价', 'system')
    }

    // REQ-025 R11: 守恒自检（初始分配后 Σ节点价 ≡ base 条目，Σbp≠100% 由守卫跳过）
    checkOrderConservation(orderId)

    return getOrder(orderId)!
  })()
}

/**
 * 获取单个订单（含关联数据）
 * R18: clientOnly=true 时 references 只返回 source='client'（客户查询页不泄露画师图）
 */
export function getOrder(orderId: number, { clientOnly = false }: { clientOnly?: boolean } = {}): OrderDetail | null {
  const order = db.prepare(`
    SELECT o.*, a.name as artist_name, a.subdomain as artist_subdomain, t.name as tier_name, t.price as tier_price, t.work_days as tier_work_days
    FROM orders o
    JOIN artists a ON o.artist_id = a.id
    LEFT JOIN price_tiers t ON o.tier_id = t.id
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
 * 更新订单状态（带状态机校验）
 * 事务包裹，防止中途崩溃留下不一致状态
 */
export function updateOrderStatus(orderId: number, newStatus: string): OrderDetail {
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

    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'status_change', 'artist', { from: order.status, to: newStatus })

    if (['done', 'delivered'].includes(newStatus)) {
      db.prepare('UPDATE orders SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP) WHERE id = ?')
        .run(orderId)
    }

    if (['delivered', 'cancelled'].includes(newStatus)) {
      compactQueue(order.artist_id)
      // SPEC-004: 正式区释放名额后尝试自动递补
      tryAutoPromote(order.artist_id)
    }

    return getOrder(orderId)!
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
export function updateDeadline(orderId: number, deadline: string | null): OrderDetail {
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

  return getOrder(orderId)!
}

/**
 * v0.26 B: 更新订单开工日
 * startDate: 'YYYY-MM-DD' 字符串 或 null（清除）
 */
export function updateStartDate(orderId: number, startDate: string | null): OrderDetail {
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

  return getOrder(orderId)!
}

/**
 * 添加订单备注
 * R19: 支持可选附图 imagePath（notes/{artistId}/ 目录）
 */
export function addNote(orderId: number, content: string, createdBy: string = 'artist', imagePath: string | null = null): OrderDetail {
  db.prepare('INSERT INTO order_notes (order_id, content, created_by, image_path) VALUES (?, ?, ?, ?)')
    .run(orderId, content, createdBy, imagePath)
  // v0.31 REQ-021 F1: 操作日志（仅画师备注，系统备注不记）
  if (createdBy !== 'system') {
    logActivity(orderId, 'note_update', createdBy, { action: 'add', hasImage: !!imagePath })
  }
  return getOrder(orderId)!
}

/**
 * 删除订单备注（v0.15 R46）
 * 系统备注（created_by='system'）不可删除
 * 带图备注删除后，图片由 GC 孤儿回收机制自动清理（app.js gcUploads 已收集 order_notes.image_path）
 */
export function deleteNote(orderId: number, noteId: number): OrderDetail {
  const note = db.prepare('SELECT * FROM order_notes WHERE id = ? AND order_id = ?').get(noteId, orderId) as { created_by: string } | undefined
  if (!note) throw new AppError(E.NOTE_NOT_FOUND, 404)
  if (note.created_by === 'system') throw new AppError(E.SYSTEM_NOTE_PROTECTED, 403)

  db.prepare('DELETE FROM order_notes WHERE id = ?').run(noteId)
  // v0.31 REQ-021 F1: 操作日志
  logActivity(orderId, 'note_update', 'artist', { action: 'delete', noteId })
  return getOrder(orderId)!
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
    WHERE artist_id = ? AND ${ACTIVE_ORDER_SQL}
    ORDER BY queue_position ASC
  `).all(order.artist_id) as Array<{ id: number }>
  const position = queue.findIndex(o => o.id === order.id) + 1

  return { ...base, position, total: queue.length }
}

/**
 * 客户凭 QQ 号查询在某画师处的所有订单（"不知道订单号"场景）
 */
export function getClientOrdersByQq(artistId: number, clientQq: string): Array<{ order_no: string; status: string; created_at: string; updated_at: string; tier_name: string | null }> {
  return db.prepare(`
    SELECT o.order_no, o.status, o.created_at, o.updated_at,
           t.name as tier_name
    FROM orders o
    LEFT JOIN price_tiers t ON o.tier_id = t.id
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

// ─── v0.11 R2: 最终价格修改 ───

/**
 * 修改订单最终价格
 * 校验：正整数（分），上限 99999999（999999.99 元）
 * 改价时自动追加订单备注 "最终价格从 ¥A 改为 ¥B"
 */
export function updateFinalPrice(orderId: number, finalPriceCents: number, quoteSnapshot?: string | null): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // v0.37 终态守卫：delivered/cancelled 禁止改价
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  // REQ-025 R13: done = 半终态——禁止无痕改总价，改价必须走条目（加/减附加项）
  if (order.status === 'done') {
    throw new AppError(E.PRICE_CHANGE_AFTER_DONE)
  }

  // 校验：正整数，1 ~ 99999999
  if (!Number.isInteger(finalPriceCents) || finalPriceCents < 1 || finalPriceCents > 99999999) {
    throw new AppError(E.INVALID_PRICE, 400, { value: finalPriceCents })
  }

  return db.transaction(() => {
    // 计算旧价格（用于备注）
    const oldCents = resolvePriceCents(order)

    // REQ-025 第二阶段：改价条目化（R2 入口 A）——存量无账本订单先按旧价补 base 条目
    //（必须在 UPDATE final_price 之前，否则补录的 base 会取到新价）
    ensureBaseEntry(orderId)

    db.prepare('UPDATE orders SET final_price_cents = ?, quote_snapshot = COALESCE(?, quote_snapshot), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(finalPriceCents, quoteSnapshot ?? null, orderId)

    // manual_adjust 条目 delta = 新总价 − 当前总价；条目由 applyDeltaToInstallments 按去向落账；
    // 节点联动只摊未锁节点（allocateDelta），已锁节点价不再变（R4/R5，替代 recalcInstallmentAmounts）
    const deltaCents = finalPriceCents - (oldCents ?? 0)
    if (deltaCents !== 0) {
      applyDeltaToInstallments(orderId, deltaCents, 'manual_adjust', '改价')
    }

    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'price_change', 'artist', { oldCents, newCents: finalPriceCents, reason: quoteSnapshot || null })

    // 自动追加备注
    const oldStr = oldCents != null ? `¥${(oldCents / 100).toFixed(2)}` : '未定价'
    const newStr = `¥${(finalPriceCents / 100).toFixed(2)}`
    db.prepare('INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, ?)')
      .run(orderId, `最终价格从 ${oldStr} 改为 ${newStr}`, 'system')

    // REQ-025 R11: 守恒自检（不守恒即抛 PRICING_CONSERVATION 回滚）
    checkOrderConservation(orderId)

    return getOrder(orderId)!
  })()
}

// ─── SPEC-003: 附加工作项 ───

/**
 * 获取订单付款节点（客户进度页 + 画师端节点收款）
 * v0.36 BUG-1 方案 b: 改读额度池 orders.paid_total_cents，按节点金额顺序推算每期状态，
 * 不再读 order_payment_installments.paid_cents（旧节点模型残留，写路径暂保留）。
 * paid: 完全覆盖 | partial: 部分覆盖 | pending: 未覆盖
 * 撤销回冲自然生效：负流水 → paid_total_cents 减少 → 状态自动回退，无需额外代码
 */
export function getOrderInstallments(orderId: number): Array<{ id: number; name: string; amountCents: number; paidCents: number; remainingCents: number; status: string }> {
  const rows = db.prepare(
    'SELECT id, label as name, amount_cents as amountCents FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId) as Array<{ id: number; name: string; amountCents: number }>
  const orderRow = db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(orderId) as { paid_total_cents: number | null } | undefined
  let covered = orderRow?.paid_total_cents ?? 0
  return rows.map(r => {
    const amt = r.amountCents || 0
    let paidCents = 0
    let status = 'pending'
    if (covered >= amt) {
      covered -= amt
      paidCents = amt
      status = 'paid'
    } else if (covered > 0) {
      paidCents = covered
      covered = 0
      status = 'partial'
    }
    return {
      id: r.id,
      name: r.name,
      amountCents: amt,
      paidCents,
      remainingCents: Math.max(0, amt - paidCents),
      status
    }
  })
}

/**
 * 订单收款明细（客户可见字段——只返回金额/备注/时间，不含 created_by 等内部信息）
 * 按创建时间升序，与额度池收款流水一致；负数=退款（前端按正负展示）
 */
export function getOrderPayments(orderId: number): Array<{ id: number; amountCents: number; note: string | null; createdAt: string }> {
  const rows = db.prepare(
    `SELECT id, amount_cents, note, created_at FROM order_payments WHERE order_id = ? ORDER BY created_at ASC`
  ).all(orderId) as Array<{ id: number; amount_cents: number; note: string | null; created_at: string }>
  return rows.map(r => ({
    id: r.id,
    amountCents: r.amount_cents,
    note: r.note,
    createdAt: r.created_at
  }))
}

/**
 * 加减法调整订单最终价格（P0-2: 替代 recalcFinalPrice 重算）
 * 在当前 final_price_cents 基础上加减 delta，不从头重算
 * 手动改价不会被后续增项操作覆盖
 */
function adjustFinalPrice(orderId: number, deltaCents: number): number {
  const order = db.prepare('SELECT final_price_cents, total_price_cents, price_snapshot FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null; price_snapshot: number | null } | undefined
  const currentFinal = order ? (resolvePriceCents(order) ?? 0) : 0
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

// ─── REQ-025 第二阶段：计价引擎接线（条目账本 + 锁价 + 守恒） ───

/** 读取订单价格条目账本（按写入顺序） */
export function getPriceEntries(orderId: number): PriceEntry[] {
  const rows = db.prepare(
    'SELECT id, order_id, type, delta_cents, name, note, created_by, created_at FROM order_price_entries WHERE order_id = ? ORDER BY id ASC'
  ).all(orderId) as Array<{ id: number; order_id: number; type: PriceEntry['type']; delta_cents: number; name: string | null; note: string | null; created_by: string; created_at: string }>
  return rows.map(r => ({
    id: r.id,
    orderId: r.order_id,
    type: r.type,
    deltaCents: r.delta_cents,
    name: r.name,
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at
  }))
}

/** 追加一条价格条目（R1：只追加不覆盖不删除） */
function appendPriceEntry(orderId: number, type: PriceEntry['type'], deltaCents: number, name?: string | null, createdBy = 'artist'): void {
  db.prepare(
    'INSERT INTO order_price_entries (order_id, type, delta_cents, name, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(orderId, type, deltaCents, name ?? null, createdBy)
}

/**
 * 存量订单懒回填 base 条目：账本为空时按当前价格补一条 base。
 * 守恒挂载的前提是账本完整；无条目订单（旧数据/直插订单）首次价格变动时触发。
 */
function ensureBaseEntry(orderId: number): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM order_price_entries WHERE order_id = ?').get(orderId) as { c: number }).c
  if (count > 0) return
  const order = db.prepare('SELECT final_price_cents, total_price_cents, price_snapshot FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null; price_snapshot: number | null } | undefined
  const base = order ? resolvePriceCents(order) : null
  if (base == null || base <= 0) return
  appendPriceEntry(orderId, 'base', base, '初始报价（补录）', 'system')
}

/**
 * 读取订单节点的引擎视图（含锁定标记与推导已收）。
 * 已收一律从 orders.paid_total_cents 顺序填充推导（不读 paid_cents 旧残留列，R7）。
 * 返回按 sort_order 升序；lockedFlags 与 insts 同序。
 */
function readInstallmentState(orderId: number): { insts: EngineInstallment[]; lockedFlags: boolean[] } {
  const rows = db.prepare(
    'SELECT id, label, basis_points, amount_cents, locked FROM order_payment_installments WHERE order_id = ? ORDER BY sort_order ASC'
  ).all(orderId) as Array<{ id: number; label: string; basis_points: number; amount_cents: number | null; locked: number }>
  const order = db.prepare('SELECT paid_total_cents FROM orders WHERE id = ?').get(orderId) as { paid_total_cents: number | null } | undefined
  const sumAmounts = rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0)
  let covered = Math.min(order?.paid_total_cents ?? 0, sumAmounts)
  const insts: EngineInstallment[] = rows.map((r, i) => {
    const amt = r.amount_cents ?? 0
    const take = Math.max(0, Math.min(covered, amt))
    covered -= take
    return { id: r.id, label: r.label, sortOrder: i, basisPoints: r.basis_points, amountCents: amt, paidCents: take }
  })
  return { insts, lockedFlags: rows.map(r => r.locked === 1) }
}

/**
 * 推导已完成的最后收款节点下标（computeLockedState 的 completedStageIndex 入参）。
 * done/delivered → 全部阶段完成；否则 = 当前阶段之前的收款节点数 − 1。
 */
function getCompletedPaymentStageIndex(order: { artist_id: number; current_stage_id: number | null; status: string }): number {
  const stages = db.prepare(
    'SELECT id, sort_order, takes_payment FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as Array<{ id: number; sort_order: number; takes_payment: number }>
  const paymentStages = stages.filter(s => s.takes_payment === 1)
  if (paymentStages.length === 0) return -1
  if (['done', 'delivered'].includes(order.status)) return paymentStages.length - 1
  if (order.current_stage_id == null) return -1
  const currentStage = stages.find(s => s.id === order.current_stage_id)
  if (!currentStage) return -1
  const completedCount = paymentStages.filter(ps => ps.sort_order < currentStage.sort_order).length
  return completedCount - 1
}

/**
 * 把一笔价格 delta 应用到节点并落条目（替代 recalcInstallmentAmounts，R5/R6/R10）。
 *
 * 条目账本是总价真相源（Σ 条目 ≡ final_price_cents），因此条目由本函数统一写入，
 * 按 delta 去向决定类型，绝不双重记账：
 *   - 摊进未锁节点 → 写原因条目（entryType：manual_adjust/extra_item/refund_item）
 *   - 全锁（R10）→ 写 extra_charge_after_close（正）/ extra_refund_after_close（负），
 *     不再写原因条目（额外项条目本身即审计留痕，name 保留原操作名）
 *
 * 流程：读库锁定状态 → computeLockedState（完成/付清/回退不解锁）→ allocateDelta 只摊未锁节点
 * → 写回 amount_cents + locked + locked_reason。
 */
function applyDeltaToInstallments(orderId: number, deltaCents: number, entryType: PriceEntry['type'], entryName: string): void {
  if (deltaCents === 0) return
  const { insts, lockedFlags: prevLocked } = readInstallmentState(orderId)
  const order = db.prepare('SELECT paid_total_cents, current_stage_id, status, artist_id FROM orders WHERE id = ?').get(orderId) as { paid_total_cents: number | null; current_stage_id: number | null; status: string; artist_id: number } | undefined
  if (!order) return

  // 无节点订单：delta 只改总价，落原因条目即可（无分摊对象）
  if (insts.length === 0) {
    appendPriceEntry(orderId, entryType, deltaCents, entryName)
    return
  }

  const state = computeLockedState(insts, order.paid_total_cents ?? 0, getCompletedPaymentStageIndex(order), prevLocked)
  const res = allocateDelta(insts, state.lockedFlags, deltaCents)
  const update = db.prepare('UPDATE order_payment_installments SET amount_cents = ?, locked = ?, locked_reason = ? WHERE id = ?')
  insts.forEach((inst, i) => {
    update.run(res.amountsCents[i], state.lockedFlags[i] ? 1 : 0, state.lockedFlags[i] ? state.reasons[i] : null, inst.id)
  })

  // 条目落账（与 delta 去向一一对应，不双重记账）
  if (res.extraChargeCents > 0) {
    appendPriceEntry(orderId, 'extra_charge_after_close', res.extraChargeCents, entryName, 'system')
  } else if (res.extraRefundCents > 0) {
    appendPriceEntry(orderId, 'extra_refund_after_close', -res.extraRefundCents, entryName, 'system')
  } else {
    appendPriceEntry(orderId, entryType, deltaCents, entryName)
  }
}

/**
 * 刷新节点锁定状态（完成即锁 / 付清即锁，R4；回退不解锁由 prevLocked 保证）。
 * advanceStage（完成）与 addPayment（付清）后调用；只写 locked/locked_reason，不动节点价。
 */
export function refreshInstallmentLocks(orderId: number): void {
  const { insts, lockedFlags: prevLocked } = readInstallmentState(orderId)
  if (insts.length === 0) return
  const order = db.prepare('SELECT paid_total_cents, current_stage_id, status, artist_id FROM orders WHERE id = ?').get(orderId) as { paid_total_cents: number | null; current_stage_id: number | null; status: string; artist_id: number } | undefined
  if (!order) return
  const state = computeLockedState(insts, order.paid_total_cents ?? 0, getCompletedPaymentStageIndex(order), prevLocked)
  const update = db.prepare('UPDATE order_payment_installments SET locked = ?, locked_reason = ? WHERE id = ?')
  insts.forEach((inst, i) => {
    update.run(state.lockedFlags[i] ? 1 : 0, state.lockedFlags[i] ? state.reasons[i] : null, inst.id)
  })
}

/**
 * 守恒挂载（R11）：变动出口前自检，不守恒即抛 PRICING_CONSERVATION（事务回滚）。
 * A1 总价 = Σ 节点价 + 额外应收 − 额外应退（额外项取条目总额，与支付状态无关）
 * A2 总价 − 已收 = Σ 节点待收 + 额外应收 − 额外应退
 *    已收超出 Σ 节点价的部分（纯超付）全额压到尾款待收变负，与额外应收不做冲抵——
 *    数学上 A1/A2 同解（Σ待收 ≡ Σ节点价 − 已收），两断言同时成立。
 * A3 追溯链需要额外持久化字段（不在本阶段 schema 范围），服务层不校验；条目只追加本身保证可追溯。
 *
 * 适用范围：仅 Σ basis_points = 10000（比例和 100%）的订单——此时 A1 方程才有解
 * （R3：比例之和应为 100%，正式工作流由 validateInstallments I2 SUM_NOT_100 强制）。
 * Σbp≠100% 的非常规配置（人工数据/历史残留）Σ节点价恒小于总价，A1 无解，跳过断言。
 * 无节点订单（缓冲区/无工作流）无守恒对象，直接通过。
 */
export function checkOrderConservation(orderId: number): void {
  const { insts } = readInstallmentState(orderId)
  if (insts.length === 0) return
  const bpSum = insts.reduce((s, i) => s + i.basisPoints, 0)
  if (bpSum !== 10000) return
  const order = db.prepare('SELECT final_price_cents, total_price_cents, price_snapshot, paid_total_cents FROM orders WHERE id = ?').get(orderId) as { final_price_cents: number | null; total_price_cents: number | null; price_snapshot: number | null; paid_total_cents: number | null } | undefined
  if (!order) return
  const entries = getPriceEntries(orderId)
  const totalCents = entries.length > 0 ? sumEntryDeltas(entries) : (resolvePriceCents(order) ?? 0)
  const nodeAmountsCents = insts.map(i => i.amountCents)
  const sumAmounts = nodeAmountsCents.reduce((s, v) => s + v, 0)
  const extraChargeCents = entries.filter(e => e.type === 'extra_charge_after_close').reduce((s, e) => s + e.deltaCents, 0)
  const extraRefundCents = -entries.filter(e => e.type === 'extra_refund_after_close').reduce((s, e) => s + e.deltaCents, 0)
  const paidTotal = order.paid_total_cents ?? 0
  // 节点待收：顺序填充（每节点至多填满），超出 Σ 节点价的纯超付压到尾款待收（变负，可退）
  const nodeRemainingCents: number[] = []
  let covered = Math.min(paidTotal, sumAmounts)
  for (const amt of nodeAmountsCents) {
    const take = Math.max(0, Math.min(covered, amt))
    nodeRemainingCents.push(amt - take)
    covered -= take
  }
  const pureOverpay = Math.max(0, paidTotal - sumAmounts)
  if (pureOverpay > 0) nodeRemainingCents[nodeRemainingCents.length - 1] -= pureOverpay
  assertConservation({
    totalCents,
    paidTotalCents: paidTotal,
    nodeAmountsCents,
    nodeRemainingCents,
    extraChargeCents,
    extraRefundCents
  })
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
export function addExtraItem(orderId: number, { name, description, priceCents }: ExtraItemParams): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  // 终态拒绝（R13: done 半终态允许加/减项，只拦 delivered/cancelled）
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  const cents = priceCents ?? 0

  // R13: 负增项（减价路径）守卫——减后总价不得为负
  if (cents < 0) {
    const currentFinal = resolvePriceCents(order) ?? 0
    if (currentFinal + cents < 0) {
      throw new AppError(E.INVALID_PRICE, 400, { value: cents, message: '减价金额不得超过当前总价' })
    }
  }

  // 数量上限
  const count = (db.prepare('SELECT COUNT(*) as c FROM order_extra_items WHERE order_id = ?').get(orderId) as { c: number }).c
  if (count >= 20) {
    throw new AppError(E.EXTRA_ITEM_LIMIT)
  }

  return db.transaction(() => {
      db.prepare('INSERT INTO order_extra_items (order_id, name, description, price_cents) VALUES (?, ?, ?, ?)')
        .run(orderId, name, description || null, cents)

      // REQ-025 第二阶段：存量无账本订单先按旧价补 base 条目
      //（必须在 adjustFinalPrice 之前，否则补录的 base 会取到加项后的新价）
      ensureBaseEntry(orderId)

      // P0-2: 加减法调整最终价格（不重算，保护手动改价）
      const finalCents = adjustFinalPrice(orderId, cents)

      // 增项双写（R1/R2 入口 B）——order_extra_items 保留（UI 层）；
      // 条目账本由 applyDeltaToInstallments 按去向落账（正=extra_item / 负=refund_item / 全锁=额外项）；
      // 节点联动只摊未锁节点（替代 recalcInstallmentAmounts）
      if (cents !== 0) {
        applyDeltaToInstallments(orderId, cents, cents > 0 ? 'extra_item' : 'refund_item', name)
      }

      // v0.31 REQ-021 F1: 操作日志
      logActivity(orderId, 'extra_item', 'artist', { action: 'add', name, priceCents: cents })

      // 系统备注
      const priceStr = cents > 0 ? `+${formatCents(cents)}` : cents < 0 ? `-${formatCents(-cents)}` : '（不计费）'
      let noteContent = `📎 附加工作项「${name}」${priceStr}`
      const paidTotal = order.paid_total_cents ?? 0
      if (paidTotal >= finalCents) {
        noteContent += '（已付清订单追加，线下结算）'
      }
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
        .run(orderId, noteContent)

      // REQ-025 R11: 守恒自检
      checkOrderConservation(orderId)

      return getOrder(orderId)!
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
export function deleteExtraItem(orderId: number, itemId: number): OrderDetail {
  const item = db.prepare('SELECT * FROM order_extra_items WHERE id = ? AND order_id = ?').get(itemId, orderId) as ExtraItemRow | undefined
  if (!item) throw new AppError(E.NOT_FOUND, 404)

  // v0.37 终态守卫：delivered/cancelled 禁止删除附加项（对齐 addExtraItem；done 不拦——减价窗口期，待 REQ-025 第二阶段）
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)
  if (['delivered', 'cancelled'].includes(order.status)) {
    throw new AppError(E.ORDER_FINAL_STATE)
  }

  return db.transaction(() => {
      db.prepare('DELETE FROM order_extra_items WHERE id = ?').run(itemId)

      // REQ-025 第二阶段：存量无账本订单先按旧价补 base 条目（必须在 adjustFinalPrice 之前）
      ensureBaseEntry(orderId)

      // P0-2: 加减法调整最终价格（不重算，保护手动改价）
      const finalCents = adjustFinalPrice(orderId, -item.price_cents)

      // 删项 = 冲正条目（R1：条目只追加不物理删）；UI 层 order_extra_items 仍物理删
      // 条目账本由 applyDeltaToInstallments 按去向落账（refund_item / 全锁=额外应退）；
      // 节点联动只摊未锁节点（替代 recalcInstallmentAmounts）
      if (item.price_cents !== 0) {
        applyDeltaToInstallments(orderId, -item.price_cents, 'refund_item', `移除「${item.name}」`)
      }

      // v0.31 REQ-021 F1: 操作日志
      logActivity(orderId, 'extra_item', 'artist', { action: 'delete', name: item.name, priceCents: item.price_cents })

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

      // REQ-025 R11: 守恒自检
      checkOrderConservation(orderId)

      return getOrder(orderId)!
    })()
}

// ─── SPEC-004: 名额与缓冲系统 ───

/**
 * 为订单生成付款节点（按订单当前报价生成）
 * 从工作流模板的收款节点生成；仅正式区订单（对齐 createOrder 的生成条件，
 * SPEC-004: 缓冲订单不生成付款节点；promoteOrder 先更新 zone 再调本函数，不受影响）
 * 幂等：已有节点则跳过
 * 调用方：promoteOrder（递补时）、demo-data 脚本（直插订单补分期）
 */
export function generateInstallmentsForOrder(orderId: number): void {
  // 已有节点则跳过（幂等）
  const existing = (db.prepare('SELECT COUNT(*) as c FROM order_payment_installments WHERE order_id = ?').get(orderId) as { c: number }).c
  if (existing > 0) return

  // Order 实体类型未收录 final_price_cents（后加列），SELECT * 已取出，此处补结构断言
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as (Order & { final_price_cents: number | null }) | undefined
  if (!order) return
  if (order.queue_zone !== 'formal') return
  // REQ-025 第二阶段：按当前有效总价生成（final 优先——缓冲期改过价的订单
  // final≠total，节点必须与条目账本 Σ 闭合，否则递补守恒 A1 失败）
  const totalCents = resolvePriceCents(order)
  if (!totalCents) return

  const stages = db.prepare(
    'SELECT * FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
  ).all(order.artist_id) as WorkflowStage[]
  const paymentStages = stages.filter(s => s.takes_payment && s.basis_points)
  if (paymentStages.length === 0) return

  // REQ-025 第二阶段：走引擎 allocateInitial（末节点吸收舍入尾差——守恒 A1 的前提；
  // 原内联 Math.round 各自取整会产生 ±1~2 分漂移导致守恒断言失败）
  const engineNodes = paymentStages.map((s, i) => ({ sortOrder: i, basisPoints: s.basis_points as number, amountCents: 0 }))
  const amounts = allocateInitial(engineNodes, totalCents)
  const insertInst = db.prepare(
    'INSERT INTO order_payment_installments (order_id, label, basis_points, amount_cents, sort_order) VALUES (?, ?, ?, ?, ?)'
  )
  paymentStages.forEach((stage, i) => {
    insertInst.run(orderId, stage.name, stage.basis_points, amounts[i], i)
  })
}

/**
 * 递补订单：buffer → formal
 * 排到正式队列末尾 + 生成付款节点 + 系统备注
 */
export function promoteOrder(orderId: number): OrderDetail {
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

    // REQ-025 R11: 守恒自检（生成节点后 Σ节点价 必须与账本/总价闭合）
    checkOrderConservation(orderId)

    return getOrder(orderId)!
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

    // REQ-025 R4: 付清即锁——收款后按 paid_total 推导刷新节点锁定状态
    //（节点已收一律从 paid_total 顺序推导，不依赖 paid_cents 旧列，R7）
    refreshInstallmentLocks(orderId)

    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'payment', createdBy || 'artist', { amountCents, note: note || null, installmentId: installmentId || null })

    // REQ-025 R11: 守恒自检（收款不改总价/节点价，A2 由待收推导自然闭合；挂载防脏数据）
    checkOrderConservation(orderId)

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

// REQ-025 第二阶段（R12 不留双轨）：recalcInstallmentAmounts 已退役删除——
// 全部改价/增项链路改走引擎 allocateDelta（只摊未锁节点，见 applyDeltaToInstallments）。

