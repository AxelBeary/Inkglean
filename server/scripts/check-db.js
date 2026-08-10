/* eslint-disable no-console -- CLI 探测脚本按约定豁免（console 输出是脚本本职） */
/**
 * DB 健康探测（R-6，审计批E，2026-08-11）
 * 用法: node scripts/check-db.js [dbPath]
 * 退出码：0 = 可正常打开且 integrity_check / foreign_key_check 通过；非 0 = 损坏/不可打开。
 *
 * entrypoint.sh 在 exec 起服前调用：打不开/校验失败 → restore-db.ts 自动恢复最近备份。
 * 抽为独立脚本（而非 entrypoint 内联 node -e）是为了可被 vitest 单测；
 * 导出 checkDbIntegrity 供测试直接调用。
 */
import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

/**
 * 探测 DB 可打开性 + 完整性
 * - 文件不存在：返回 ok:false（首启建库场景——initDatabase 会创建，entrypoint 已用 -f 前置跳过）
 * - readonly 打开（探测不写库、不触发 WAL 变更）；integrity_check 必须为 'ok'，
 *   foreign_key_check 必须无悬空引用（双校验与 restore-db.ts 同口径）
 */
export function checkDbIntegrity(dbPath) {
  if (!existsSync(dbPath)) {
    return { ok: false, reason: `DB 文件不存在: ${dbPath}` }
  }
  let db
  try {
    db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 5000')
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') {
      return { ok: false, reason: `integrity_check 未通过: ${String(integrity)}` }
    }
    const fkViolations = db.pragma('foreign_key_check')
    if (fkViolations.length > 0) {
      return { ok: false, reason: `foreign_key_check 发现 ${fkViolations.length} 处悬空引用` }
    }
    return { ok: true, reason: 'ok' }
  } catch (err) {
    return { ok: false, reason: err.message }
  } finally {
    if (db) {
      try { db.close() } catch { /* 探测失败时连接可能已坏，忽略 */ }
    }
  }
}

const DB_PATH = process.env.DB_PATH || resolve('./data/commission.db')

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] || DB_PATH
  const result = checkDbIntegrity(target)
  if (!result.ok) {
    console.error('DB_CHECK_FAILED', result.reason)
    process.exit(1)
  }
  console.log('DB_CHECK_OK', target)
}
