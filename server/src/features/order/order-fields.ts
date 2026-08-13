import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { logActivity } from './activity-log.service.js'
import { toSqliteDate, toLocalDateString } from '../../utils/date.js'
import type { OrderDetail } from '../../types/entities.js'
import { getOrder } from './order-read.js'

// ============================================
// 订单服务 - 单字段/备注更新子域（从 order.service.ts 拆出）
// ============================================

/**
 * D-1（R-5/P3-1）统一版本守卫写：订单 UPDATE 只允许基于预期版本执行。
 * expectedVersion 为空（兼容期调用方未传）时先读当前版本——better-sqlite3 单进程同步下
 * 读-写之间无 await，天然原子，行为与旧版一致；双标签页/撤销重放则由调用方传入的
 * 版本号兜住：受影响行数 0 = 版本已被他人推进 → ORDER_CONFLICT（409，防静默覆盖）。
 * F5: undefined = 读当前版本覆盖（兼容路径保留）；版本链由所有 orders 写路径递增
 * （version = version + 1）保证——任何写路径（含队列/优先级/金额/焦点图等直写）
 * 都会推进版本，带 version 的调用方因此能感知一切变更。
 * sets 不含 updated_at/version（由本函数统一追加），调用方只需传业务列 SET 片段。
 */
export function updateOrderChecked(
  orderId: number,
  expectedVersion: number | undefined,
  sets: string,
  ...params: Array<string | number | null>
): void {
  let version: number
  if (expectedVersion === undefined) {
    const row = db.prepare('SELECT version FROM orders WHERE id = ?').get(orderId) as { version: number } | undefined
    if (!row) throw new AppError(E.ORDER_NOT_FOUND)
    version = row.version
  } else {
    version = expectedVersion
  }
  const r = db.prepare(
    `UPDATE orders SET ${sets}, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?`
  ).run(...params, orderId, version)
  if (r.changes === 0) throw new AppError(E.ORDER_CONFLICT, 409)
}

/**
 * 更新订单截稿日（v0.15 R51）
 * deadline: ISO 8601 字符串 或 null（清除）
 */
export function updateDeadline(orderId: number, deadline: string | null, expectedVersion?: number): OrderDetail {
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
    // audit-a P2-2: 比较口径统一为本地日期——用户传入的 deadline 按本地日历日解释，
    // 而存储走 UTC；UTC+8 每日 00:00~08:00 的本地日会比 UTC 日早一天，直接比 UTC 前缀会误拒
    if (order.start_date) {
      const startStr = String(order.start_date).slice(0, 10)
      if (toLocalDateString(d) < startStr) {
        throw new AppError(E.INVALID_DEADLINE, 400, { value: deadline })
      }
    }
  }

  updateOrderChecked(orderId, expectedVersion, 'deadline = ?', normalized)

  return getOrder(orderId)!
}

/**
 * v0.26 B: 更新订单开工日
 * startDate: 'YYYY-MM-DD' 字符串 或 null（清除）
 */
export function updateStartDate(orderId: number, startDate: string | null, expectedVersion?: number): OrderDetail {
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
    // audit-a P2-2: 与 updateDeadline 对称——deadline 存 UTC，须换算成本地日历日再比
    if (order.deadline) {
      const deadlineLocal = toLocalDateString(new Date(String(order.deadline).replace(' ', 'T') + 'Z'))
      if (normalized > deadlineLocal) {
        throw new AppError(E.INVALID_START_DATE, 400, { value: startDate })
      }
    }
  }

  updateOrderChecked(orderId, expectedVersion, 'start_date = ?', normalized)

  return getOrder(orderId)!
}

/**
 * 添加订单备注
 * R19: 支持可选附图 imagePath（notes/{artistId}/ 目录）
 */
export function addNote(orderId: number, content: string, createdBy: string = 'artist', imagePath: string | null = null): OrderDetail {
  // P2-F10: 备注 + 操作日志包同一事务（此前先写备注再写日志，中途失败会留半截脏数据）
  return db.transaction(() => {
    db.prepare('INSERT INTO order_notes (order_id, content, created_by, image_path) VALUES (?, ?, ?, ?)')
      .run(orderId, content, createdBy, imagePath)
    // v0.31 REQ-021 F1: 操作日志（仅画师备注，系统备注不记）
    if (createdBy !== 'system') {
      logActivity(orderId, 'note_update', createdBy, { action: 'add', hasImage: !!imagePath })
    }
    return getOrder(orderId)!
  })()
}

/**
 * 删除订单备注（v0.15 R46）
 * 系统备注（created_by='system'）不可删除
 * 带图备注删除后，图片由 GC 孤儿回收机制自动清理（app.js gcUploads 已收集 order_notes.image_path）
 */
export function deleteNote(orderId: number, noteId: number): OrderDetail {
  // P2-F10: 删除 + 操作日志包同一事务
  return db.transaction(() => {
    const note = db.prepare('SELECT * FROM order_notes WHERE id = ? AND order_id = ?').get(noteId, orderId) as { created_by: string } | undefined
    if (!note) throw new AppError(E.NOTE_NOT_FOUND, 404)
    if (note.created_by === 'system') throw new AppError(E.SYSTEM_NOTE_PROTECTED, 403)

    db.prepare('DELETE FROM order_notes WHERE id = ?').run(noteId)
    // v0.31 REQ-021 F1: 操作日志
    logActivity(orderId, 'note_update', 'artist', { action: 'delete', noteId })
    return getOrder(orderId)!
  })()
}
