import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { getOrder, compactQueue, tryAutoPromote } from './order.service.js'
import { logActivity } from './activity-log.service.js'

// ============================================
// 订单图库服务（从 order.service.js 拆出，v0.16）
// 参考图、交付文件、焦点图
// ============================================

/**
 * 添加交付文件
 */
export function addDeliverable(orderId: number, filePath: string, fileName: string | null, fileSize: number | null): void {
  db.prepare('INSERT INTO deliverables (order_id, file_path, original_name, file_size) VALUES (?, ?, ?, ?)')
    .run(orderId, filePath, fileName || '交付文件', fileSize || 0)
}

/**
 * 交付订单（事务化）
 * 仅 wip/revision/done 状态允许上传交付文件
 */
export function deliverOrder(orderId: number, filePath: string, fileName: string | null, fileSize: number | null): any {
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
      // SPEC-004: 交付释放名额后尝试自动递补
      tryAutoPromote(order.artist_id)
      statusChanged = true
    }

    return { order: getOrder(orderId), statusChanged }
  })()
}

/**
 * 无文件交付（方案 B：修复工作流订单最后节点交付卡死）
 * 画师确认本单无需交付文件时，直接完成交付流程：
 * 状态守卫同 deliverOrder（wip/revision/done）→ delivered + 队列压缩 + 自动递补
 * 与 deliverOrder 的差异：不插入交付文件，追加系统备注留痕
 */
export function deliverOrderWithoutFile(orderId: number): any {
  return db.transaction(() => {
    const order = getOrder(orderId)
    if (!order) throw new AppError(E.ORDER_NOT_FOUND)
    if (!['wip', 'revision', 'done'].includes(order.status)) {
      throw new AppError(E.DELIVER_WRONG_STATUS, 400, { status: order.status })
    }

    let statusChanged = false
    if (order.status !== 'delivered') {
      db.prepare('UPDATE orders SET status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('delivered', orderId)
      compactQueue(order.artist_id)
      // SPEC-004: 交付释放名额后尝试自动递补
      tryAutoPromote(order.artist_id)
      statusChanged = true
    }

    // 系统备注留痕（客户与画师双方可见交付方式）
    db.prepare("INSERT INTO order_notes (order_id, content, created_by) VALUES (?, ?, 'system')")
      .run(orderId, '📦 画师确认无需交付文件，订单直接完成交付')

    // v0.31 REQ-021 F1: 操作日志（status_change 类型 + noFile 标记，对齐 updateOrderStatus 日志范式）
    logActivity(orderId, 'status_change', 'artist', { from: order.status, to: 'delivered', noFile: true })

    return { order: getOrder(orderId), statusChanged }
  })()
}

/**
 * 添加订单参考图
 * R18: source 区分来源（'client'/'artist'），20 张总量校验
 * ⚠️ 务必显式传 source 值，不要依赖 DEFAULT（显式传 NULL 会写成 null）
 */
export function addReference(orderId: number, filePath: string, fileName: string | null, fileSize: number | null, source: string = 'client'): void {
  // BUG-3: 同图去重 — 同 order_id + file_path 不允许重复加入
  const dup = db.prepare('SELECT 1 FROM order_references WHERE order_id = ? AND file_path = ?').get(orderId, filePath)
  if (dup) {
    throw new AppError(E.REFERENCE_DUPLICATE, 409)
  }
  // R18: 订单生命周期总量限制 20 张
  const count = (db.prepare('SELECT COUNT(*) AS c FROM order_references WHERE order_id = ?').get(orderId) as { c: number }).c
  if (count >= 20) {
    throw new AppError(E.REFERENCES_LIMIT)
  }
  db.prepare('INSERT INTO order_references (order_id, file_path, original_name, file_size, source) VALUES (?, ?, ?, ?, ?)')
    .run(orderId, filePath, fileName || '参考图', fileSize || 0, source)
}

// ─── 焦点图 ───

const VALID_FOCUS_MODES = ['off', 'small', 'large']

/**
 * 设置订单焦点图
 * 焦点图路径必须是该订单已有参考图之一（校验归属）
 * mode 为 'off' 时清空焦点图
 */
export function setFocusImage(orderId: number, imagePath: string | null, mode: string): any {
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

/** 参考图行 */
interface ReferenceRow {
  id: number
  order_id: number
  file_path: string
  original_name: string | null
  file_size: number | null
  source: string | null
}

/**
 * 删除订单参考图
 * 删除时检查并清理焦点图字段
 */
export function removeReference(orderId: number, referenceId: number): any {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  const ref = db.prepare('SELECT * FROM order_references WHERE id = ? AND order_id = ?').get(referenceId, orderId) as ReferenceRow | undefined
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
