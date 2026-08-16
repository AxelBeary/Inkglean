import db from '../../db/connection.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { resolve, join, relative, sep } from 'path'
import { existsSync, readdirSync, statSync, rmSync, mkdirSync, renameSync } from 'fs'

// ============================================
// 管理员服务 - 全局统计查询
// ============================================

/**
 * 系统全局统计数据
 */
export function getGlobalStats(): { artistCount: number; orderCount: number; activeOrders: number } {
  // audit-a P3-6: 软删除画师不计入（与画师列表口径一致）
  const artistCount = (db.prepare('SELECT COUNT(*) as c FROM artists WHERE deleted_at IS NULL').get() as { c: number }).c
  const orderCount = (db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number }).c
  const activeOrders = (db.prepare(
    `SELECT COUNT(*) as c FROM orders WHERE ${ACTIVE_ORDER_SQL}`
  ).get() as { c: number }).c

  return { artistCount, orderCount, activeOrders }
}

// ============================================
// 回收站管理（事故修复：孤儿文件不再永久删除）
// ============================================

const RECYCLE_BIN = '.recycle-bin'

function getRecycleBinRoot(): string {
  const uploadRoot = resolve(process.env.UPLOAD_DIR || './uploads')
  return join(uploadRoot, RECYCLE_BIN)
}

interface RecycleBinItem {
  fileName: string
  originalPath: string
  size: number
  movedAt: string
}

/**
 * 列出回收站内容
 * 返回：[{ fileName, originalPath, size, movedAt }]
 */
export function listRecycleBin(): RecycleBinItem[] {
  const binRoot = getRecycleBinRoot()
  if (!existsSync(binRoot)) return []

  const items: RecycleBinItem[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      const st = statSync(full)
      // originalPath = 相对于回收站根的路径（去掉日期前缀后即为原始相对路径）
      const relToBin = relative(binRoot, full).replace(/\\/g, '/')
      // 日期子目录格式 YYYY-MM-DD/，去掉第一层即为原始路径
      const originalPath = relToBin.replace(/^\d{4}-\d{2}-\d{2}\//, '')
      items.push({
        fileName: e.name,
        originalPath,
        size: st.size,
        movedAt: st.mtime.toISOString()
      })
    }
  }
  walk(binRoot)
  return items
}

/**
 * 列出回收站内容（分页）— REQ-022 F4
 * walk 后按 movedAt 倒序（新删的在前），切片返回当前页
 * 返回：{ items, total, page, pageSize }
 */
export function listRecycleBinPaged(page: number, pageSize: number): {
  items: RecycleBinItem[]
  total: number
  page: number
  pageSize: number
} {
  const all = listRecycleBin()
  // ISO 8601 字符串字典序等价时间序
  all.sort((a, b) => b.movedAt.localeCompare(a.movedAt))
  const total = all.length
  const start = (page - 1) * pageSize
  const items = all.slice(start, start + pageSize)
  return { items, total, page, pageSize }
}

/**
 * 清空回收站（真正删除所有文件）
 * 返回删除的文件数
 */
export function emptyRecycleBin(): number {
  const binRoot = getRecycleBinRoot()
  if (!existsSync(binRoot)) return 0

  const count = listRecycleBin().length
  rmSync(binRoot, { recursive: true, force: true })
  return count
}

/** 回收站恢复结果（路由层据此映射 200/404/409） */
export type RestoreRecycleBinResult =
  | { status: 'restored'; restoredPath: string }
  | { status: 'not_found' }
  | { status: 'conflict' }

/**
 * 恢复回收站文件到原始路径（R-21，审计批E）
 * - 在各日期子目录中按 fileName（文件名）精确查找（回收站不保留原文件名映射以外的信息）
 * - 多日期/多路径同名：按回收站内绝对路径字典序倒序取最新日期目录（与列表 movedAt 倒序一致），
 *   消除 readdir 顺序对恢复目标的影响
 * - 目标已存在 → conflict（绝不覆盖，误恢复也不丢现有文件）
 * - 找不到 → not_found（含目标越界等异常结构，按不可恢复处理）
 */
export function restoreRecycleBinFile(fileName: string): RestoreRecycleBinResult {
  const uploadRoot = resolve(process.env.UPLOAD_DIR || './uploads')
  const binRoot = getRecycleBinRoot()
  if (!existsSync(binRoot)) return { status: 'not_found' }

  const matches: Array<{ abs: string; originalPath: string }> = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { walk(full); continue }
      if (e.name !== fileName) continue
      // originalPath = 相对回收站根路径去掉日期前缀（与 listRecycleBin 同口径）
      const relToBin = relative(binRoot, full).replace(/\\/g, '/')
      matches.push({ abs: full, originalPath: relToBin.replace(/^\d{4}-\d{2}-\d{2}\//, '') })
    }
  }
  walk(binRoot)
  if (matches.length === 0) return { status: 'not_found' }

  // 确定化排序：YYYY-MM-DD 日期目录字典序 = 时间序，倒序取最新；同名同日期多路径也稳定取最大路径
  matches.sort((a, b) => (b.abs < a.abs ? -1 : b.abs > a.abs ? 1 : 0))
  const src = matches[0]
  const target = resolve(join(uploadRoot, src.originalPath))
  const resolvedRoot = resolve(uploadRoot)
  // 纵深防御：originalPath 来自回收站目录结构，仍校验目标在 uploadRoot 内（防异常目录结构越界）
  if (target === resolvedRoot || !target.startsWith(resolvedRoot + sep)) {
    return { status: 'not_found' }
  }
  if (existsSync(target)) return { status: 'conflict' }

  mkdirSync(join(target, '..'), { recursive: true })
  renameSync(src.abs, target)
  return { status: 'restored', restoredPath: src.originalPath }
}
