#!/usr/bin/env node
// ============================================
// 备份有效性校验（P0-1，2026-08-13）
//
// 职责：对 SQLite 备份产物跑双重 PRAGMA 校验（integrity_check + foreign_key_check），
//       全过打印 VERIFY_OK，否则打印 VERIFY_FAILED 并退出 1（fail-fast，中止后续部署）。
// 依赖：node + server/ 依赖里的 better-sqlite3（仓库根执行 npm install / npm ci 即得）。
// 用法：
//   node scripts/verify-backup.mjs <备份文件路径>
//   node scripts/verify-backup.mjs --latest [--dir <备份目录>]
//
// 兼容：入参若为容器路径 /app/data/backups/xxx（daily-backup.bat 解析 BACKUP_OK 得到），
//       在 Windows 宿主自动映射为 <仓库根>/data/backups/xxx。
// ============================================
import { existsSync, readdirSync, statSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') // 仓库根目录
const DEFAULT_BACKUP_DIR = join(ROOT, 'data', 'backups')

function fail(message) {
  console.error(`VERIFY_FAILED ${message}`)
  process.exit(1)
}

/** 解析入参：显式路径优先；--latest 取目录内文件名序最新的 commission.db.bak-* */
function resolveTarget(argv) {
  if (argv.length === 0) return null
  const first = argv[0]
  if (first === '--help' || first === '-h') {
    console.log('用法: node scripts/verify-backup.mjs <备份文件路径>')
    console.log('      node scripts/verify-backup.mjs --latest [--dir <备份目录>]')
    process.exit(0)
  }
  if (first === '--latest') {
    const dirIdx = argv.indexOf('--dir')
    const dir = dirIdx >= 0 && argv[dirIdx + 1] ? argv[dirIdx + 1] : DEFAULT_BACKUP_DIR
    try {
      const baks = readdirSync(dir)
        .filter(f => f.startsWith('commission.db.bak-'))
        .sort()
      if (baks.length === 0) return null
      return join(dir, baks[baks.length - 1])
    } catch {
      return null
    }
  }
  return first
}

/** 容器路径 → 宿主路径（仅 Windows）：/app/data/xxx → <仓库根>/data/xxx */
function toHostPath(target) {
  if (process.platform === 'win32' && target.startsWith('/app/data/')) {
    return join(ROOT, 'data', target.slice('/app/data/'.length))
  }
  return target
}

function main() {
  const target = resolveTarget(process.argv.slice(2))
  if (!target) {
    fail('未指定备份文件（用法见 --help），且 --latest 未找到 commission.db.bak-*')
  }
  const dbPath = toHostPath(target)
  if (!isAbsolute(dbPath)) {
    fail(`备份路径不是绝对路径，无法可靠定位: ${dbPath}`)
  }
  if (!existsSync(dbPath) || !statSync(dbPath).isFile()) {
    fail(`备份文件不存在或不是文件: ${dbPath}`)
  }

  let Database
  try {
    Database = createRequire(join(ROOT, 'server', 'package.json'))('better-sqlite3')
  } catch (err) {
    fail(`better-sqlite3 不可用（${err.message}）。下一步：在仓库根执行 npm install（安装 server/ 依赖）后重试`)
  }

  const db = new Database(dbPath, { readonly: true })
  try {
    db.pragma('busy_timeout = 5000')
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') {
      fail(`integrity_check 未通过: ${String(integrity)}（备份产物损坏，不可用于恢复）`)
    }
    const fkViolations = db.pragma('foreign_key_check')
    if (fkViolations.length > 0) {
      fail(`foreign_key_check 发现 ${fkViolations.length} 处悬空引用: ${JSON.stringify(fkViolations.slice(0, 3))}`)
    }
    console.log(`VERIFY_DETAIL integrity=ok foreign_key_violations=0 file=${dbPath}`)
    console.log(`VERIFY_OK ${dbPath}`)
  } catch (err) {
    fail(`校验执行失败: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    db.close()
  }
}

main()
