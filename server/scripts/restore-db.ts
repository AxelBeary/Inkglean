#!/usr/bin/env node
// ============================================
// DB 恢复脚本（R-6，审计批E，2026-08-11）
//
// 背景：审计 R-6 ② —— 有备份但无 restore 脚本、无完整性校验，恢复全凭手工 cp，风险高。
// 本脚本补齐：目标库若存在先移为 .bak-pre-restore-<ts> → 复制备份 → PRAGMA 双重校验
// （integrity_check + foreign_key_check）→ 校验失败自动回滚（恢复原库）并退出码 1。
//
// 用法：npm run restore [备份文件]   （缺省取 data/backups/ 最新正式备份 commission.db.bak-<YYYY-MM-DDTHH-MM-SS-mmmZ>）
//       环境变量：DB_PATH / BACKUP_DIR（默认值见下，容器内由 compose 注入 DB_PATH）
//
// 成功输出：RESTORE_OK <备份路径>；失败输出：RESTORE_FAILED <原因>（entrypoint 自愈据此中止启动）
// ============================================
import { copyFileSync, existsSync, readdirSync, renameSync, unlinkSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..') // 仓库根目录
const DB_PATH = process.env.DB_PATH || resolve(ROOT, 'data/commission.db')
const BACKUP_DIR = process.env.BACKUP_DIR || resolve(ROOT, 'data/backups')

// 正式备份命名：backup-db.ts 产出 commission.db.bak-<ISO 时间戳>（冒号和点替换为 -），
// 例：commission.db.bak-2026-08-15T04-12-34-567Z。只把这种命名纳入候选，
// 历史异名备份（bak.vN、bak-pre-*、bak.empty-* 等）不会被选为恢复源。
const OFFICIAL_BACKUP_RE = /^commission\.db\.bak-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/

/**
 * 取最新 DB 备份：backup-db.ts 正式产物命名 commission.db.bak-<ISO 时间戳>，字典序 = 时间序。
 * 只匹配 OFFICIAL_BACKUP_RE；目录不存在/无匹配 → null（不抛错，由 restoreDb 统一报「无正式备份」）
 */
export function pickLatestBackup(backupDir: string): string | null {
  try {
    const baks = readdirSync(backupDir)
      .filter(f => OFFICIAL_BACKUP_RE.test(f))
      .sort()
    return baks.length > 0 ? join(backupDir, baks[baks.length - 1]) : null
  } catch {
    return null
  }
}

/** 打开 + 双重 PRAGMA 校验；任一不通过即抛错（调用方负责回滚） */
function validateDb(dbPath: string): void {
  const db = new Database(dbPath, { readonly: true })
  db.pragma('busy_timeout = 5000')
  const integrity = db.pragma('integrity_check', { simple: true })
  if (integrity !== 'ok') {
    db.close()
    throw new Error(`integrity_check 未通过: ${String(integrity)}`)
  }
  const fkViolations = db.pragma('foreign_key_check')
  db.close()
  if (fkViolations.length > 0) {
    throw new Error(`foreign_key_check 发现 ${fkViolations.length} 处悬空引用: ${JSON.stringify(fkViolations.slice(0, 3))}`)
  }
}

export interface RestoreDbResult {
  restoredFrom: string
  preRestorePath: string | null
}

/**
 * 执行恢复：备份文件 → 目标库，带完整回滚语义
 * - 目标库存在：先移为 .bak-pre-restore-<ts>（留证，恢复成功后可手动清理）
 * - 复制备份 → 双重校验 → 失败：删复制产物、把原库移回，抛错
 * - 备份文件缺省由调用方解析（CLI 用 pickLatestBackup，测试可显式指定）
 */
export function restoreDb(opts: { dbPath: string; backupDir: string; backupFile?: string }): RestoreDbResult {
  const backupPath = opts.backupFile || pickLatestBackup(opts.backupDir)
  if (!backupPath) {
    throw new Error(`未找到正式备份（命名 commission.db.bak-<YYYY-MM-DDTHH-MM-SS-mmmZ>，backupDir: ${opts.backupDir}）`)
  }
  if (!existsSync(backupPath)) {
    throw new Error(`指定的备份文件不存在: ${backupPath}`)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const preRestorePath = existsSync(opts.dbPath) ? `${opts.dbPath}.bak-pre-restore-${stamp}` : null
  if (preRestorePath) renameSync(opts.dbPath, preRestorePath)

  try {
    copyFileSync(backupPath, opts.dbPath)
    validateDb(opts.dbPath)
  } catch (err) {
    // 校验失败 → 回滚：删复制出来的坏库，把原库移回（原库不存在则仅清理复制产物）
    try { unlinkSync(opts.dbPath) } catch { /* 复制可能未完成，无需处理 */ }
    if (preRestorePath) renameSync(preRestorePath, opts.dbPath)
    throw err
  }
  return { restoredFrom: backupPath, preRestorePath }
}

function main(): void {
  const backupFile = process.argv[2] || undefined
  const result = restoreDb({ dbPath: DB_PATH, backupDir: BACKUP_DIR, backupFile })
  console.log('RESTORE_OK', result.restoredFrom)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (err) {
    console.error('RESTORE_FAILED', (err as Error).message)
    process.exit(1)
  }
}
