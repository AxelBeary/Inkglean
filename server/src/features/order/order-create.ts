import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { calculateStylePrice } from '../pricing/style-pricing.service.js'
import type { StylePriceResult } from '../pricing/style-pricing.service.js'
import { validateDiscountCode, computeDiscountCents, incrementUsage } from '../pricing/discount.service.js'
import { allocateInitial } from '../pricing/pricing-engine.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import type { Artist, OrderDetail } from '../../types/entities.js'
import { generateCustomerToken, getOrder, hashCustomerToken } from './order-read.js'
import { appendPriceEntry, checkOrderConservation } from './order-pricing.js'
import { MAX_MONEY_CENTS } from './order-limits.js'

// ============================================
// 订单服务 - 下单子域（从 order.service.ts 拆出）
// ============================================

// 815 审计拍板 #2（用户亲裁 2026-08-15）：下单总价上限统一为 100 万元，
// 与改价/增项/收款共用 MAX_MONEY_CENTS（order-limits.ts）；此前下单约 1 亿、其余约 100 万。

// ─── 报价快照字符串生成（v0.11 R2） ───

/** 金额格式化：整数不带小数，非整数保留两位（入参为分，报价快照用） */
function formatSnapshotCents(cents: number): string {
  const yuan = cents / 100
  return Number.isInteger(yuan) ? `¥${yuan}` : `¥${yuan.toFixed(2)}`
}

/**
 * SPEC-PRICE-2 报价快照（与引擎公式逐项对应）
 * 格式："[日系 / 全身] 基础¥600 + 加人×2 ¥160 + 背景+10% ¥60 = ¥820 × 商用+50% × 加急+100% = ¥2460 → 总价 ¥2214"
 */
function buildStyleQuoteSnapshot(sc: StylePriceResult, finalTotalCents: number): string {
  const parts: string[] = [`基础${formatSnapshotCents(sc.baseCents)}`]
  for (const item of sc.fixedAddonItems) {
    parts.push(item.quantity > 1
      ? `${item.name}×${item.quantity} ${formatSnapshotCents(item.amountCents)}`
      : `${item.name} ${formatSnapshotCents(item.amountCents)}`)
  }
  for (const item of sc.percentAddonItems) {
    parts.push(item.quantity > 1
      ? `${item.name}+${item.percent}%×${item.quantity} ${formatSnapshotCents(item.amountCents)}`
      : `${item.name}+${item.percent}% ${formatSnapshotCents(item.amountCents)}`)
  }
  let snapshot = `[${sc.styleName} / ${sc.sizeName}] ${parts.join(' + ')} = ${formatSnapshotCents(sc.subtotalCents)}`
  const factors: string[] = []
  if (sc.usage) factors.push(`${sc.usage.name}+${sc.usage.percent}%`)
  if (sc.rush) factors.push(`${sc.rush.name}+${sc.rush.percent}%`)
  if (factors.length > 0) {
    snapshot += ` × ${factors.join(' × ')} = ${formatSnapshotCents(sc.afterMultipliersCents)}`
  }
  snapshot += ` → 总价 ${formatSnapshotCents(finalTotalCents)}`
  return snapshot
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
      // audit-a R-12: parseInt 对超长数字串返回 Infinity、对非数字返回 NaN——
      // 两者都按 0 处理（下一序号 1），避免拼出非法/重复订单号撞 UNIQUE 报 500
      if (Number.isFinite(num)) seq = num + 1
    }
  }

  const SEQ_PAD_THRESHOLD = 999
  const seqStr = seq <= SEQ_PAD_THRESHOLD ? String(seq).padStart(3, '0') : String(seq)
  return `${artistCode}-${seqStr}`
}

/** createOrder 参数（SPEC-PRICE-2：唯一计价路径 = 画风尺寸 + 增项选择，含用途/加急） */
export interface CreateOrderParams {
  artistId: number
  clientQq: string
  clientName?: string | null
  description?: string | null
  priority?: string
  source?: string
  clientNotify?: boolean
  references?: string[]
  discountCode?: string | null
  styleSizeId?: number | null
  styleAddons?: Array<{ styleAddonId: number; quantity?: number }>
  // F-10（P2-13 后端侧）: 已解析的匿名凭证 id（客户上传参考图的归属者；无参考图/画师手动录单为 null）
  anonId?: number | null
}

/**
 * 创建订单（客户自助 或 画师手动录入）
 * 事务包裹，防止订单号竞态
 * SPEC-PRICE-2：价格全链路唯一引擎 calculateStylePrice（整数分）；折扣最后应用
 * F1 围剿：事务内生成客户访问令牌（144bit，一次下发），只存 sha256 哈希。
 * 返回对象附带 customerToken 明文（仅调用方可拿到一次）；订单号保持 CODE-xxx
 * 人类友好，安全由令牌承担（用户拍板）。
 */
export function createOrder({ artistId, clientQq, clientName, description, priority, source, clientNotify, references, discountCode, styleSizeId, styleAddons, anonId }: CreateOrderParams): OrderDetail & { customerToken: string } {
  return db.transaction(() => {
    const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND)

    const code = artist.artist_code || artist.subdomain.toUpperCase()
    const orderNo = generateOrderNo(artistId, code)
    // F1 围剿：令牌在事务内生成并哈希入库；明文仅随本次返回值出现一次
    const customerToken = generateCustomerToken()
    const customerTokenHash = hashCustomerToken(customerToken)

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

    // ─── 价格计算（SPEC-PRICE-2 唯一路径：画风尺寸 + 增项；无价格录入时 styleSizeId 为空） ───
    let totalPriceCents: number | null = null
    let styleCalc: StylePriceResult | null = null
    if (styleSizeId) {
      // 折扣在下方统一处理（引擎 discountCode 传 null，保证折扣链路只有一处）
      styleCalc = calculateStylePrice(artistId, {
        styleSizeId,
        addons: styleAddons || [],
        discountCode: null
      })
      totalPriceCents = styleCalc.afterMultipliersCents
    }

    // ─── v0.31 F3: 折扣码（先倍率后折扣，REQ-023 已定） ───
    let discountCodeId: number | null = null
    let discountAmountCents = 0
    if (discountCode && totalPriceCents != null && totalPriceCents > 0) {
      const dc = validateDiscountCode(artistId, discountCode)
      discountAmountCents = computeDiscountCents(dc, totalPriceCents)
      discountCodeId = dc.id
      totalPriceCents = totalPriceCents - discountAmountCents
    } else if (discountCode && (totalPriceCents == null || totalPriceCents <= 0)) {
      // audit-a P3-4: 自定义单（无画风尺寸）没有计价基准——客户填了合法折扣码却静默无效
      // 是坏体验，显式拒绝并说明原因
      throw new AppError(E.VALIDATION, 400, { field: 'discountCode', message: '当前订单无可计价基准，折扣码不可用' })
    }

    // audit-a R-10: 计价结果封顶——引擎返回后、落库前校验，防止极端组合
    // （超大基础价 × 超高百分比 × 大数量）击穿 MAX_SAFE_INTEGER 造成负数/失真总价
    if (totalPriceCents != null && totalPriceCents > MAX_MONEY_CENTS) {
      throw new AppError(E.INVALID_PRICE, 400, { value: totalPriceCents, message: '订单总价超出上限' })
    }

    // ─── 报价快照字符串（SPEC-PRICE-2：与引擎公式逐项对应） ───
    const quoteSnapshot = styleCalc
      ? buildStyleQuoteSnapshot(styleCalc, totalPriceCents ?? 0)
      : null

    const result = db.prepare(`
      INSERT INTO orders (order_no, artist_id, style_size_id, client_qq, client_name, description, priority, status, source, client_notify, queue_position, price_snapshot, total_price_cents, quote_snapshot, final_price_cents, queue_zone, discount_code_id, discount_amount_cents, customer_token_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNo, artistId, styleSizeId || null, clientQq, clientName || null,
      description || null, priority || 'medium', source || 'self',
      clientNotify ? 1 : 0, queuePosition,
      styleCalc ? styleCalc.baseCents / 100 : null,
      totalPriceCents,
      quoteSnapshot,
      totalPriceCents, // R3: 有价格计算时，最终价格初始 = 折后总价
      queueZone,
      discountCodeId,
      discountAmountCents,
      customerTokenHash
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

    // D-3（R-11）: 零元订单显式化——base_price=0 或 100% 折扣无分期无收款，
    // 写入系统备注避免画师/客户误以为漏收款（返回体不变，状态机不改）
    if (totalPriceCents != null && totalPriceCents === 0) {
      db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, '0 元订单：无需收款', 'system')")
        .run(orderId)
    }

    // R0-1: 参考图在事务内落库（R18: 显式传 source='client'，不依赖 DEFAULT）
    if (Array.isArray(references) && references.length > 0) {
      const insertRef = db.prepare("INSERT INTO order_references (order_id, file_path, source) VALUES (?, ?, 'client')")
      for (const ref of references.slice(0, 5)) {
        insertRef.run(orderId, ref)
      }
      // F-10（P2-13 后端侧）: 归属校验 + 绑定——客户上传的参考图必须属于同一匿名凭证且
      // 未绑定订单；校验通过即绑定 order_id（并发抢绑时 bind 0 行 → 整体回滚）。
      // 未登记路径（迁移 v55 前的存量文件）放行且不绑定，由路由层存在性校验兜底。
      // 归属校验失败一律 ILLEGAL_PATH，不泄露归属细节。
      if (anonId != null) {
        const bind = db.prepare('UPDATE reference_uploads SET order_id = ? WHERE file_path = ? AND anon_id = ? AND order_id IS NULL')
        for (const ref of references.slice(0, 5)) {
          const upload = db.prepare(
            'SELECT anon_id, order_id FROM reference_uploads WHERE file_path = ?'
          ).get(ref) as { anon_id: number; order_id: number | null } | undefined
          if (upload) {
            if (upload.anon_id !== anonId || upload.order_id != null) {
              throw new AppError(E.ILLEGAL_PATH, 400)
            }
            const r = bind.run(orderId, ref, anonId)
            if (r.changes === 0) throw new AppError(E.ILLEGAL_PATH, 400)
          }
        }
      }
    }

    // ─── 价格明细快照（SPEC-PRICE-2 新 item_type 口径，全整数分） ───
    if (styleCalc) {
      const insertBd = db.prepare(
        'INSERT INTO order_price_breakdown (order_id, item_type, item_name, amount_cents, multiplier, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      let sortIdx = 0
      insertBd.run(orderId, 'base', `${styleCalc.styleName} / ${styleCalc.sizeName}`, styleCalc.baseCents, 1.0, 1, sortIdx++)
      for (const item of styleCalc.fixedAddonItems) {
        insertBd.run(orderId, 'addon_fixed', item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name, item.amountCents, 1.0, item.quantity, sortIdx++)
      }
      // 百分比增项：金额 = 百分比 × 基础价（只基于基础价）；multiplier 列存因子供展示
      for (const item of styleCalc.percentAddonItems) {
        insertBd.run(orderId, 'addon_percent', item.quantity > 1 ? `${item.name} +${item.percent}%×${item.quantity}` : `${item.name} +${item.percent}%`, item.amountCents, 1 + item.percent / 100, item.quantity, sortIdx++)
      }
      if (styleCalc.usage) {
        insertBd.run(orderId, 'usage', `${styleCalc.usage.name} +${styleCalc.usage.percent}%`, styleCalc.usage.incrementCents, 1 + styleCalc.usage.percent / 100, 1, sortIdx++)
      }
      if (styleCalc.rush) {
        insertBd.run(orderId, 'rush', `${styleCalc.rush.name} +${styleCalc.rush.percent}%`, styleCalc.rush.incrementCents, 1 + styleCalc.rush.percent / 100, 1, sortIdx++)
      }
      if (discountAmountCents > 0) {
        insertBd.run(orderId, 'discount', '折扣优惠', -discountAmountCents, 1.0, 1, sortIdx++)
      }
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

    return { ...getOrder(orderId)!, customerToken }
  })()
}
