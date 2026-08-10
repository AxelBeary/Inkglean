import db from '../../db/connection.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { resolve, join, relative } from 'path'
import { existsSync, readdirSync, statSync, rmSync } from 'fs'

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
