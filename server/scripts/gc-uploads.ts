/* eslint-disable no-console -- CLI 脚本按约定豁免（console 输出是脚本本职） */
/**
 * P1-C: 孤儿文件回收脚本
 * 用法: npx tsx scripts/gc-uploads.ts [--dry-run]
 * --dry-run: 只列出孤儿文件，不实际删除
 *
 * 扫描 uploads/ 下所有文件，与数据库中的引用比对，
 * 删除超过 72h 未被引用的孤儿文件（窗口说明见下方 MIN_AGE_MS 注释）。
 * 建议通过 cron 每天执行一次。
 */
import { resolve, join, relative, dirname } from 'path'
import { existsSync, readdirSync, statSync, renameSync, mkdirSync, rmdirSync } from 'fs'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'

// 815 审计 P1-8：dotenv 与默认路径按脚本位置推导仓库根（不依赖 cwd）
const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
dotenv.config({ path: resolve(REPO_ROOT, '.env') })

const DB_PATH = process.env.DB_PATH || resolve(REPO_ROOT, 'data/commission.db')
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || resolve(REPO_ROOT, 'uploads'))
const DRY_RUN = process.argv.includes('--dry-run')
// R-6（审计批E）：孤儿回收窗口 24h → 72h（与 app.ts gcUploads 同款）。
// 复合炸弹：手工恢复旧 DB 备份后，备份时点之后新上传且已关联订单的文件在新 DB 里「无引用」，
// 24h 窗口会把它们移入回收站。72h 给运维留出恢复后的关联核对窗口。
const MIN_AGE_MS = 72 * 60 * 60 * 1000

if (!existsSync(DB_PATH)) {
  console.error(`数据库不存在: ${DB_PATH}`)
  process.exit(1)
}
if (!existsSync(UPLOAD_DIR)) {
  console.log('上传目录不存在，无需清理')
  process.exit(0)
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

/** sqlite_master 表名行 */
interface TableNameRow {
  name: string
}

/** PRAGMA table_info 列信息行 */
interface TableColumnRow {
  name: string
  type: string
}

/** 单列 DISTINCT 值行（值可能非字符串，取用时收窄） */
interface PathValueRow {
  v: unknown
}

// 收集所有数据库中的文件引用——黑名单动态扫描（P0-2 / P3-24 审计批E收敛）：
// 与 app.ts gcUploads 同款，不再维护显式 collect 清单（历史漏登记导致 R19 备注附图、
// v0.35 画风封面误删事故），遍历全部业务表所有 TEXT 列，带路径分隔符的值即视为引用。
const refs = new Set<string>()

const tableRows = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).all() as TableNameRow[]
for (const t of tableRows) {
  const tableName = t.name.replace(/"/g, '""')
  const colRows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as TableColumnRow[]
  for (const c of colRows) {
    if (!/TEXT|CLOB/i.test(c.type)) continue
    const colName = c.name.replace(/"/g, '""')
    const pathRows = db.prepare(
      `SELECT DISTINCT "${colName}" AS v FROM "${tableName}" WHERE "${colName}" IS NOT NULL AND "${colName}" != '' AND length("${colName}") <= 512`
    ).all() as PathValueRow[]
    for (const r of pathRows) {
      const v = r.v
      if (typeof v === 'string' && (v.includes('/') || v.includes('\\'))) {
        refs.add(v.replace(/\\/g, '/'))
      }
    }
  }
}

console.log(`数据库引用文件数: ${refs.size}`)

// 递归扫描 uploads/（P2-#17: 跳过 .recycle-bin 目录）
function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.recycle-bin') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

const diskFiles = walk(UPLOAD_DIR)
const now = Date.now()
let deleted = 0
let freed = 0

for (const absPath of diskFiles) {
  const rel = relative(UPLOAD_DIR, absPath).replace(/\\/g, '/')
  if (refs.has(rel)) continue

  const age = now - statSync(absPath).mtimeMs
  if (age < MIN_AGE_MS) {
    if (DRY_RUN) console.log(`[skip: too new] ${rel}`)
    continue
  }

  const size = statSync(absPath).size
  if (DRY_RUN) {
    console.log(`[would delete] ${rel} (${(size / 1024).toFixed(1)} KB)`)
  } else {
    try {
      // P2-#17: 移入回收站（与 app.ts gcUploads 一致），不直接永久删除
      const today = new Date().toISOString().slice(0, 10)
      const recycleDir = join(UPLOAD_DIR, '.recycle-bin', today)
      mkdirSync(recycleDir, { recursive: true })
      renameSync(absPath, join(recycleDir, rel.replace(/\//g, '_')))
      console.log(`[recycled] ${rel} (${(size / 1024).toFixed(1)} KB)`)
      freed += size
    } catch (err) {
      console.error(`[error] ${rel}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  deleted++
}

// 删除空目录
function removeEmptyDirs(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const full = join(dir, entry.name)
      removeEmptyDirs(full)
      try { rmdirSync(full) } catch { /* not empty */ }
    }
  }
}
if (!DRY_RUN) removeEmptyDirs(UPLOAD_DIR)

const action = DRY_RUN ? '将删除' : '已删除'
console.log(`\n${action} ${deleted} 个孤儿文件${freed ? `，释放 ${(freed / 1024 / 1024).toFixed(1)} MB` : ''}`)

db.close()
