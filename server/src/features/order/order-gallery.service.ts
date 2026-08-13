import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { getOrder, compactQueue, tryAutoPromote, assertStatusTransition, updateOrderChecked } from './order.service.js'
import { logActivity } from './activity-log.service.js'
import { createArtwork } from '../artist/artist.service.js'
import type { OrderDetail } from '../../types/entities.js'
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { join, resolve, sep, extname, basename } from 'path'
import { nanoid } from 'nanoid'

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
 * 状态守卫走统一状态机断言（audit-b F1）：wip/revision/done → delivered 显式合法，
 * pending/confirmed 等机器外路径一律拒绝
 */
export function deliverOrder(orderId: number, filePath: string, fileName: string | null, fileSize: number | null, expectedVersion?: number): { order: OrderDetail; statusChanged: boolean } {
  return db.transaction(() => {
    const order = getOrder(orderId)
    if (!order) throw new AppError(E.ORDER_NOT_FOUND)
    assertStatusTransition(order.status, 'delivered')

    // P2-F8: 交付前校验文件真实存在（对齐 assertReferenceFileExists/publishArtwork 模式），
    // 防止提交不存在路径仍被推入 delivered 状态
    const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')
    const abs = resolve(join(uploadDir, filePath))
    if (!abs.startsWith(uploadDir + sep) || !existsSync(abs) || !statSync(abs).isFile()) {
      throw new AppError(E.MISSING_FILE, 400)
    }

    addDeliverable(orderId, filePath, fileName, fileSize)

    let statusChanged = false
    // audit-a P2-1: 与 deliverOrderWithoutFile 对齐——wip/revision/done 均可迁移，
    // 已交付订单重复传文件只落文件不迁状态（幂等）
    if (order.status !== 'delivered') {
      // D-1: 交付状态迁移带版本守卫（防双标签页旧快照覆盖）
      updateOrderChecked(orderId, expectedVersion, "status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)", 'delivered')
      compactQueue(order.artist_id)
      // SPEC-004: 交付释放名额后尝试自动递补
      tryAutoPromote(order.artist_id)
      statusChanged = true
    }

    return { order: getOrder(orderId)!, statusChanged }
  })()
}

/**
 * 无文件交付（方案 B：修复工作流订单最后节点交付卡死）
 * 画师确认本单无需交付文件时，直接完成交付流程：
 * 状态守卫同 deliverOrder（统一状态机断言）→ delivered + 队列压缩 + 自动递补
 * 与 deliverOrder 的差异：不插入交付文件，追加系统备注留痕
 */
export function deliverOrderWithoutFile(orderId: number, expectedVersion?: number): { order: OrderDetail; statusChanged: boolean } {
  return db.transaction(() => {
    const order = getOrder(orderId)
    if (!order) throw new AppError(E.ORDER_NOT_FOUND)
    assertStatusTransition(order.status, 'delivered')

    let statusChanged = false
    if (order.status !== 'delivered') {
      // D-1: 交付状态迁移带版本守卫（与 deliverOrder 同款）
      updateOrderChecked(orderId, expectedVersion, "status = ?, completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)", 'delivered')
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

    return { order: getOrder(orderId)!, statusChanged }
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
export function setFocusImage(orderId: number, imagePath: string | null, mode: string): OrderDetail {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND)

  if (!VALID_FOCUS_MODES.includes(mode)) {
    throw new AppError(E.INVALID_FOCUS_MODE, 400, { mode })
  }

  if (mode === 'off') {
    db.prepare("UPDATE orders SET focus_image_path = NULL, focus_image_mode = 'off', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(orderId)
    return getOrder(orderId)!
  }

  // 校验参考图归属
  if (!imagePath) throw new AppError(E.FOCUS_IMAGE_NOT_FOUND)
  const ref = db.prepare('SELECT id FROM order_references WHERE order_id = ? AND file_path = ?').get(orderId, imagePath)
  if (!ref) throw new AppError(E.FOCUS_IMAGE_NOT_OWNED, 400, { path: imagePath })

  db.prepare('UPDATE orders SET focus_image_path = ?, focus_image_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(imagePath, mode, orderId)

  return getOrder(orderId)!
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
export function removeReference(orderId: number, referenceId: number): OrderDetail {
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

    return getOrder(orderId)!
  })()
}

// ============================================
// REQ-022 F1: 发布为作品
// ============================================

/** 可发布为作品的扩展名（对齐 /api/upload/image 白名单；deliverables 允许 zip/psd 等非图片格式，不可发布） */
const PUBLISH_ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']

/** 发布结果行（camelCase，路由层直接返回） */
interface PublishedArtwork {
  id: number
  imagePath: string
  title: string | null
  description: string | null
}

/**
 * 把订单交付物发布为作品（REQ-022 F1，用户拍板：delivered 门槛 + 一图一作品）
 *
 * 链路：
 * 1. 订单必须 delivered（路由层已校验，此处双重防御）
 * 2. deliverableIds 去重（保持首次出现顺序，重复不报错——派工定案）
 * 3. 每张图：deliverables/{artistId}/xxx（签名私有）复制（非移动）→ images/{artistId}/yyy（公开）
 *    原交付物保留不动（客户交付页仍可下载）
 * 4. 一图一条 artworks：title/description 各条共用同一入参，is_cover 默认 0
 *
 * 回滚策略：文件复制阶段中途失败 → 删除已复制文件；
 * DB 插入阶段中途失败 → 删除已插入 artworks + 已复制文件（GC 24h 兜底）
 */
export async function publishArtwork(
  orderId: number,
  artistId: number,
  deliverableIds: number[],
  title: string,
  description?: string | null
): Promise<PublishedArtwork[]> {
  const order = getOrder(orderId)
  if (!order) throw new AppError(E.ORDER_NOT_FOUND, 404)
  if (order.artist_id !== artistId) throw new AppError(E.ORDER_NOT_OWNED, 403)
  if (order.status !== 'delivered') {
    throw new AppError(E.PUBLISH_WRONG_STATUS, 400, { status: order.status })
  }

  // 去重（保持顺序；重复不报错——派工定案）
  const ids = [...new Set(deliverableIds)]
  if (ids.length === 0) throw new AppError(E.MISSING_PARAMS)

  // 交付物行校验：每条必须属于本订单（跨单/不存在 → 404）
  const deliverables = ids.map(id => {
    const row = db.prepare('SELECT id, file_path FROM deliverables WHERE id = ? AND order_id = ?')
      .get(id, orderId) as { id: number; file_path: string } | undefined
    if (!row) throw new AppError(E.DELIVERABLE_NOT_FOUND, 404, { deliverableId: id })
    return row
  })

  // 路径防御（对齐 deliver 端点 H-3 模式）：.. 检查 + 本画师交付目录前缀
  for (const d of deliverables) {
    if (d.file_path.includes('..') || !d.file_path.startsWith(`deliverables/${artistId}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }
  }

  // 扩展名白名单：交付文件允许 zip/psd 等，发布为作品仅接受图片格式
  for (const d of deliverables) {
    const ext = extname(basename(d.file_path)).toLowerCase()
    if (!PUBLISH_ALLOWED_EXTS.includes(ext)) {
      throw new AppError(E.ILLEGAL_FILE_TYPE)
    }
  }

  // ── 文件复制阶段：deliverables/（签名私有）→ images/（公开目录，同作品上传约定）──
  const uploadDir = resolve(process.env.UPLOAD_DIR || './uploads')
  const copiedAbs: string[] = []
  const targets: string[] = []
  try {
    const destDirAbs = resolve(join(uploadDir, 'images', String(artistId)))
    mkdirSync(destDirAbs, { recursive: true })
    for (const d of deliverables) {
      const srcAbs = resolve(join(uploadDir, d.file_path))
      // P0-B 纵深防御：源/目标必须都在 uploads 子树内
      if (!srcAbs.startsWith(uploadDir + sep)) throw new AppError(E.ILLEGAL_PATH)
      if (!existsSync(srcAbs)) throw new AppError(E.MISSING_FILE)
      const ext = extname(basename(d.file_path)).toLowerCase()
      const destRel = `images/${artistId}/${nanoid(12)}${ext}`
      const destAbs = resolve(join(uploadDir, destRel))
      if (!destAbs.startsWith(uploadDir + sep)) throw new AppError(E.ILLEGAL_PATH)
      copyFileSync(srcAbs, destAbs)
      copiedAbs.push(destAbs)
      targets.push(destRel)
    }
  } catch (err) {
    // 复制中途失败：清理已复制文件，不留脏数据
    for (const f of copiedAbs) { try { unlinkSync(f) } catch { /* 忽略 */ } }
    throw err
  }

  // ── DB 插入阶段：一图一作品行（createArtwork 内 sharp 读宽高，故为 async，不走 db.transaction）──
  const created: PublishedArtwork[] = []
  try {
    for (const destRel of targets) {
      const artwork = await createArtwork(artistId, {
        imagePath: destRel,
        title,
        description: description ?? null
      })
      if (!artwork) throw new AppError(E.ARTWORK_NOT_FOUND)
      created.push({
        id: artwork.id,
        imagePath: artwork.image_path,
        title: artwork.title,
        description: artwork.description
      })
    }
  } catch (err) {
    // 插入中途失败：删除已插入 artworks + 已复制文件（GC 24h 兜底）
    for (const a of created) db.prepare('DELETE FROM artworks WHERE id = ?').run(a.id)
    for (const f of copiedAbs) { try { unlinkSync(f) } catch { /* 忽略 */ } }
    throw err
  }

  // 注：发布为作品不写 order_activity_logs——action_type 列有 DB CHECK 约束
  // （6 值枚举，加 'publish_artwork' 需重建表迁移，属结构变更，本批派工禁止动 init.js）。
  // 留痕由 artworks 行本身承担（created_at + image_path 可追溯交付来源）。
  return created
}
