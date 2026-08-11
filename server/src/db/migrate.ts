/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { copyFileSync, existsSync } from 'fs'
import type Database from 'better-sqlite3'
import { schema, schemaIndexes } from './schema.js'
import { MIGRATIONS } from './migrations/index.js'
import type { IdRow } from './migrations/types.js'

/**
 * 迁移前自动备份（仅文件数据库）— P0-10: 抽取自 13 处复制粘贴的迁移备份逻辑
 * 行为与原实现完全一致：备份文件名 dbPath.bak.vN、成功/失败日志格式不变
 */
export function backupDbBeforeMigration(version: number) {
  const dbPath = process.env.DB_PATH || './data/commission.db'
  if (dbPath !== ':memory:' && existsSync(dbPath)) {
    try {
      copyFileSync(dbPath, `${dbPath}.bak.v${version}`)
      console.log(`📦 迁移 v${version}: 已备份 ${dbPath} → ${dbPath}.bak.v${version}`)
    } catch (err) {
      console.warn(`⚠️ 迁移 v${version}: 备份失败（${err instanceof Error ? err.message : String(err)}），继续执行迁移`)
    }
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
 * 在给定数据库实例上执行建库 + 版本化迁移
 */
export function initDatabase(database: Database.Database) {
  database.exec(schema)

  // ─── 版本化迁移 ───
  const applied = new Set(
    (database.prepare('SELECT version FROM schema_migrations').all() as SchemaMigrationRow[]).map(r => r.version)
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    if (migration.noTransaction) {
      // ⚠️ v0.35 事故教训：PRAGMA foreign_keys 在事务内是 no-op。
      // 重建表类迁移（DROP/RENAME 父表会触发子表 CASCADE）必须事务外执行，
      // 由迁移自己管理 PRAGMA + 事务（SQLite 官方 12 步 ALTER TABLE 流程）
      migration.up(database)
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name)
    } else {
      database.transaction(() => {
        migration.up(database)
        database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
          .run(migration.version, migration.name)
      })()
    }
    console.log(`📦 迁移 v${migration.version}: ${migration.name} 已应用`)
  }

  // 可靠性：索引在迁移之后执行 — 老库升级时列可能由迁移添加，提前建索引会崩溃
  database.exec(schemaIndexes)

  // ─── 确保平台配置有默认值 ───
  database.exec(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('admin_qq', '')
  `)

  // ─── REQ-038: 开箱设置模式 — 不再自举管理员，运行时由 setup 守卫决定 ───
  // setup_completed（空=未完成，1=已完成）、onboarding_mode（invite=邀请制）
  database.exec(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('setup_completed', '');
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('onboarding_mode', 'invite');
  `)
}
