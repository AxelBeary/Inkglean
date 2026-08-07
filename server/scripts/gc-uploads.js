/* eslint-disable no-console -- CLI 脚本按约定豁免（console 输出是脚本本职） */
/**
 * P1-C: 孤儿文件回收脚本
 * 用法: node scripts/gc-uploads.js [--dry-run]
 * --dry-run: 只列出孤儿文件，不实际删除
 *
 * 扫描 uploads/ 下所有文件，与数据库中的引用比对，
 * 删除超过 24h 未被引用的孤儿文件。
 * 建议通过 cron 每天执行一次。
 */
import { resolve, join, relative } from 'path'
import { existsSync, readdirSync, statSync, renameSync, mkdirSync, rmdirSync } from 'fs'
import Database from 'better-sqlite3'
import 'dotenv/config'

const DB_PATH = process.env.DB_PATH || './data/commission.db'
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
const DRY_RUN = process.argv.includes('--dry-run')
const MIN_AGE_MS = 24 * 60 * 60 * 1000 // 24h

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

// 收集所有数据库中的文件引用
const refs = new Set()

function collect(rows, field) {
  for (const row of rows) {
    if (row[field]) refs.add(row[field])
  }
}

collect(db.prepare('SELECT image_path FROM artworks').all(), 'image_path')
collect(db.prepare('SELECT example_image FROM price_tiers').all(), 'example_image')
collect(db.prepare('SELECT file_path FROM order_references').all(), 'file_path')
collect(db.prepare('SELECT file_path FROM deliverables').all(), 'file_path')
collect(db.prepare('SELECT avatar FROM artists').all(), 'avatar')
// P2-#17: 收集备注附图（旧版遗漏，会把在用备注图当孤儿删掉）
collect(db.prepare('SELECT image_path FROM order_notes WHERE image_path IS NOT NULL').all(), 'image_path')

console.log(`数据库引用文件数: ${refs.size}`)

// 递归扫描 uploads/（P2-#17: 跳过 .recycle-bin 目录）
function walk(dir) {
  const files = []
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
      // P2-#17: 移入回收站（与 app.js gcUploads 一致），不直接永久删除
      const today = new Date().toISOString().slice(0, 10)
      const recycleDir = join(UPLOAD_DIR, '.recycle-bin', today)
      mkdirSync(recycleDir, { recursive: true })
      renameSync(absPath, join(recycleDir, rel.replace(/\//g, '_')))
      console.log(`[recycled] ${rel} (${(size / 1024).toFixed(1)} KB)`)
      freed += size
    } catch (err) {
      console.error(`[error] ${rel}: ${err.message}`)
    }
  }
  deleted++
}

// 删除空目录
function removeEmptyDirs(dir) {
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
