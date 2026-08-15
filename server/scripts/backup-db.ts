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
// 用法：npm run backup                    （容器 cron 每日执行；B 档 daily）
//       npm run backup -- --tier deploy   （部署前执行；A 档 deploy）
//       npm run backup -- --tier weekly   （C 档 weekly；日常由 daily-backup.bat 在周日复制轮转，不直接调用）
//       环境变量：DB_PATH / BACKUP_DIR（默认值见下，容器内由 compose 注入）
//
// 保留策略（2026-08-15 用户拍板三档，约 13 份）：
//   daily   commission.db.bak-<ISO 时间戳>            保留 7 份（昨日/本周窗口）
//   deploy  commission.db.bak-deploy-<ISO 时间戳>     保留 2 份（每次部署前快照）
//   weekly  commission.db.bak-weekly-<ISO 时间戳>     保留 4 份（周日每日备份的复制档，跨周回滚最后手段）
// 轮转严格只认本脚本对应档位正式产物，异名/异档备份（bak.vN、bak-pre-*、bak.empty-* 及另外两档产物）一律不纳入轮转、绝不删除。
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
const KEEP_BY_TIER = {
  daily: 7, // 2026-08-15 拍板：每日档留存 7 份
  deploy: 2, // 2026-08-15 拍板：部署档留存 2 份
  weekly: 4, // 2026-08-15 拍板：每周档留存 4 份
} as const

const TIER_SUFFIX = {
  daily: '',
  deploy: '-deploy',
  weekly: '-weekly',
} as const

type BackupTier = keyof typeof KEEP_BY_TIER

// 正式备份命名：commission.db.bak-<ISO 时间戳>（deploy/weekly 在 bak 后带档位后缀），冒号和点替换为 -，
// 例：commission.db.bak-2026-08-15T04-12-34-567Z / commission.db.bak-deploy-2026-08-15T04-12-34-567Z /
//     commission.db.bak-weekly-2026-08-15T04-12-34-567Z。restore-db.ts / verify-backup.mjs /
// rollback.ps1 / post-merge-deploy.ps1 的取最新与轮转均须与对应档位模式等价。
function officialBackupRe(tier: BackupTier): RegExp {
  const suffix = TIER_SUFFIX[tier]
  return new RegExp(`^commission\\.db\\.bak${suffix}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z$`)
}

function parseTier(argv: string[]): BackupTier {
  const idx = argv.indexOf('--tier')
  if (idx === -1) return 'daily'
  const raw = argv[idx + 1]
  if (raw === 'daily' || raw === 'deploy' || raw === 'weekly') return raw
  throw new Error(`未知备份档位: ${raw ?? '(缺值)'}（支持 daily/deploy/weekly）`)
}

function main(tier: BackupTier) {
  // ─── 1. 打开主库（只读验证 + 一致性快照）───
  mkdirSync(BACKUP_DIR, { recursive: true })
  const db = new Database(DB_PATH, { readonly: true })
  db.pragma('busy_timeout = 5000')
  db.prepare('SELECT 1').get() // 打开失败在此抛错（fail-fast）

  // ─── 2. VACUUM INTO 一致性快照 ───
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const suffix = TIER_SUFFIX[tier]
  const keep = KEEP_BY_TIER[tier]
  const dst = join(BACKUP_DIR, `commission.db.bak${suffix}-${stamp}`)
  // VACUUM INTO 不支持参数绑定，只能拼接；路径由 BACKUP_DIR 控制，单引号转义防注入
  const escaped = dst.replace(/'/g, "''").replace(/\\/g, '/')
  db.prepare(`VACUUM INTO '${escaped}'`).run()
  db.close()

  // ─── 3. 保留策略：只留最近 keep 份（只匹配本档位正式命名，绝不删除异名/异档备份）───
  const baks = readdirSync(BACKUP_DIR).filter(f => officialBackupRe(tier).test(f)).sort()
  if (baks.length === 0) {
    // 安全回退：读不到本档位候选时跳过轮转，不删除任何文件（刚产出的 dst 正常情况下必在候选内）
    console.warn(`BACKUP_ROTATE skip: 未读取到 ${tier} 档正式备份候选，跳过轮转（不删除任何文件）`)
  } else {
    while (baks.length > keep) {
      unlinkSync(join(BACKUP_DIR, baks.shift()!))
    }
  }

  console.log('BACKUP_OK', dst)
}

try {
  main(parseTier(process.argv.slice(2)))
} catch (err) {
  console.error('BACKUP_FAILED', (err as Error).message)
  process.exit(1)
}
