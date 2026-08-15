import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, CountRow, IdRow, LegacyPriceAddonRow, LegacyPriceTierRow, Migration } from './types.js'

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

      // ─── 老数据迁移（幂等：已有 art_styles 数据则跳过） ───
      // 形状感知守卫（SPEC-PRICE-2 v50）：新库基线已是新形（无 pricing_mode 列）且旧表为空，
      // 无需搬运旧数据（真实老库早已应用过本迁移，不会再到这里）
      const atColsV36 = (database.prepare('PRAGMA table_info(addon_templates)').all() as ColumnInfo[]).map(c => c.name)
      if (!atColsV36.includes('pricing_mode')) return
      const existingStyles = (database.prepare('SELECT COUNT(*) AS c FROM art_styles').get() as CountRow).c
      if (existingStyles > 0) return // 已迁移过

      const artists = database.prepare('SELECT id FROM artists').all() as IdRow[]
      const insertStyle = database.prepare(
        'INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, ?, 0, 1)'
      )
      const insertSize = database.prepare(
        'INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)'
      )
      const insertTemplate = database.prepare(
        'INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, unit_label, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      const insertStyleAddon = database.prepare(
        'INSERT OR IGNORE INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, 1, NULL)'
      )

      for (const artist of artists) {
        // 1. 创建默认画风
        const styleResult = insertStyle.run(artist.id, '默认')
        const styleId = Number(styleResult.lastInsertRowid)

        // 2. price_tiers → style_sizes
        const tiers = database.prepare(
          'SELECT * FROM price_tiers WHERE artist_id = ? ORDER BY sort_order ASC'
        ).all(artist.id) as LegacyPriceTierRow[]
        for (const tier of tiers) {
          insertSize.run(styleId, tier.name, tier.price, tier.sort_order ?? 0)
        }

        // 3. price_addons → addon_templates
        // 映射：toggle→switch, quantity→quantity, inquiry→radio
        // pricing_mode：fixed→fixed, percent→fixed（v1 不支持百分比增项）
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
            addon.sort_order ?? 0
          )
        }

        // 4. addon_tiers 关联 → style_addons（默认画风关联所有增项模板）
        const templates = database.prepare(
          'SELECT id FROM addon_templates WHERE artist_id = ? ORDER BY sort_order ASC'
        ).all(artist.id) as IdRow[]
        for (const tpl of templates) {
          insertStyleAddon.run(styleId, tpl.id)
        }
      }
    }
  }
