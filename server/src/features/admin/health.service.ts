import db from '../../db/connection.js'
import { constants, readdirSync, statSync } from 'fs'
import { access, statfs } from 'fs/promises'
import { resolve, join } from 'path'

// ============================================
// 系统自检服务（HC）
// 按需触发，不存数据库，不写文件
// ============================================

const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
const DATA_DIR = resolve(process.env.DB_PATH || './data/commission.db').replace(/[/\\][^/\\]+$/, '')

/** 单项检查结果 */
interface HealthCheckResult {
  id: string
  name: string
  status: string
  summary: string
  detail: Record<string, unknown>
}

/** 1. 数据库连接：SELECT 1 + 临时表读写 */
function checkDb(): HealthCheckResult {
  try {
    db.prepare('SELECT 1').get()
    // 写入临时表再删
    db.exec('CREATE TABLE IF NOT EXISTS _health_check_tmp (v INTEGER)')
    db.prepare('INSERT INTO _health_check_tmp (v) VALUES (1)').run()
    const row = db.prepare('SELECT v FROM _health_check_tmp').get() as { v: number } | undefined
    db.exec('DROP TABLE _health_check_tmp')
    if (row?.v !== 1) {
      return { id: 'db', name: '数据库连接', status: 'fail', summary: '读写验证失败', detail: { readBack: row } }
    }
    return { id: 'db', name: '数据库连接', status: 'ok', summary: '读写正常', detail: {} }
  } catch (err) {
    return { id: 'db', name: '数据库连接', status: 'fail', summary: (err as Error).message, detail: { error: (err as Error).message } }
  }
}

/** 2. 迁移版本：对比已应用 vs 最新 */
function checkMigration(latestVersion: number): HealthCheckResult {
  try {
    const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version ASC').all() as Array<{ version: number; name: string }>
    const applied = rows.length > 0 ? rows[rows.length - 1].version : 0
    const isLatest = applied >= latestVersion
    return {
      id: 'migration', name: '迁移版本',
      status: isLatest ? 'ok' : 'warn',
      summary: isLatest ? `v${applied}（最新）` : `v${applied}（落后，最新 v${latestVersion}）`,
      detail: { appliedVersion: applied, latestVersion, migrations: rows }
    }
  } catch (err) {
    return { id: 'migration', name: '迁移版本', status: 'fail', summary: (err as Error).message, detail: { error: (err as Error).message } }
  }
}

/** 3. 上传目录：可读写 */
async function checkUploads(): Promise<HealthCheckResult> {
  try {
    await access(UPLOAD_DIR, constants.R_OK | constants.W_OK)
    return { id: 'uploads', name: '上传目录', status: 'ok', summary: `${UPLOAD_DIR} 可读写`, detail: { path: UPLOAD_DIR } }
  } catch (err) {
    return { id: 'uploads', name: '上传目录', status: 'fail', summary: `${UPLOAD_DIR} 不可访问`, detail: { path: UPLOAD_DIR, error: (err as Error).message } }
  }
}

/** 4. 磁盘空间（仅供参考，Docker 内值可能不准） */
async function checkDisk(): Promise<HealthCheckResult> {
  try {
    const stats = await statfs(UPLOAD_DIR)
    const totalBytes = stats.blocks * stats.bsize
    const freeBytes = stats.bfree * stats.bsize
    const usedBytes = totalBytes - freeBytes
    const totalGB = (totalBytes / 1073741824).toFixed(1)
    const freeGB = (freeBytes / 1073741824).toFixed(1)
    const usedPct = totalBytes > 0 ? ((usedBytes / totalBytes) * 100).toFixed(1) : '0'
    return {
      id: 'disk', name: '磁盘空间',
      status: 'ok',
      summary: `剩余 ${freeGB} GB / 共 ${totalGB} GB（仅供参考）`,
      detail: { path: UPLOAD_DIR, totalGB, freeGB, usedPct: `${usedPct}%`, note: 'Docker 内值可能不准，仅供参考' }
    }
  } catch (err) {
    return { id: 'disk', name: '磁盘空间', status: 'warn', summary: '无法获取磁盘信息', detail: { error: (err as Error).message } }
  }
}

/** 5. 数据完整性：孤儿记录检查 */
function checkIntegrity(): HealthCheckResult {
  try {
    const checks: Array<{ table: string; orphans: number }> = []
    // orders → artists
    const orphanOrders = (db.prepare(
      'SELECT COUNT(*) as c FROM orders o LEFT JOIN artists a ON o.artist_id = a.id WHERE a.id IS NULL'
    ).get() as { c: number }).c
    checks.push({ table: 'orders→artists', orphans: orphanOrders })

    // orders → style_sizes（style_size_id 可为 NULL，只查非 NULL 的；SPEC-PRICE-2 替代旧 tiers 检查）
    const orphanSizes = (db.prepare(
      'SELECT COUNT(*) as c FROM orders o LEFT JOIN style_sizes ss ON o.style_size_id = ss.id WHERE o.style_size_id IS NOT NULL AND ss.id IS NULL'
    ).get() as { c: number }).c
    checks.push({ table: 'orders→style_sizes', orphans: orphanSizes })

    // order_extra_items → orders
    const orphanExtras = (db.prepare(
      'SELECT COUNT(*) as c FROM order_extra_items e LEFT JOIN orders o ON e.order_id = o.id WHERE o.id IS NULL'
    ).get() as { c: number }).c
    checks.push({ table: 'order_extra_items→orders', orphans: orphanExtras })

    const totalOrphans = orphanOrders + orphanSizes + orphanExtras
    return {
      id: 'integrity', name: '数据完整性',
      status: totalOrphans === 0 ? 'ok' : 'warn',
      summary: totalOrphans === 0 ? '无孤儿记录' : `发现 ${totalOrphans} 条孤儿记录`,
      detail: { checks }
    }
  } catch (err) {
    return { id: 'integrity', name: '数据完整性', status: 'fail', summary: (err as Error).message, detail: { error: (err as Error).message } }
  }
}

/** 6. 备份状态：扫描 data/*.bak.* 最新文件 */
function checkBackup(): HealthCheckResult {
  try {
    let latest: string | null = null
    let latestTime = 0
    try {
      const files = readdirSync(DATA_DIR)
      for (const f of files) {
        if (f.includes('.bak.')) {
          const st = statSync(join(DATA_DIR, f))
          if (st.mtimeMs > latestTime) {
            latestTime = st.mtimeMs
            latest = f
          }
        }
      }
    } catch { /* DATA_DIR 不存在 */ }

    if (!latest) {
      return { id: 'backup', name: '备份状态', status: 'warn', summary: '未找到备份文件', detail: { path: DATA_DIR } }
    }
    const age = Date.now() - latestTime
    const ageDays = (age / 86400000).toFixed(1)
    return {
      id: 'backup', name: '备份状态',
      status: age > 7 * 86400000 ? 'warn' : 'ok',
      summary: `最近备份：${latest}（${ageDays} 天前）`,
      detail: { path: DATA_DIR, latestFile: latest, latestTime: new Date(latestTime).toISOString(), ageDays }
    }
  } catch (err) {
    return { id: 'backup', name: '备份状态', status: 'warn', summary: '检查失败', detail: { error: (err as Error).message } }
  }
}

/** 7. JWT_SECRET：检查是否为默认值/空值 */
function checkSecret(): HealthCheckResult {
  const secret = process.env.SESSION_SECRET
  const DEFAULTS = ['dev-cookie-secret-change-in-production', 'dev-secret', '']
  if (!secret) {
    return { id: 'secret', name: 'JWT_SECRET', status: 'fail', summary: 'SESSION_SECRET 未设置', detail: { set: false } }
  }
  if (DEFAULTS.includes(secret) || secret.length < 32) {
    return { id: 'secret', name: 'JWT_SECRET', status: 'warn', summary: 'SESSION_SECRET 为默认值或过短', detail: { set: true, length: secret.length } }
  }
  return { id: 'secret', name: 'JWT_SECRET', status: 'ok', summary: '已配置（长度 ' + secret.length + '）', detail: { set: true, length: secret.length } }
}

/** 8. Node 版本（信息项，永远 ok） */
function checkNode(): HealthCheckResult {
  return { id: 'node', name: 'Node 版本', status: 'ok', summary: process.version, detail: { version: process.version, platform: process.platform, arch: process.arch } }
}

/** 执行全部 8 项检查 */
export async function runHealthChecks(latestVersion: number): Promise<HealthCheckResult[]> {
  return [
    checkDb(),
    checkMigration(latestVersion),
    await checkUploads(),
    await checkDisk(),
    checkIntegrity(),
    checkBackup(),
    checkSecret(),
    checkNode()
  ]
}

/** 生成诊断包（检查结果 + 环境信息，不含敏感数据） */
export async function buildDiagnosticReport(latestVersion: number) {
  const checks = await runHealthChecks(latestVersion)
  return {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    checks,
    env: {
      NODE_ENV: process.env.NODE_ENV || 'development',
      DB_PATH: process.env.DB_PATH || './data/commission.db',
      UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
      PORT: process.env.PORT || '3000'
    }
  }
}
