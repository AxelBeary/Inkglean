/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { existsSync, unlinkSync, readdirSync } from 'fs'
import { resolve } from 'path'
import type Database from 'better-sqlite3'
import { REPO_ROOT } from './connection.js'
import { schema, schemaIndexes } from './schema.js'
import { MIGRATIONS } from './migrations/index.js'
import type { IdRow } from './migrations/types.js'

/**
 * 迁移前自动备份（仅文件数据库）— P0-10: 抽取自 13 处复制粘贴的迁移备份逻辑
 * 815 审计修复：裸 copyFileSync 改一致性快照（对齐 backup-db.ts 日常备份口径）；
 * 备份失败不再"警告后继续破坏性迁移"，改为抛错中止。
 * SRV-06 后仅事务外（noTransaction 破坏性重建迁移）走 VACUUM INTO 产快照；常规迁移全程在
 * SRV-06 的 BEGIN IMMEDIATE 原子事务内，事务即回滚单元，事务内 per-version 备份跳过（详见函数体）。
 * 文件名沿用 dbPath.bak.vN 不变（回滚脚本/测试依赖此命名）。
 *
 * SRV-07 修复：备份成功后执行保留策略——只保留最近 BAK_KEEP_COUNT 个 .bak.vN 文件，
 * 多余的按版本号升序（最旧的先删）清理，防止全新装/跨版本升级一次性产出 23 份
 * 整库备份撑爆磁盘。
 */
const BAK_KEEP_COUNT = 3

export function backupDbBeforeMigration(version: number, database: Database.Database) {
  // 815 审计 P1-8：默认路径钉在仓库根（不依赖 cwd，与 connection.ts 同口径）
  const dbPath = process.env.DB_PATH || resolve(REPO_ROOT, 'data/commission.db')
  if (dbPath === ':memory:' || !existsSync(dbPath)) return
  // SRV-06 后：全部常规迁移在一个 BEGIN IMMEDIATE 原子事务内跑完——任一迁移失败即整体 ROLLBACK
  // 回到运行前状态，事务本身就是回滚单元，事务内 per-version 文件备份对运行内安全冗余；且事务内
  // wal_checkpoint(TRUNCATE) 与活动写事务互斥必报 database table is locked（v68 生产首部署实测，
  // SRV-06 单事务化后对每个常规迁移必现），产不出一致快照。真正需要文件级回滚快照的破坏性重建
  // 迁移一律声明 noTransaction（SRV-06 先 COMMIT 释放事务，走下方事务外 VACUUM INTO，见
  // v38/43/49/50/64/67~71），故事务内直接跳过备份。
  if (database.inTransaction) {
    console.log(`📦 迁移 v${version}: 事务内跳过文件备份（SRV-06 原子事务即回滚单元；破坏性迁移走 noTransaction + VACUUM INTO）`)
    return
  }
  const bakPath = `${dbPath}.bak.v${version}`
  try {
    // 同名旧备份先移除（只删本函数产出的 .bak.vN 命名；VACUUM INTO 要求目标不存在）
    if (existsSync(bakPath)) unlinkSync(bakPath)
    // 事务外（noTransaction 破坏性重建迁移）：VACUUM INTO 产出一致性快照
    database.prepare(`VACUUM INTO '${bakPath.replaceAll("'", "''")}'`).run()
    console.log(`📦 迁移 v${version}: 已备份 ${dbPath} → ${bakPath}`)
  } catch (err) {
    // 815 审计：备份失败即中止——没有可回滚快照就不允许跑破坏性迁移
    throw new Error(`迁移 v${version}: 迁移前备份失败，已中止以防无法回滚（${err instanceof Error ? err.message : String(err)}）`)
  }

  // SRV-07: 备份保留策略——只留最近 BAK_KEEP_COUNT 个 .bak.vN（按版本号降序保留）
  pruneOldMigrationBackups(dbPath)
}

/**
 * SRV-07: 清理多余的迁移备份文件（.bak.vN）
 * 保留策略：只保留最近 BAK_KEEP_COUNT 个版本号的备份（含刚写入的当前版本）。
 * 按版本号降序排列后，超出保留数的最旧文件删除。
 * 容错：清理失败不阻断迁移（只 warn），回滚脚本依赖的最近 N 份始终存在。
 */
function pruneOldMigrationBackups(dbPath: string): void {
  try {
    const dir = resolve(dbPath, '..')
    const baseName = dbPath.split(/[\\/]/).pop() || 'commission.db'
    // 构造匹配 .bak.vN 的正则（转义 baseName 中的点号）
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const bakPattern = new RegExp(`^${escaped}\\.bak\\.v(\\d+)$`)
    const bakFiles = readdirSync(dir)
      .map(f => { const m = bakPattern.exec(f); return m ? { name: f, version: parseInt(m[1], 10) } : null })
      .filter((f): f is { name: string; version: number } => f !== null)
      .sort((a, b) => b.version - a.version) // 版本号降序（最新在前）

    if (bakFiles.length <= BAK_KEEP_COUNT) return

    // 删除超出保留数的旧备份
    const toDelete = bakFiles.slice(BAK_KEEP_COUNT)
    for (const bak of toDelete) {
      try {
        unlinkSync(resolve(dir, bak.name))
        console.log(`🗑️ 迁移备份清理: 删除旧备份 ${bak.name}（保留最近 ${BAK_KEEP_COUNT} 份）`)
      } catch {
        // 单个文件删除失败不阻断（可能被其他进程持有句柄）
      }
    }
  } catch {
    // 目录读取失败不阻断迁移——保留策略是优化非关键路径
  }
}

/**
 * F5: 旧模型画师迁移 —— art_styles 为零的画师建「默认」画风，visible 档位转尺寸
 *
 * 逐画师幂等：已有 art_styles 的画师跳过；重复执行不产生重复数据。
 * v36 全局守卫（任一画师有 art_styles 即跳过全体）会漏掉后建画师（如生产库 carol），
 * 此处用逐画师 NOT EXISTS 守卫补齐。
 * 只搬 visible 档位的 name/price/sort_order；图/描述/天数不搬（画师重写）。
 * 导出供测试直接调用。
 */
export function migrateF5OldModelArtists(database: Database.Database) {
  // SPEC-PRICE-2 v50 守卫：新库基线经 v50 后 price_tiers 已 DROP，无旧数据可搬，直接跳过
  const tierTable = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='price_tiers'").get()
  if (!tierTable) {
    console.log('📦 迁移 F5: price_tiers 表不存在（v50 后新库），跳过')
    return
  }

  const unmigratedArtists = database.prepare(`
    SELECT id FROM artists
    WHERE deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM art_styles WHERE art_styles.artist_id = artists.id)
  `).all() as IdRow[]

  if (unmigratedArtists.length === 0) {
    console.log('📦 迁移 F5: 无旧模型画师，跳过数据迁移')
    return
  }

  const insertStyle = database.prepare(
    "INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)"
  )
  const insertSize = database.prepare(
    'INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)'
  )
  for (const artist of unmigratedArtists) {
    const styleResult = insertStyle.run(artist.id)
    const styleId = Number(styleResult.lastInsertRowid)
    const tiers = database.prepare(`
      SELECT name, price, sort_order FROM price_tiers
      WHERE artist_id = ? AND (visibility IS NULL OR visibility = 'visible')
      ORDER BY sort_order ASC
    `).all(artist.id) as { name: string; price: number; sort_order: number | null }[]
    for (const tier of tiers) {
      insertSize.run(styleId, tier.name, tier.price, tier.sort_order ?? 0)
    }
    console.log(`📦 迁移 F5: 画师 ${artist.id} 建「默认」画风 + ${tiers.length} 尺寸（showcase/hidden 已丢弃）`)
  }
}

/** schema_migrations 表行 */
interface SchemaMigrationRow {
  version: number
}

/**
 * SRV-06: 迁移跨进程互斥等待时长（毫秒）。
 * SQLite busy_timeout 在此期间内持续重试获取写锁（OS 级等待，非 spin）；
 * 超时仍未获取 → 抛错让调用方决定重试/退出。
 * 30 秒覆盖绝大多数正常迁移耗时（76 个迁移全新装约 2~5 秒）。
 */
const MIGRATION_LOCK_TIMEOUT_MS = 30_000

/**
 * 在给定数据库实例上执行建库 + 版本化迁移
 *
 * SRV-06 修复：整段迁移逻辑用 BEGIN IMMEDIATE 抢排他写锁保护，消除跨进程并发迁移：
 * - 抢锁成功 → 锁内读 applied 快照（一致性保证）、跑迁移、COMMIT 释放
 * - 抢锁失败（SQLITE_BUSY 超时）→ 抛错让 index.ts 捕获并 exit(1)，由编排器重启
 * - noTransaction 迁移需事务外执行 → 临时 COMMIT 释放锁、执行、重新抢锁 + 刷新 applied；
 *   安全性由各 noTransaction 迁移自身的幂等守卫保证（列/表已存在即跳过）
 * - INSERT schema_migrations 改 INSERT OR IGNORE 兜底极端并发窗口
 */
export function initDatabase(database: Database.Database) {
  database.exec(schema)

  // ─── SRV-06: 跨进程迁移互斥 ───
  // 临时提高 busy_timeout（正常请求 5s 足够，迁移抢锁需更长等待窗口）
  const originalTimeout = (database.pragma('busy_timeout', { simple: true }) as number) || 5000
  database.pragma(`busy_timeout = ${MIGRATION_LOCK_TIMEOUT_MS}`)

  try {
    database.exec('BEGIN IMMEDIATE')
  } catch (err: unknown) {
    database.pragma(`busy_timeout = ${originalTimeout}`)
    const code = (err as { code?: string }).code
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
      throw new Error(
        `数据库迁移互斥锁获取失败（另一进程正在执行迁移，已等待 ${MIGRATION_LOCK_TIMEOUT_MS / 1000} 秒）。` +
        '请确保不同时启动多个实例执行迁移，或等待另一进程完成后重试。'
      )
    }
    throw err
  }

  try {
    // ─── 版本化迁移（锁内读取 applied，保证一致性快照）───
    let applied = new Set(
      (database.prepare('SELECT version FROM schema_migrations').all() as SchemaMigrationRow[]).map(r => r.version)
    )
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      if (migration.noTransaction) {
        // ⚠️ v0.35 事故教训：PRAGMA foreign_keys 在事务内是 no-op。
        // 重建表类迁移（DROP/RENAME 父表会触发子表 CASCADE）必须事务外执行，
        // 由迁移自己管理 PRAGMA + 事务（SQLite 官方 12 步 ALTER TABLE 流程）。
        // SRV-06：临时释放锁 → 执行 → 重新抢锁 + 刷新 applied（幂等守卫保证安全）
        database.exec('COMMIT')
        migration.up(database)
        database.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)')
          .run(migration.version, migration.name)
        database.exec('BEGIN IMMEDIATE')
        // 锁内重新读取 applied（另一进程可能在间隙完成了后续迁移）
        applied = new Set(
          (database.prepare('SELECT version FROM schema_migrations').all() as SchemaMigrationRow[]).map(r => r.version)
        )
      } else {
        // 常规迁移：在 BEGIN IMMEDIATE 事务内使用 database.transaction()
        //（better-sqlite3 检测到已在事务内会自动使用 SAVEPOINT，per-migration 原子性保持）
        database.transaction(() => {
          migration.up(database)
          database.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)')
            .run(migration.version, migration.name)
        })()
      }
      applied.add(migration.version)
      console.log(`📦 迁移 v${migration.version}: ${migration.name} 已应用`)
    }

    database.exec('COMMIT')
  } catch (err) {
    try { database.exec('ROLLBACK') } catch { /* 已不在事务中或已回滚 */ }
    throw err
  } finally {
    // 恢复正常 busy_timeout
    database.pragma(`busy_timeout = ${originalTimeout}`)
  }

  // 可靠性：索引在迁移之后执行 — 老库升级时列可能由迁移添加，提前建索引会崩溃
  database.exec(schemaIndexes)

  // ─── 确保平台配置有默认值 ───
  database.exec(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('admin_qq', '')
  `)

  // 820-L（v68）: 统计功能管理员总开关——默认 0=关闭（用户语义「没开就隐藏」，画师后台隐藏整个统计导航）
  database.exec(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('stats_enabled', '0')
  `)

  // ─── REQ-038: 开箱设置模式 — 不再自举管理员，运行时由 setup 守卫决定 ───
  // setup_completed（空=未完成，1=已完成）、onboarding_mode（invite=邀请制）
  database.exec(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('setup_completed', '');
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('onboarding_mode', 'invite');
  `)
}
