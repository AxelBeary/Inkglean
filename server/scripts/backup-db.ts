#!/usr/bin/env node
// ============================================
// DB 定时备份脚本（P0-1，2026-08-09）
//
// 背景：记账系统单点文件（SQLite），外部深度研判 P0-1「无数据备份方案」——
//       一旦容器/磁盘损坏即全部丢失。本脚本提供最小可用的每日备份能力。
//
// 方案：VACUUM INTO —— SQLite 内建一致性快照导出，WAL 安全：
//       - 对运行中的库直接出快照，不需要停服务
//       - 只读打开主库，不改变 journal_mode（避免 v0.38 迁移事故同款坑）
//       - 输出是完整独立 .db 文件，可直接用于恢复
//
// 用法：npm run backup             （容器 cron 每日执行）
//       环境变量：DB_PATH / BACKUP_DIR（默认值见下，容器内由 compose 注入）
//
// 保留策略：备份目录内只保留最近 3 份（按文件名排序，删最旧），防磁盘撑爆（2026-08-11 用户拍板：DB 3 份 / uploads 2 份）。
// ============================================
import { mkdirSync, readdirSync, unlinkSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..') // 仓库根目录
// 容器内由 compose 注入 DB_PATH=/app/data/commission.db；本地开发默认仓库根 data/
const DB_PATH = process.env.DB_PATH || resolve(ROOT, 'data/commission.db')
const BACKUP_DIR = process.env.BACKUP_DIR || resolve(ROOT, 'data/backups')
const KEEP = 3 // 2026-08-11 拍板：DB 留存 3 份

function main() {
  // ─── 1. 打开主库（只读验证 + 一致性快照）───
  mkdirSync(BACKUP_DIR, { recursive: true })
  const db = new Database(DB_PATH, { readonly: true })
  db.pragma('busy_timeout = 5000')
  db.prepare('SELECT 1').get() // 打开失败在此抛错（fail-fast）

  // ─── 2. VACUUM INTO 一致性快照 ───
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = join(BACKUP_DIR, `commission.db.bak-${stamp}`)
  // VACUUM INTO 不支持参数绑定，只能拼接；路径由 BACKUP_DIR 控制，单引号转义防注入
  const escaped = dst.replace(/'/g, "''").replace(/\\/g, '/')
  db.prepare(`VACUUM INTO '${escaped}'`).run()
  db.close()

  // ─── 3. 保留策略：只留最近 KEEP 份 ───
  const baks = readdirSync(BACKUP_DIR).filter(f => f.startsWith('commission.db.bak-')).sort()
  while (baks.length > KEEP) {
    unlinkSync(join(BACKUP_DIR, baks.shift()!))
  }

  console.log('BACKUP_OK', dst)
}

try {
  main()
} catch (err) {
  console.error('BACKUP_FAILED', (err as Error).message)
  process.exit(1)
}
