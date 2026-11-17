import db, { REPO_ROOT } from '../../db/connection.js'
import { constants, readdirSync, statSync } from 'fs'
import type { StatsFs } from 'fs'
import { access, statfs } from 'fs/promises'
import { resolve, join } from 'path'
import { isDbBackupFile, resolveBackupDir } from '../../shared/backup-paths.js'

// ============================================
// 系统自检服务（HC）
// 按需触发，不存数据库，不写文件
// ============================================

// 815 审计 P1-8：默认路径钉在仓库根（不依赖 cwd）
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(REPO_ROOT, 'uploads'))
const DATA_DIR = resolve(process.env.DB_PATH || join(REPO_ROOT, 'data/commission.db')).replace(/[/\\][^/\\]+$/, '')
/** 上传磁盘水位缺省阈值（MB）——见 diskMinFreeMb */
const UPLOAD_DISK_MIN_FREE_MB_DEFAULT = 512

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

/**
 * 上传磁盘水位阈值（MB，GHSA-6pf3-g4xq-854w Wave1·高：把 checkDisk 的 statfs 结果接成守卫）
 * env UPLOAD_DISK_MIN_FREE_MB，缺省 512MB（守卫默认开启——不设阈值就等于没接上守卫）；
 * 显式配 0 = 关闭守卫（开发机/小盘自部署的出口），非数字或负数按缺省值处理。
 */
export function diskMinFreeMb(): number {
  const raw = process.env.UPLOAD_DISK_MIN_FREE_MB
  if (raw === undefined || raw === '') return UPLOAD_DISK_MIN_FREE_MB_DEFAULT
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : UPLOAD_DISK_MIN_FREE_MB_DEFAULT
}

/** 磁盘水位读数（free 与阈值同源计算，报表与守卫不劈叉） */
export interface DiskHeadroom {
  /** 是否允许继续接收公开上传 */
  ok: boolean
  /** 剩余空间（MB）；statfs 不可用时为 null */
  freeMb: number | null
  /** 阈值（MB），0 = 守卫关闭 */
  minFreeMb: number
  /** statfs 不可用的原因（null = 取到值）；此时 ok 视为 true（不因探针故障阻断上传） */
  probeError: string | null
}

/**
 * statfs 读数 → 水位判定（纯计算，报表与守卫共用同一个函数，杜绝两套判据劈叉）。
 * 阈值 0 = 守卫关闭（运维显式声明），其余情况按「可用 MB ≥ 阈值 MB」放行。
 */
function headroomFromStats(stats: Pick<StatsFs, 'bfree' | 'bsize'>, minFreeMb: number): DiskHeadroom {
  const freeMb = Math.floor((stats.bfree * stats.bsize) / (1024 * 1024))
  return { ok: minFreeMb <= 0 || freeMb >= minFreeMb, freeMb, minFreeMb, probeError: null }
}

/**
 * statfs 剩余空间 → 上传水位判定。dir 默认取本模块 UPLOAD_DIR（与自检报表同一口径），
 * 上传路由会传入自己那份 UPLOAD_DIR，保证量的是真正落盘的那块盘。
 */
export async function getDiskHeadroom(dir: string = UPLOAD_DIR): Promise<DiskHeadroom> {
  const minFreeMb = diskMinFreeMb()
  try {
    return headroomFromStats(await statfs(dir), minFreeMb)
  } catch (err) {
    return { ok: true, freeMb: null, minFreeMb, probeError: (err as Error).message }
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
    // 水位低于阈值时报表不再恒 'ok'：判据与上传守卫同一个函数（同一次 statfs 读数），
    // 免得自检说没事、上传却被拒（两条口径劈叉是审计反复咬过的坑）
    const headroom = headroomFromStats(stats, diskMinFreeMb())
    if (!headroom.ok) {
      return {
        id: 'disk', name: '磁盘空间', status: 'warn',
        summary: `剩余 ${freeGB} GB / 共 ${totalGB} GB，低于上传水位阈值 ${headroom.minFreeMb} MB——公开参考图上传已暂停接收`,
        detail: {
          path: UPLOAD_DIR, totalGB, freeGB, usedPct: `${usedPct}%`,
          freeMb: headroom.freeMb, minFreeMb: headroom.minFreeMb,
          note: 'Docker 内值可能不准，仅供参考；低于阈值时上传守卫会拒绝公开参考图上传'
        }
      }
    }
    return {
      id: 'disk', name: '磁盘空间',
      status: 'ok',
      summary: `剩余 ${freeGB} GB / 共 ${totalGB} GB（仅供参考）`,
      detail: {
        path: UPLOAD_DIR, totalGB, freeGB, usedPct: `${usedPct}%`,
        minFreeMb: headroom.minFreeMb,
        note: 'Docker 内值可能不准，仅供参考'
      }
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

/**
 * 6. 备份状态：扫描真实备份目录（U044）
 *
 * 事故：本函数原扫 DATA_DIR（由 DB_PATH 推出的数据目录，readdirSync 非递归），而正式备份产物
 * 写在 BACKUP_DIR（默认 <数据目录>/backups，见 scripts/backup-db.ts）——子目录里的新备份永远
 * 扫不到，健康页恒显示「备份正常」；只挂 BACKUP_DIR 的部署反倒误报「未找到备份」。
 * 路径口径现由 shared/backup-paths.ts 统一给出，与 backup-db.ts 取的是同一个函数。
 *
 * 为什么两处都扫：正式备份在备份目录，而迁移前自动备份（db/migrate.ts 的 .bak.vN）与老部署的
 * 历史备份留在数据目录根下——只认一处就会把「有备份」误报成「没备份」。
 */
function checkBackup(): HealthCheckResult {
  const backupDir = resolveBackupDir(DATA_DIR)
  try {
    const { latest, backupDirExists } = scanLatestBackup(backupDir, DATA_DIR)
    const base = { path: DATA_DIR, backupDir, backupDirExists }

    if (!latest) {
      // 「从未备份」（备份目录都不存在）与「备份失败」（目录在、却一个产物都没有）是两种健康状态：
      // backup-db.ts 先 mkdirSync 再 VACUUM INTO，备份失败就只剩一个空目录，前端文案须能区分。
      return backupDirExists
        ? { id: 'backup', name: '备份状态', status: 'warn', summary: '备份目录存在但没有任何备份文件（备份任务可能失败）', detail: { ...base, state: 'failed' } }
        : { id: 'backup', name: '备份状态', status: 'warn', summary: '从未执行过备份（备份目录不存在）', detail: { ...base, state: 'never' } }
    }

    const age = Date.now() - latest.time
    const ageDays = (age / 86400000).toFixed(1)
    const stale = age > 7 * 86400000
    return {
      id: 'backup', name: '备份状态',
      status: stale ? 'warn' : 'ok',
      summary: `最近备份：${latest.file}（${ageDays} 天前）`,
      detail: {
        ...base,
        state: stale ? 'stale' : 'ok',
        latestFile: latest.file,
        latestPath: join(latest.dir, latest.file),
        latestTime: new Date(latest.time).toISOString(),
        ageDays
      }
    }
  } catch (err) {
    return { id: 'backup', name: '备份状态', status: 'warn', summary: '检查失败', detail: { error: (err as Error).message } }
  }
}

/**
 * 扫备份目录 + 数据目录根，取 mtime 最新的备份产物。
 * 目录不存在、扫描期间文件被轮转删掉都只跳过（不抛错）——目录不存在是全新部署的正常形态，
 * 不能把健康检查整项打成「检查失败」。
 */
function scanLatestBackup(backupDir: string, dataDir: string): {
  latest: { dir: string; file: string; time: number } | null
  backupDirExists: boolean
} {
  let backupDirExists = false
  let latest: { dir: string; file: string; time: number } | null = null

  for (const dir of [backupDir, dataDir]) {
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue // 该位置不存在 = 全新部署还没跑过备份（或老部署本就没有）
    }
    if (dir === backupDir) backupDirExists = true
    for (const f of files) {
      if (!isDbBackupFile(f)) continue
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(join(dir, f))
      } catch {
        continue
      }
      if (!latest || st.mtimeMs > latest.time) latest = { dir, file: f, time: st.mtimeMs }
    }
  }
  return { latest, backupDirExists }
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
      // 815 审计 P1-8：诊断包路径口径与运行时一致（钉仓库根）
      DB_PATH: process.env.DB_PATH || join(REPO_ROOT, 'data/commission.db'),
      UPLOAD_DIR: process.env.UPLOAD_DIR || join(REPO_ROOT, 'uploads'),
      PORT: process.env.PORT || '3000'
    }
  }
}
