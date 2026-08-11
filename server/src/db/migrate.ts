/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { copyFileSync, existsSync } from 'fs'
import type Database from 'better-sqlite3'
import { schema, schemaIndexes } from './schema.js'
import { MIGRATIONS } from './migrations/index.js'
import type { CountRow, DefaultWorkflowTemplateRow, IdRow } from './migrations/types.js'

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

/** platform_config 表行 */
interface PlatformConfigRow {
  value: string
}

/**
 * 在给定数据库实例上执行建表 + 版本化迁移
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

  // ─── 管理员自举 — 首次部署自动创建管理员账号 ───
  const adminQq = process.env.ADMIN_QQ

  // P1-4 (2026-08-05): 生产环境 fail-fast —— 缺 ADMIN_QQ 且无管理员账号时启动即抛错，
  // 不静默死锁到登录时才暴露（TOTP 上线后无管理员 = 无人能绑定/登录，恢复只能靠 CLI 重置）。
  // 判定：环境变量缺失，且 platform_config.admin_qq 为空或其对应画师账号不存在 → 抛错退出。
  // 已有管理员账号（重启场景，配置已持久化）不抛错；开发环境保持原静默行为。
  if (!adminQq && process.env.NODE_ENV === 'production') {
    const configuredRow = database.prepare(
      "SELECT value FROM platform_config WHERE key = 'admin_qq'"
    ).get() as PlatformConfigRow | undefined
    const configuredQq = (configuredRow && configuredRow.value) || ''
    const adminExists = configuredQq
      ? database.prepare('SELECT id FROM artists WHERE qq_number = ?').get(configuredQq)
      : undefined
    if (!adminExists) {
      throw new Error(
        '生产环境禁止无管理员启动：ADMIN_QQ 环境变量缺失且平台未配置管理员账号。' +
        '请在 .env 设置 ADMIN_QQ=<管理员QQ号>（参考仓库根 .env.example）后重新启动。'
      )
    }
  }

  if (adminQq) {
    // 测试环境跳过：测试用 cleanDb+setAdmin 自建管理员，避免 init 插入干扰断言（TC-AR-01/10 预存失败修复）
    if (process.env.NODE_ENV === 'test') return
    // 仅当 admin_qq 为空时写入（不覆盖运行时更换的值）
    database.prepare(
      "UPDATE platform_config SET value = ? WHERE key = 'admin_qq' AND (value = '' OR value IS NULL)"
    ).run(adminQq)

    // 确保管理员画师账号存在
    const existing = database.prepare('SELECT id FROM artists WHERE qq_number = ?').get(adminQq) as IdRow | undefined
    if (!existing) {
      try {
        // R1-3: 检查 subdomain 和 artist_code 是否冲突
        const conflict = database.prepare(
          'SELECT id FROM artists WHERE subdomain = ? OR artist_code = ?'
        ).get('admin', 'ADMIN')
        if (conflict) {
          // 用 QQ 号做子域名兜底
          const fallbackSubdomain = `admin${adminQq.slice(-4)}`
          const fallbackCode = `AD${adminQq.slice(-4)}`
          database.prepare(`
            INSERT INTO artists (qq_number, name, subdomain, artist_code, bio, status, contact_qq)
            VALUES (?, 'Admin', ?, ?, '平台管理员', 'open', ?)
          `).run(adminQq, fallbackSubdomain, fallbackCode, adminQq)
          console.log(`✅ 管理员账号已创建 (QQ: ${adminQq}, subdomain: ${fallbackSubdomain})`)
        } else {
          database.prepare(`
            INSERT INTO artists (qq_number, name, subdomain, artist_code, bio, status, contact_qq)
            VALUES (?, 'Admin', 'admin', 'ADMIN', '平台管理员', 'open', ?)
          `).run(adminQq, adminQq)
        }
        const admin = database.prepare('SELECT id FROM artists WHERE qq_number = ?').get(adminQq) as IdRow
        database.prepare('INSERT OR IGNORE INTO commission_rules (artist_id, content) VALUES (?, ?)').run(admin.id, '')
        // P1-5: 管理员画师也需要工作流种子
        const wfCount = database.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?').get(admin.id) as CountRow
        if (wfCount.c === 0) {
          const tpl = database.prepare('SELECT * FROM default_workflow_template ORDER BY sort_order ASC').all() as DefaultWorkflowTemplateRow[]
          const ins = database.prepare('INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points, speech_template) VALUES (?, ?, ?, ?, ?, ?, ?)')
          for (const t of tpl) ins.run(admin.id, t.name, t.description || null, t.sort_order, t.takes_payment ? 1 : 0, t.basis_points, '{客户名}，你的订单已{节点名}。')
        }
        console.log(`✅ 管理员账号已自动创建 (QQ: ${adminQq})`)
      } catch (err) {
        console.error(`⚠️ 管理员账号创建失败: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}
