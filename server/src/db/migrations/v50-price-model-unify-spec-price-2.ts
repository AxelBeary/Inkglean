/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
import { backupDbBeforeMigration } from '../migrate.js'
import type { ColumnInfo, FkViolation, MasterSqlRow, Migration } from './types.js'

export const migration: Migration = {
    version: 50,
    name: 'price_model_unify_spec_price_2',
    // ⚠️ 必须事务外执行：重建 orders/addon_templates/style_addons/order_price_breakdown + DROP price_tiers/price_multipliers
    //（DROP/RENAME 父表触发子表 CASCADE 陷阱，v38 事故教训；PRAGMA foreign_keys 事务内 no-op）
    noTransaction: true,
    up(database) {
      // SPEC-PRICE-2 价格模型统一（2026-08-09 用户拍板）：
      //  1. orders 重建：移除 tier_id/usage_multiplier_id/rush_multiplier_id，新增 style_size_id（SET NULL）
      //  2. addon_templates 重建：control_type 仅 switch/quantity；price_mode fixed/percent；新增 category add/usage/rush（kind 退役）
      //  3. style_addons 重建：快照列对齐（tpl_price_mode/tpl_category，options 退役）
      //  4. order_price_breakdown 重建：新 item_type 口径（旧 tier→base / addon→addon_fixed 映射，数据不丢）
      //  5. DROP price_tiers / price_multipliers（用户拍板：均为测试垃圾数据；备份 bak-pre-v050-pricemodel-20260809）
      backupDbBeforeMigration(50, database)

      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v50: foreign_keys 未能关闭（值=' + String(fkState) + '），中止重建以防 CASCADE 清空子表')
      }
      try {
        // ─── 1. orders 重建（幂等守卫：已无 tier_id 则跳过） ───
        let oCols = (database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]).map(c => c.name)
        if (oCols.includes('tier_id')) {
          // 815 审计 P1-4 修复：崩溃残留检测——若上次在 DROP orders 后、RENAME 前被杀，
          // orders_new 持全量数据，而 schema 重建的空壳 orders 自带 tier_id（基线含该列）会误入本重建分支；
          // 此时裸 CREATE orders_new 撞已存在表名死循环。须先识别残留并恢复数据
          const leftover = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders_new'").get()
          if (leftover) {
            const mainCount = (database.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n
            const newCount = (database.prepare('SELECT COUNT(*) AS n FROM orders_new').get() as { n: number }).n
            if (mainCount === 0 && newCount > 0) {
              database.exec('DROP TABLE orders')
              database.exec('ALTER TABLE orders_new RENAME TO orders')
              // 恢复后的 orders 已是新结构：重取列快照，下方重建守卫自然跳过（若用旧快照会误重建并把 style_size_id 清成 NULL）
              oCols = (database.prepare('PRAGMA table_info(orders)').all() as ColumnInfo[]).map(c => c.name)
            } else {
              // 主表有数据（异常半态）：绝不删任一方，抛错交人工处置（迁移前备份 bak-pre-v050 可回滚）
              throw new Error(`迁移 v50: 检测到崩溃残留半态（orders ${mainCount} 行 / orders_new ${newCount} 行），已中止以防丢数据，请用 bak-pre-v050 备份人工恢复`)
            }
          }
        }
        if (oCols.includes('tier_id')) {
          database.exec(`
            CREATE TABLE orders_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              order_no TEXT UNIQUE NOT NULL,
              artist_id INTEGER NOT NULL,
              style_size_id INTEGER,
              client_qq TEXT NOT NULL,
              client_name TEXT,
              description TEXT,
              priority TEXT DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
              status TEXT DEFAULT 'pending' CHECK(status IN (
                'pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled'
              )),
              source TEXT DEFAULT 'self' CHECK(source IN ('self', 'manual')),
              client_notify INTEGER DEFAULT 0,
              queue_position INTEGER,
              completed_at DATETIME,
              price_snapshot REAL,
              total_price_cents INTEGER,
              quote_snapshot TEXT,
              final_price_cents INTEGER,
              focus_image_path TEXT,
              focus_image_mode TEXT DEFAULT 'off',
              current_stage_id INTEGER,
              deadline DATETIME,
              start_date TEXT DEFAULT NULL,
              queue_zone TEXT DEFAULT 'formal',
              paid_total_cents INTEGER DEFAULT 0,
              discount_code_id INTEGER DEFAULT NULL,
              discount_amount_cents INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
              FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE SET NULL
            )
          `)
          // 保留列搬运（历史 style 订单 style_size_id 置 NULL，报价信息在 quote_snapshot）
          const keep = oCols.filter(c => !['tier_id', 'usage_multiplier_id', 'rush_multiplier_id'].includes(c))
          const colList = keep.join(', ')
          database.exec(`INSERT INTO orders_new (${colList}, style_size_id) SELECT ${colList}, NULL FROM orders`)
          database.exec('DROP TABLE orders')
          database.exec('ALTER TABLE orders_new RENAME TO orders')
        } else {
          // d3 猎杀修复（2026-08-13）：崩溃恢复——若进程在 DROP orders 后、RENAME 前崩溃，orders_new 持唯一数据副本；
                // 重启后主表已被 schema 建空壳，须 DROP 空壳续 RENAME 恢复数据，严禁删 orders_new
                const hasNew_orders = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='orders_new'").get()
                if (hasNew_orders) {
                  const mainCount_orders = (database.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n
                  const newCount_orders = (database.prepare('SELECT COUNT(*) AS n FROM orders_new').get() as { n: number }).n
                  if (mainCount_orders === 0 && newCount_orders > 0) {
                    database.exec('DROP TABLE orders')
                    database.exec('ALTER TABLE orders_new RENAME TO orders')
                  } else {
                    database.exec('DROP TABLE IF EXISTS orders_new')
                  }
                }
        }

        // ─── 2. order_price_breakdown 重建（幂等守卫：sqlite_master 中已含新口径则跳过） ───
        const bdSql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_price_breakdown'").get() as MasterSqlRow | undefined
        if (bdSql && !bdSql.sql.includes('addon_fixed')) {
          database.exec(`
            CREATE TABLE order_price_breakdown_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              order_id INTEGER NOT NULL,
              item_type TEXT NOT NULL CHECK(item_type IN ('base','addon_fixed','addon_percent','usage','rush','discount')),
              item_name TEXT NOT NULL,
              amount_cents INTEGER NOT NULL,
              multiplier REAL DEFAULT 1.0,
              quantity INTEGER DEFAULT 1,
              sort_order INTEGER DEFAULT 0,
              FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
          `)
          // 旧口径映射：tier→base（档位基础价），addon→addon_fixed（旧增项均为加法）
          database.exec(`
            INSERT INTO order_price_breakdown_new (id, order_id, item_type, item_name, amount_cents, multiplier, quantity, sort_order)
            SELECT id, order_id,
              CASE item_type WHEN 'tier' THEN 'base' WHEN 'addon' THEN 'addon_fixed' ELSE item_type END,
              item_name, amount_cents, multiplier, quantity, sort_order
            FROM order_price_breakdown
          `)
          database.exec('DROP TABLE order_price_breakdown')
          database.exec('ALTER TABLE order_price_breakdown_new RENAME TO order_price_breakdown')
        } else {
          // d3 猎杀修复（2026-08-13）：崩溃恢复——若进程在 DROP order_price_breakdown 后、RENAME 前崩溃，order_price_breakdown_new 持唯一数据副本；
                // 重启后主表已被 schema 建空壳，须 DROP 空壳续 RENAME 恢复数据，严禁删 order_price_breakdown_new
                const hasNew_order_price_breakdown = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='order_price_breakdown_new'").get()
                if (hasNew_order_price_breakdown) {
                  const mainCount_order_price_breakdown = (database.prepare('SELECT COUNT(*) AS n FROM order_price_breakdown').get() as { n: number }).n
                  const newCount_order_price_breakdown = (database.prepare('SELECT COUNT(*) AS n FROM order_price_breakdown_new').get() as { n: number }).n
                  if (mainCount_order_price_breakdown === 0 && newCount_order_price_breakdown > 0) {
                    database.exec('DROP TABLE order_price_breakdown')
                    database.exec('ALTER TABLE order_price_breakdown_new RENAME TO order_price_breakdown')
                  } else {
                    database.exec('DROP TABLE IF EXISTS order_price_breakdown_new')
                  }
                }
        }

        // ─── 3. addon_templates 重建（幂等守卫：已含 category 则跳过） ───
        const atCols = (database.prepare('PRAGMA table_info(addon_templates)').all() as ColumnInfo[]).map(c => c.name)
        if (atCols.includes('kind') && !atCols.includes('category')) {
          database.exec(`
            CREATE TABLE addon_templates_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              artist_id INTEGER,
              name TEXT NOT NULL,
              control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity')),
              price_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(price_mode IN ('fixed','percent')),
              default_price REAL NOT NULL DEFAULT 0,
              unit_label TEXT,
              sort_order INTEGER DEFAULT 0,
              category TEXT NOT NULL DEFAULT 'add' CHECK(category IN ('add','usage','rush')),
              max_quantity INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
            )
          `)
          // 换算：kind=multiply → price_mode=percent；category 按名称约定一次性落库（加急/急件→rush，其余 multiply→usage）
          // radio 控件退役 → switch（生产 0 条 radio 数据，守卫兑底）；per_unit/per_option → fixed
          database.exec(`
            INSERT INTO addon_templates_new (id, artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity, created_at)
            SELECT id, artist_id, name,
              CASE WHEN control_type = 'radio' THEN 'switch' ELSE control_type END,
              CASE WHEN kind = 'multiply' THEN 'percent' ELSE 'fixed' END,
              default_price, unit_label, sort_order,
              CASE WHEN kind = 'multiply' THEN
                CASE WHEN name LIKE '%加急%' OR name LIKE '%急件%' THEN 'rush' ELSE 'usage' END
              ELSE 'add' END,
              max_quantity, created_at
            FROM addon_templates
          `)
          database.exec('DROP TABLE addon_templates')
          database.exec('ALTER TABLE addon_templates_new RENAME TO addon_templates')
        } else {
          // d3 猎杀修复（2026-08-13）：崩溃恢复——若进程在 DROP addon_templates 后、RENAME 前崩溃，addon_templates_new 持唯一数据副本；
                // 重启后主表已被 schema 建空壳，须 DROP 空壳续 RENAME 恢复数据，严禁删 addon_templates_new
                const hasNew_addon_templates = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='addon_templates_new'").get()
                if (hasNew_addon_templates) {
                  const mainCount_addon_templates = (database.prepare('SELECT COUNT(*) AS n FROM addon_templates').get() as { n: number }).n
                  const newCount_addon_templates = (database.prepare('SELECT COUNT(*) AS n FROM addon_templates_new').get() as { n: number }).n
                  if (mainCount_addon_templates === 0 && newCount_addon_templates > 0) {
                    database.exec('DROP TABLE addon_templates')
                    database.exec('ALTER TABLE addon_templates_new RENAME TO addon_templates')
                  } else {
                    database.exec('DROP TABLE IF EXISTS addon_templates_new')
                  }
                }
        }

        // ─── 4. style_addons 重建（幂等守卫：已含 tpl_price_mode 则跳过） ───
        const saCols = (database.prepare('PRAGMA table_info(style_addons)').all() as ColumnInfo[]).map(c => c.name)
        if (saCols.includes('tpl_kind') && !saCols.includes('tpl_price_mode')) {
          database.exec(`
            CREATE TABLE style_addons_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              art_style_id INTEGER NOT NULL,
              addon_template_id INTEGER,
              is_enabled INTEGER DEFAULT 1,
              price_override REAL,
              tpl_name TEXT,
              tpl_control_type TEXT,
              tpl_price_mode TEXT,
              tpl_default_price REAL,
              tpl_unit_label TEXT,
              tpl_category TEXT,
              tpl_max_quantity INTEGER,
              FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE CASCADE,
              FOREIGN KEY (addon_template_id) REFERENCES addon_templates(id) ON DELETE SET NULL,
              UNIQUE(art_style_id, addon_template_id)
            )
          `)
          database.exec(`
            INSERT INTO style_addons_new (id, art_style_id, addon_template_id, is_enabled, price_override, tpl_name, tpl_control_type, tpl_price_mode, tpl_default_price, tpl_unit_label, tpl_category, tpl_max_quantity)
            SELECT id, art_style_id, addon_template_id, is_enabled, price_override, tpl_name,
              CASE WHEN tpl_control_type = 'radio' THEN 'switch' ELSE tpl_control_type END,
              CASE WHEN tpl_kind IS NULL THEN NULL WHEN tpl_kind = 'multiply' THEN 'percent' ELSE 'fixed' END,
              tpl_default_price, tpl_unit_label,
              CASE WHEN tpl_kind IS NULL THEN NULL WHEN tpl_kind = 'multiply' THEN
                CASE WHEN tpl_name LIKE '%加急%' OR tpl_name LIKE '%急件%' THEN 'rush' ELSE 'usage' END
              ELSE 'add' END,
              tpl_max_quantity
            FROM style_addons
          `)
          database.exec('DROP TABLE style_addons')
          database.exec('ALTER TABLE style_addons_new RENAME TO style_addons')
        } else {
          // d3 猎杀修复（2026-08-13）：崩溃恢复——若进程在 DROP style_addons 后、RENAME 前崩溃，style_addons_new 持唯一数据副本；
                // 重启后主表已被 schema 建空壳，须 DROP 空壳续 RENAME 恢复数据，严禁删 style_addons_new
                const hasNew_style_addons = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='style_addons_new'").get()
                if (hasNew_style_addons) {
                  const mainCount_style_addons = (database.prepare('SELECT COUNT(*) AS n FROM style_addons').get() as { n: number }).n
                  const newCount_style_addons = (database.prepare('SELECT COUNT(*) AS n FROM style_addons_new').get() as { n: number }).n
                  if (mainCount_style_addons === 0 && newCount_style_addons > 0) {
                    database.exec('DROP TABLE style_addons')
                    database.exec('ALTER TABLE style_addons_new RENAME TO style_addons')
                  } else {
                    database.exec('DROP TABLE IF EXISTS style_addons_new')
                  }
                }
        }

        // ─── 5. 旧模型表清退（用户拍板：均为测试垃圾数据；0 订单引用旧倍率） ───
        database.exec('DROP TABLE IF EXISTS price_tiers')
        database.exec('DROP TABLE IF EXISTS price_multipliers')

        // 官方 12 步流程：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
        const fkViolations = database.pragma('foreign_key_check') as FkViolation[]
        if (fkViolations.length > 0) {
          throw new Error('迁移 v50: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
        console.log('📦 迁移 v50: SPEC-PRICE-2 价格模型统一完成（旧档位/旧倍率表已 DROP）')
      } finally {
        // 失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }
    }
  }
