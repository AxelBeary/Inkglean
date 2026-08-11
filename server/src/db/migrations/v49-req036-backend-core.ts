/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, CountRow, FkViolation, Migration } from './types.js'

export const migration: Migration = {
    version: 49,
    name: 'req036_backend_core',
    // ⚠️ 必须事务外执行：重建 addon_templates/style_addons 表（DROP 父表触发子表 ON DELETE CASCADE，v38 事故同款陷阱），
    // PRAGMA foreign_keys 在事务内是 no-op——关 FK 后立即回读校验，值不为 0 直接中止，绝不 DROP
    noTransaction: true,
    up(database) {
      // REQ-036 批B 后端核心（2026-08-08 用户拍板「全部要做」）：
      //  1. style_sizes 尺寸三态 display_status（available/showcase/closed，默认 available）
      //  2. addon_templates 重建：artist_id 可空（NULL=系统预置）+ kind 维度（add/multiply）+ max_quantity 数量上限
      //  3. style_addons 重建：addon_template_id 可空 + 外键 ON DELETE SET NULL（删除策略 C'）+ 模板快照列
      //  4. 内置模板种子 4 个（系统预置 artist_id NULL，全画师共用；812-B B7 用户拍板口径）
      backupDbBeforeMigration(49)

      // ─── 1. style_sizes 加 display_status（ADD COLUMN 事务内安全，对照 v37） ───
      const sizeCols = database.prepare('PRAGMA table_info(style_sizes)').all() as ColumnInfo[]
      if (!sizeCols.some(c => c.name === 'display_status')) {
        database.exec("ALTER TABLE style_sizes ADD COLUMN display_status TEXT NOT NULL DEFAULT 'available' CHECK(display_status IN ('available','showcase','closed'))")
      }

      // ─── 2+3. 重建 addon_templates / style_addons（SQLite 改 NOT NULL/外键行为=重建表，官方 12 步） ───
      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v49: foreign_keys 未能关闭（值=' + String(fkState) + '），中止重建以防 CASCADE 清空子表')
      }
      try {
        // 幂等守卫：已含 kind 列（旧形已迁移）或 category 列（新库直接新形，v50 SPEC-PRICE-2）则跳过；清理上次失败残留的临时表
        const atCols = (database.prepare('PRAGMA table_info(addon_templates)').all() as ColumnInfo[]).map(c => c.name)
        if (!atCols.includes('kind') && !atCols.includes('category')) {
          database.exec(`
            CREATE TABLE addon_templates_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              artist_id INTEGER,
              name TEXT NOT NULL,
              control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity','radio')),
              pricing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_mode IN ('fixed','per_unit','per_option')),
              default_price REAL NOT NULL DEFAULT 0,
              options TEXT,
              unit_label TEXT,
              sort_order INTEGER DEFAULT 0,
              kind TEXT NOT NULL DEFAULT 'add' CHECK(kind IN ('add','multiply')),
              max_quantity INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
            )
          `)
          // 原列数据迁移（kind/max_quantity 用建表默认值填充）
          const cols = atCols.join(', ')
          database.exec(`INSERT INTO addon_templates_new (${cols}) SELECT ${cols} FROM addon_templates`)
          database.exec('DROP TABLE addon_templates')
          database.exec('ALTER TABLE addon_templates_new RENAME TO addon_templates')
        } else {
          database.exec('DROP TABLE IF EXISTS addon_templates_new')
        }

        const saCols = (database.prepare('PRAGMA table_info(style_addons)').all() as ColumnInfo[]).map(c => c.name)
        if (!saCols.includes('tpl_name') && !saCols.includes('tpl_price_mode')) {
          database.exec(`
            CREATE TABLE style_addons_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              art_style_id INTEGER NOT NULL,
              addon_template_id INTEGER,
              is_enabled INTEGER DEFAULT 1,
              price_override REAL,
              options_override TEXT,
              tpl_name TEXT,
              tpl_control_type TEXT,
              tpl_pricing_mode TEXT,
              tpl_default_price REAL,
              tpl_options TEXT,
              tpl_unit_label TEXT,
              tpl_kind TEXT,
  tpl_max_quantity INTEGER,
              FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE CASCADE,
              FOREIGN KEY (addon_template_id) REFERENCES addon_templates(id) ON DELETE SET NULL,
              UNIQUE(art_style_id, addon_template_id)
            )
          `)
          // 原列数据迁移 + 快照列从 addon_templates JOIN 拷入（未解绑行快照=当前模板数据）
          const cols = saCols.join(', ')
          database.exec(`
            INSERT INTO style_addons_new (${cols}, tpl_name, tpl_control_type, tpl_pricing_mode, tpl_default_price, tpl_options, tpl_unit_label, tpl_kind, tpl_max_quantity)
            SELECT sa.${cols}, at.name, at.control_type, at.pricing_mode, at.default_price, at.options, at.unit_label, at.kind, at.max_quantity
            FROM style_addons sa
            LEFT JOIN addon_templates at ON at.id = sa.addon_template_id
          `)
          database.exec('DROP TABLE style_addons')
          database.exec('ALTER TABLE style_addons_new RENAME TO style_addons')
        } else {
          database.exec('DROP TABLE IF EXISTS style_addons_new')
        }

        // 官方 12 步流程：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
        const fkViolations = database.pragma('foreign_key_check') as FkViolation[]
        if (fkViolations.length > 0) {
          throw new Error('迁移 v49: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
      } finally {
        // 事务失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }

      // ─── 4. 内置模板种子（系统预置 artist_id NULL，全画师共用；幂等守卫） ───
      // v50 (SPEC-PRICE-2): 种子列名对齐新结构（category/price_mode）——
      // 既有库已跑过 v49 不会再到这里；仅新库（基线即新结构）执行本 INSERT
      const seedCount = (database.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id IS NULL').get() as CountRow).c
      // F-6（P3-19）: 旧形表（pricing_mode/kind，重建分支刚产出）无 price_mode 列，
      // 且旧形 CHECK 不含 percent——种子无法表达，跳过；v50 重建后系统模板由
      // 新库基线供给，旧库升级路径本迁移不产生种子（结构一致，数据口径见审计批F摘要）
      const atColsFinal = (database.prepare('PRAGMA table_info(addon_templates)').all() as ColumnInfo[]).map(c => c.name)
      if (seedCount === 0 && atColsFinal.includes('price_mode')) {
        const insert = database.prepare(`
          INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity)
          VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        // 812-B B7（用户拍板：预置基础增项，不预置画风）：
        // 用途 ×2（个人 1.0 / 商业 1.5）+ 加急 ×2（标准 1.0 / 加急 1.3），数值保守，管理员可改
        // 全部强制开关控件 + 百分比计价（SPEC-PRICE-2：用途/加急是公式乘法位，百分比金额只基于基础价）
        insert.run('个人用途', 'switch', 'percent', 0, null, 0, 'usage', null)
        insert.run('商业用途', 'switch', 'percent', 50, null, 1, 'usage', null)
        insert.run('标准', 'switch', 'percent', 0, null, 2, 'rush', null)
        insert.run('加急', 'switch', 'percent', 30, null, 3, 'rush', null)
        console.log('📦 迁移 v49: 内置模板种子已写入（个人用途/商业用途/标准/加急）')
      } else {
        console.log('📦 迁移 v49: 内置模板种子已存在，跳过')
      }
    }
  }
