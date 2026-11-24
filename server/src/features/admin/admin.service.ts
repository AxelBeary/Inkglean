import db from '../../db/connection.js'
import { ACTIVE_ORDER_SQL } from '../../utils/order-status.js'
import { resolve, join, relative, sep, basename } from 'path'
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
  /** B7-F0109：回收站内相对路径（含 YYYY-MM-DD 日期前缀）——恢复接口凭它精确定位同名条目之一 */
  binPath: string
}

/**
 * 列出回收站内容
 * 返回：[{ fileName, originalPath, size, movedAt, binPath }]
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
        movedAt: st.mtime.toISOString(),
        // B7-F0109：binPath = 回收站内相对路径（保留日期前缀），恢复接口的精确定位键
        binPath: relToBin
      })
    }
  }
  walk(binRoot)
  return items
}

/**
 * SVR-06：按顶层日期目录分片。回收站结构为 YYYY-MM-DD/<原始路径>/<文件>，
 * 顶层每个条目即一个「分片」（日期目录或少量顶层散文件）。分片名倒序 = relToBin 倒序的
 * 首段序，按此顺序处理即可早停，无需一次性铺开全库条目。
 */
interface RecycleShard { name: string; abs: string; isDir: boolean }
function listRecycleShards(binRoot: string): RecycleShard[] {
  // 显式标注条目形状：即便本机 fs 类型声明缺失（TS2591 环境 artifact），回调也不退化成隐式 any
  const dirents = readdirSync(binRoot, { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean }>
  const shards: RecycleShard[] = []
  for (const e of dirents) shards.push({ name: e.name, abs: join(binRoot, e.name), isDir: e.isDirectory() })
  shards.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)) // 日期目录字典序倒序 = 时间倒序
  return shards
}

/** 只数文件数（不 stat、不构造条目对象、不排序）——用于精确 total */
function countShardFiles(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countShardFiles(join(dir, e.name))
    else n++
  }
  return n
}

/** 收集单个分片内的相对路径条目（无 stat） */
function collectShardEntries(dir: string, binRoot: string, out: Array<{ relToBin: string; fileName: string; originalPath: string }>): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) { collectShardEntries(full, binRoot, out); continue }
    const relToBin = relative(binRoot, full).replace(/\\/g, '/')
    out.push({ relToBin, fileName: e.name, originalPath: relToBin.replace(/^\d{4}-\d{2}-\d{2}\//, '') })
  }
}

/**
 * 列出回收站内容（分页）— REQ-022 F4
 * B7-F0110：排序改为回收站相对路径字典序倒序（YYYY-MM-DD 日期目录字典序 = 时间序，
 * 与 restoreRecycleBinFile 的确定化排序同口径），仅对当前页条目 stat——
 * 页内同日多条按路径稳定排序（日期目录即删除日期，比 mtime 更贴近「新删的在前」）
 * 返回：{ items, total, page, pageSize }
 */
export function listRecycleBinPaged(page: number, pageSize: number): {
  items: RecycleBinItem[]
  total: number
  page: number
  pageSize: number
} {
  const binRoot = getRecycleBinRoot()
  if (!existsSync(binRoot)) return { items: [], total: 0, page, pageSize }
  const shards = listRecycleShards(binRoot)
  const start = (page - 1) * pageSize
  const need = start + pageSize // 早停阈：只需铺开到此为止的条目
  let total = 0
  const pool: Array<{ relToBin: string; fileName: string; originalPath: string }> = []
  for (const shard of shards) {
    if (shard.isDir) {
      const n = countShardFiles(shard.abs)
      total += n
      // SVR-06：仅当本分片可能覆盖目标页时才收集并排序它；更旧的分片只数不铺开
      if (n > 0 && pool.length < need) {
        const bucket: Array<{ relToBin: string; fileName: string; originalPath: string }> = []
        collectShardEntries(shard.abs, binRoot, bucket)
        bucket.sort((a, b) => (a.relToBin < b.relToBin ? 1 : a.relToBin > b.relToBin ? -1 : 0))
        for (const e of bucket) { if (pool.length >= need) break; pool.push(e) }
      }
    } else {
      total += 1
      if (pool.length < need) {
        const relToBin = shard.name
        pool.push({ relToBin, fileName: shard.name, originalPath: relToBin.replace(/^\d{4}-\d{2}-\d{2}\//, '') })
      }
    }
  }
  // B7-F0110：只 stat 当前页的条目；SVR-06：铺开量被 need 截断而非全库
  const items = pool.slice(start, start + pageSize).map(en => {
    const st = statSync(join(binRoot, en.relToBin))
    return {
      fileName: en.fileName,
      originalPath: en.originalPath,
      size: st.size,
      movedAt: st.mtime.toISOString(),
      binPath: en.relToBin
    }
  })
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
 * - 不传 binPath：在各日期子目录中按 fileName（文件名）精确查找；多日期/多路径同名按回收站内
 *   绝对路径字典序倒序取最新日期目录（消除 readdir 顺序影响）——历史语义保持不变
 * - 传 binPath（B7-F0109）：回收站内相对路径（含 YYYY-MM-DD 前缀，列表接口的 binPath 字段），
 *   精确恢复用户指定的同名条目之一（同名多条时 fileName-only 只能恢复最新，旧条目无入口）
 * - 目标已存在 → conflict（绝不覆盖，误恢复也不丢现有文件）
 * - 找不到 → not_found（含目标越界等异常结构，按不可恢复处理）
 */
export function restoreRecycleBinFile(fileName: string, binPath?: string): RestoreRecycleBinResult {
  const uploadRoot = resolve(process.env.UPLOAD_DIR || './uploads')
  const binRoot = getRecycleBinRoot()
  if (!existsSync(binRoot)) return { status: 'not_found' }

  let src: { abs: string; originalPath: string }
  if (binPath !== undefined) {
    // B7-F0109：binPath 精确定位。纵深防御：解析结果必须仍在回收站根内（防 ../ 穿越），
    // 且 basename 必须与 fileName 一致（防拿 A 的路径恢复成 B 的名字）
    const abs = resolve(join(binRoot, binPath))
    if (abs === binRoot || !abs.startsWith(binRoot + sep)) return { status: 'not_found' }
    if (basename(abs) !== fileName) return { status: 'not_found' }
    if (!existsSync(abs) || !statSync(abs).isFile()) return { status: 'not_found' }
    const relToBin = relative(binRoot, abs).replace(/\\/g, '/')
    src = { abs, originalPath: relToBin.replace(/^\d{4}-\d{2}-\d{2}\//, '') }
  } else {
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
    src = matches[0]
  }
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
