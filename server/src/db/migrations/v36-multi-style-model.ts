import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, IdRow, LegacyPriceAddonRow, LegacyPriceTierRow, Migration } from './types.js'

export const migration: Migration = {
    version: 36,
    name: 'multi_style_model',
    up(database) {
      // REQ-023 Phase 1: 多画风模型——5 表 + 老数据迁移
      backupDbBeforeMigration(36, database)

      // ─── 建表（IF NOT EXISTS 幂等） ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS addon_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity','radio')),
          pricing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_mode IN ('fixed','per_unit','per_option')),
          default_price REAL NOT NULL DEFAULT 0,
          options TEXT,
          unit_label TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec(`
        CREATE TABLE IF NOT EXISTS art_styles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          cover_image TEXT,
          sort_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec(`
        CREATE TABLE IF NOT EXISTS style_sizes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          art_style_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          base_price REAL NOT NULL,
          sort_order INTEGER DEFAULT 0,
          FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE CASCADE
        )
      `)
      database.exec(`
        CREATE TABLE IF NOT EXISTS style_addons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          art_style_id INTEGER NOT NULL,
          addon_template_id INTEGER NOT NULL,
          is_enabled INTEGER DEFAULT 1,
          price_override REAL,
          options_override TEXT,
          FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE CASCADE,
          FOREIGN KEY (addon_template_id) REFERENCES addon_templates(id) ON DELETE CASCADE,
          UNIQUE(art_style_id, addon_template_id)
        )
      `)
      database.exec(`
        CREATE TABLE IF NOT EXISTS size_addon_overrides (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          style_size_id INTEGER NOT NULL,
          style_addon_id INTEGER NOT NULL,
          price_override REAL,
          is_hidden INTEGER DEFAULT 0,
          FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE CASCADE,
          FOREIGN KEY (style_addon_id) REFERENCES style_addons(id) ON DELETE CASCADE,
          UNIQUE(style_size_id, style_addon_id)
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_addon_templates_artist ON addon_templates(artist_id, sort_order)')
      database.exec('CREATE INDEX IF NOT EXISTS idx_art_styles_artist ON art_styles(artist_id, sort_order)')
      database.exec('CREATE INDEX IF NOT EXISTS idx_style_sizes_style ON style_sizes(art_style_id, sort_order)')
      database.exec('CREATE INDEX IF NOT EXISTS idx_style_addons_style ON style_addons(art_style_id)')
      database.exec('CREATE INDEX IF NOT EXISTS idx_size_addon_overrides_size ON size_addon_overrides(style_size_id)')

      // ─── 老数据迁移（幂等守卫：画师粒度） ───
      // 形状感知守卫（SPEC-PRICE-2 v50）：新库基线已是新形（无 pricing_mode 列）且旧表为空，
      // 无需搬运旧数据（真实老库早已应用过本迁移，不会再到这里）
      const atColsV36 = (database.prepare('PRAGMA table_info(addon_templates)').all() as ColumnInfo[]).map(c => c.name)
      if (!atColsV36.includes('pricing_mode')) return
      // F0081（B2 high）：旧全局守卫 `if (existingStyles > 0) return` 按「任一画师已有画风」跳过全体，
      // 部分迁移/重放时其余画师的旧档位与旧增项被整体放弃（生产库 carol 实例，migrate.ts F5
      // 曾以逐画师守卫补齐过档位）。PR114 M-1 修正：不能再拿 art_styles 当「已迁移」代理键——
      // F5 只补画风/尺寸、从不建 addon_templates，按画风判跳过会让这类画师的旧增项永久静默丢失。
      // 改为画风/增项两个独立守卫各判各的目标表（详见下方循环）。
      // 前置守卫：v43 已按用户拍板 DROP price_addons、v50 已 DROP price_tiers（冻结依据见两迁移注释），
      // 任一旧表缺失即无可搬数据，直接返回——防修复重放时裸 SELECT 撞「no such table」崩溃
      const legacyTableExists = (table: string) => !!database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
      ).get(table)
      if (!legacyTableExists('price_tiers') || !legacyTableExists('price_addons')) return

      // PR114 M-1：两个独立守卫各判各的目标表，取并集进入循环，循环内再各自判定：
      //   - 画风守卫判 art_styles（F5 migrateF5OldModelArtists 只建画风+尺寸、从不建 addon_templates；
      //     该画师 art_styles 非空但 addon_templates 仍空，旧代理键会整块跳过 → 旧增项静默永久丢失）
      //   - 增项守卫判目标表 addon_templates（F5 补过画风的画师在此守卫下继续搬运旧增项）
      // F5 自身的 art_styles 守卫（migrate.ts:109）保持不变——若 F5 也改判 addon_templates 会漏建画风。
      const artists = database.prepare(
        `SELECT id FROM artists
         WHERE NOT EXISTS (SELECT 1 FROM art_styles WHERE art_styles.artist_id = artists.id)
            OR NOT EXISTS (SELECT 1 FROM addon_templates WHERE addon_templates.artist_id = artists.id)`
      ).all() as IdRow[]
      const selectStyle = database.prepare(
        'SELECT id FROM art_styles WHERE artist_id = ? ORDER BY id ASC LIMIT 1'
      )
      const selectTemplate = database.prepare(
        'SELECT id FROM addon_templates WHERE artist_id = ? ORDER BY sort_order ASC'
      )
      const insertStyle = database.prepare(
        'INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, ?, 0, 1)'
      )
      const insertSize = database.prepare(
        'INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)'
      )
      // PR114 M-2：按 (artist_id, name) 查重后再插——重放（删 art_styles 模拟版本表丢失）
      // 时同名模板不得翻倍（增项按行计价，重复行=重复计增项，资金侧）。
      // 不依赖 UNIQUE 约束：老库表可能无该约束，用 INSERT...SELECT...WHERE NOT EXISTS 通用兜底。
      const insertTemplate = database.prepare(
        `INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, unit_label, sort_order)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM addon_templates WHERE artist_id = ? AND name = ?
         )`
      )
      const insertStyleAddon = database.prepare(
        'INSERT OR IGNORE INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, 1, NULL)'
      )

      for (const artist of artists) {
        // 1. 默认画风：仅在确无画风时建（F5 补过画风的画师沿用其画风，不重建）
        const existingStyle = selectStyle.get(artist.id) as IdRow | undefined
        const styleId = existingStyle
          ? existingStyle.id
          : Number(insertStyle.run(artist.id, '默认').lastInsertRowid)

        // 2. price_tiers → style_sizes：仅在本次新建画风时搬运（F5 已搬过的尺寸不重复塞）
        if (!existingStyle) {
          const tiers = database.prepare(
            'SELECT * FROM price_tiers WHERE artist_id = ? ORDER BY sort_order ASC'
          ).all(artist.id) as LegacyPriceTierRow[]
          for (const tier of tiers) {
            insertSize.run(styleId, tier.name, tier.price, tier.sort_order ?? 0)
          }
        }

        // 3. price_addons → addon_templates：仅在目标表无该画师行时搬运
        // 映射：toggle→switch, quantity→quantity, inquiry→radio；percent→fixed（v1 不支持百分比增项）
        if (!selectTemplate.get(artist.id)) {
          const addons = database.prepare(
            'SELECT * FROM price_addons WHERE artist_id = ? ORDER BY sort_order ASC'
          ).all(artist.id) as LegacyPriceAddonRow[]
          const controlIdMap = { toggle: 'switch', quantity: 'quantity', inquiry: 'radio' }
          for (const addon of addons) {
            const controlType = controlIdMap[addon.select_mode] || 'switch'
            const pricingMode = 'fixed' // percent 也转为 fixed（v1 不支持百分比增项）
            insertTemplate.run(
              artist.id,
              addon.name,
              controlType,
              pricingMode,
              addon.price_value,
              controlType === 'quantity' ? '个' : null,
              addon.sort_order ?? 0,
              artist.id,
              addon.name
            )
          }
        }

        // 4. 默认画风关联所有增项模板（INSERT OR IGNORE 保证幂等）
        for (const tpl of selectTemplate.all(artist.id) as IdRow[]) {
          insertStyleAddon.run(styleId, tpl.id)
        }
      }
    }
  }
