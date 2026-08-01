import db from './connection.js'
import { fileURLToPath } from 'url'
import { copyFileSync, existsSync } from 'fs'

// ============================================
// 数据库初始化 - 创建所有表 + 版本化迁移
// ============================================

export const schema = `
-- 画师表（含所有迁移后的完整结构）
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qq_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  artist_code TEXT UNIQUE,
  avatar TEXT,
  bio TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'break', 'hidden')),
  contact_qq TEXT,
  token_version INTEGER DEFAULT 1,
  deleted_at DATETIME,
  weibo_url TEXT,
  bilibili_url TEXT,
  notify_enabled INTEGER DEFAULT 1,
  template_id TEXT DEFAULT 'default',
  palette_id TEXT DEFAULT 'paper',
  custom_page_path TEXT,
  dashboard_default_panel TEXT,
  revision_note TEXT,
  custom_links TEXT,
  accent_color TEXT,
  platform_urls TEXT,
  inspiration_tags TEXT,
  order_template_id TEXT DEFAULT 'default',
  batch_limit INTEGER DEFAULT NULL,
  buffer_limit INTEGER DEFAULT 0,
  auto_promote INTEGER DEFAULT 0,
  hide_queue_position INTEGER DEFAULT 0,
  hide_promote_notify INTEGER DEFAULT 0,
  buffer_short_form INTEGER DEFAULT 0,
  announcement TEXT DEFAULT NULL,
  announcement_expires_at DATETIME DEFAULT NULL,
  monthly_quota INTEGER DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 价格档位表
CREATE TABLE IF NOT EXISTS price_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  description TEXT,
  example_image TEXT,
  work_days INTEGER,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 作品表
CREATE TABLE IF NOT EXISTS artworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  title TEXT,
  sort_order INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  is_cover INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 约稿须知表
CREATE TABLE IF NOT EXISTS commission_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER UNIQUE NOT NULL,
  content TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 订单表（含所有迁移后的完整结构）
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  artist_id INTEGER NOT NULL,
  tier_id INTEGER,
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
  usage_multiplier_id INTEGER,
  rush_multiplier_id INTEGER,
  quote_snapshot TEXT,
  final_price_cents INTEGER,
  focus_image_path TEXT,
  focus_image_mode TEXT DEFAULT 'off',
  current_stage_id INTEGER,
  deadline DATETIME,
  queue_zone TEXT DEFAULT 'formal',
  paid_total_cents INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (tier_id) REFERENCES price_tiers(id) ON DELETE SET NULL
);

-- 订单参考图表
CREATE TABLE IF NOT EXISTS order_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  source TEXT DEFAULT 'client',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 订单备注表
CREATE TABLE IF NOT EXISTS order_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT DEFAULT 'artist',
  image_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 交付文件表
CREATE TABLE IF NOT EXISTS deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  file_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 订单附加工作项表（SPEC-003）
CREATE TABLE IF NOT EXISTS order_extra_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 画师工作流节点表（v5 + v20 speech_template）
CREATE TABLE IF NOT EXISTS artist_workflow_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  takes_payment INTEGER NOT NULL DEFAULT 0,
  basis_points INTEGER,
  speech_template TEXT DEFAULT '{客户名}，你的订单已{节点名}。',
  random_template INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 默认工作流模板表（v5）
CREATE TABLE IF NOT EXISTS default_workflow_template (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  takes_payment INTEGER NOT NULL DEFAULT 0,
  basis_points INTEGER
);

-- 订单付款分期表（v5）
CREATE TABLE IF NOT EXISTS order_payment_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  basis_points INTEGER NOT NULL,
  amount_cents INTEGER,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  requested_at DATETIME,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 收款流水表（v24 额度池）
CREATE TABLE IF NOT EXISTS order_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  note TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT DEFAULT 'artist',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 问候语模板表（v6）
CREATE TABLE IF NOT EXISTS greeting_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER,
  text TEXT NOT NULL,
  time_slot TEXT NOT NULL DEFAULT 'any' CHECK(time_slot IN ('morning','afternoon','evening','night','any')),
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 价格增项表（v9）
CREATE TABLE IF NOT EXISTS price_addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('expression','outfit','background','weapon','other')),
  name TEXT NOT NULL,
  price_type TEXT NOT NULL DEFAULT 'fixed' CHECK(price_type IN ('fixed','percent')),
  price_value REAL NOT NULL,
  select_mode TEXT NOT NULL DEFAULT 'quantity' CHECK(select_mode IN ('quantity','toggle','inquiry')),
  max_qty INTEGER DEFAULT 5,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 增项-档位关联表（v9）
CREATE TABLE IF NOT EXISTS addon_tiers (
  addon_id INTEGER NOT NULL,
  tier_id INTEGER NOT NULL,
  PRIMARY KEY (addon_id, tier_id),
  FOREIGN KEY (addon_id) REFERENCES price_addons(id) ON DELETE CASCADE,
  FOREIGN KEY (tier_id) REFERENCES price_tiers(id) ON DELETE CASCADE
);

-- 价格倍率表（v9）
CREATE TABLE IF NOT EXISTS price_multipliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('usage','rush')),
  name TEXT NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1.0,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 订单价格明细快照表（v9）
CREATE TABLE IF NOT EXISTS order_price_breakdown (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('tier','addon','usage','rush')),
  item_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  multiplier REAL DEFAULT 1.0,
  quantity INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 登录码表（临时）
-- P0-4 修复：expires_at 实际存储 Unix 毫秒整数（auth.service.js），列类型从 DATETIME 改为 INTEGER 保持一致
CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 平台配置表
CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 版本化迁移跟踪表
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 留言板表（v22）
CREATE TABLE IF NOT EXISTS guestbook_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  artist_reply TEXT DEFAULT NULL,
  replied_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_by_admin INTEGER DEFAULT 0,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);
`

/**
 * 索引单独存放 — 在迁移之后执行，避免老库升级时因列不存在而崩溃
 */
export const schemaIndexes = `
CREATE INDEX IF NOT EXISTS idx_orders_artist_status ON orders(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders(artist_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_client_qq ON orders(client_qq);
CREATE INDEX IF NOT EXISTS idx_order_references_order ON order_references(order_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_order ON deliverables(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_deadline ON orders(artist_id, deadline);
CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_price_tiers_artist ON price_tiers(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_qq ON artists(qq_number);
CREATE INDEX IF NOT EXISTS idx_extra_items_order ON order_extra_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_queue_zone ON orders(artist_id, queue_zone);
CREATE INDEX IF NOT EXISTS idx_guestbook_artist ON guestbook_messages(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
`

/**
 * 版本化迁移列表
 * 每个迁移有唯一 version 号，按顺序执行，已执行的自动跳过
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'add_artist_code_column',
    up(database) {
      const columns = database.prepare('PRAGMA table_info(artists)').all()
      if (!columns.some(c => c.name === 'artist_code')) {
        database.exec('ALTER TABLE artists ADD COLUMN artist_code TEXT')
        database.exec("UPDATE artists SET artist_code = UPPER(subdomain) WHERE artist_code IS NULL")
      }
      // 数据完整性：先删除可能被 schema 旧版创建的同名非唯一索引，再建唯一索引
      database.exec('DROP INDEX IF EXISTS idx_artists_code')
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS uniq_artists_code ON artists(artist_code)')
    }
  },
  {
    version: 2,
    name: 'add_contact_qq_column',
    up(database) {
      const columns = database.prepare('PRAGMA table_info(artists)').all()
      if (!columns.some(c => c.name === 'contact_qq')) {
        database.exec('ALTER TABLE artists ADD COLUMN contact_qq TEXT')
      }
    }
  },
  {
    version: 3,
    name: 'add_completed_at_and_price_snapshot',
    up(database) {
      const orderCols = database.prepare('PRAGMA table_info(orders)').all()
      if (!orderCols.some(c => c.name === 'completed_at')) {
        database.exec('ALTER TABLE orders ADD COLUMN completed_at DATETIME')
      }
      if (!orderCols.some(c => c.name === 'price_snapshot')) {
        database.exec('ALTER TABLE orders ADD COLUMN price_snapshot REAL')
      }
      // 回填已有的 done/delivered 订单的 completed_at
      database.exec("UPDATE orders SET completed_at = updated_at WHERE status IN ('done', 'delivered') AND completed_at IS NULL")
      // 回填已有的 price_snapshot
      database.exec(`UPDATE orders SET price_snapshot = (
        SELECT t.price FROM price_tiers t WHERE t.id = orders.tier_id
      ) WHERE price_snapshot IS NULL AND tier_id IS NOT NULL`)
    }
  },
  {
    version: 4,
    name: 'add_token_version',
    up(database) {
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'token_version')) {
        database.exec('ALTER TABLE artists ADD COLUMN token_version INTEGER DEFAULT 1')
      }
    }
  },
  {
    version: 5,
    name: 'workflow_stages_and_default_template',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS artist_workflow_stages (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id     INTEGER NOT NULL,
          name          TEXT    NOT NULL,
          description   TEXT,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          takes_payment INTEGER NOT NULL DEFAULT 0,
          basis_points  INTEGER,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_ws_artist ON artist_workflow_stages(artist_id, sort_order)')
      database.exec(`
        CREATE TABLE IF NOT EXISTS default_workflow_template (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT    NOT NULL,
          description   TEXT,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          takes_payment INTEGER NOT NULL DEFAULT 0,
          basis_points  INTEGER
        )
      `)
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_payment_installments (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id      INTEGER NOT NULL,
          label         TEXT    NOT NULL,
          basis_points  INTEGER NOT NULL,
          amount_cents  INTEGER,
          status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
          sort_order    INTEGER NOT NULL DEFAULT 0,
          requested_at  DATETIME,
          paid_at       DATETIME,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      // 种子：默认模板（幂等）
      const tplCount = database.prepare('SELECT COUNT(*) AS c FROM default_workflow_template').get().c
      if (tplCount === 0) {
        const insert = database.prepare(
          'INSERT INTO default_workflow_template (name, description, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?)'
        )
        const seeds = [
          ['定稿', '双方确认稿件需求与规格', 1, 0, null],
          ['排期确认', '确认排期，收取定金', 2, 1, 3000],
          ['草稿确认', null, 3, 0, null],
          ['线稿确认', null, 4, 0, null],
          ['上色确认', null, 5, 0, null],
          ['完稿确认', null, 6, 0, null],
          ['交付', '交付成品，收取尾款', 7, 1, 7000],
        ]
        for (const [name, desc, order, pay, bp] of seeds) insert.run(name, desc, order, pay, bp)
      }
      // 存量画师补种子（幂等）
      // 注意：v5 在 v7(deleted_at) 之前执行，不能引用 deleted_at 列
      const artists = database.prepare('SELECT id FROM artists').all()
      for (const a of artists) {
        const count = database.prepare(
          'SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?'
        ).get(a.id).c
        if (count === 0) {
          const tpl = database.prepare('SELECT * FROM default_workflow_template ORDER BY sort_order ASC').all()
          const ins = database.prepare(
            'INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, ?, ?, ?)'
          )
          for (const t of tpl) ins.run(a.id, t.name, t.description, t.sort_order, t.takes_payment, t.basis_points)
        }
      }
    }
  },
  {
    version: 6,
    name: 'greeting_templates',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS greeting_templates (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id  INTEGER,
          text       TEXT NOT NULL,
          time_slot  TEXT NOT NULL DEFAULT 'any'
                     CHECK(time_slot IN ('morning','afternoon','evening','night','any')),
          is_enabled INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_greeting_artist ON greeting_templates(artist_id, time_slot)')
      // 种子：通用库（artist_id = NULL）
      const count = database.prepare('SELECT COUNT(*) AS c FROM greeting_templates').get().c
      if (count === 0) {
        const insert = database.prepare(
          'INSERT INTO greeting_templates (artist_id, text, time_slot) VALUES (NULL, ?, ?)'
        )
        const seeds = [
          ['早上好，{name}，新的一天从一张好画开始', 'morning'],
          ['早呀{name}，今天的灵感准备好了吗', 'morning'],
          ['午安，{name}，别忘了吃午饭', 'afternoon'],
          ['记得多喝水，{name}', 'afternoon'],
          ['{name}，画画别忘了活动手腕', 'any'],
          ['晚上好，{name}，今天辛苦了', 'evening'],
          ['夜深了，{name}，早点休息', 'night'],
          ['{name}，熬夜伤身，画可以明天再画', 'night'],
        ]
        for (const [text, slot] of seeds) insert.run(text, slot)
      }
    }
  },
  {
    version: 7,
    name: 'add_deleted_at_column',
    up(database) {
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'deleted_at')) {
        database.exec('ALTER TABLE artists ADD COLUMN deleted_at DATETIME')
      }
    }
  },
  {
    version: 8,
    name: 'add_template_id_and_page_config',
    up(database) {
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'template_id')) {
        database.exec("ALTER TABLE artists ADD COLUMN template_id TEXT DEFAULT 'default'")
      }
      if (!cols.some(c => c.name === 'custom_page_path')) {
        database.exec("ALTER TABLE artists ADD COLUMN custom_page_path TEXT")
      }
    }
  },
  {
    version: 9,
    name: 'price_calculator',
    up(database) {
      // ─── 增项表 ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS price_addons (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id     INTEGER NOT NULL,
          category      TEXT NOT NULL CHECK(category IN (
                          'expression', 'outfit', 'background', 'weapon', 'other'
                        )),
          name          TEXT NOT NULL,
          price_type    TEXT NOT NULL DEFAULT 'fixed' CHECK(price_type IN ('fixed', 'percent')),
          price_value   REAL NOT NULL,
          select_mode   TEXT NOT NULL DEFAULT 'quantity' CHECK(select_mode IN (
                          'quantity', 'toggle', 'inquiry'
                        )),
          max_qty       INTEGER DEFAULT 5,
          description   TEXT,
          sort_order    INTEGER DEFAULT 0,
          enabled       INTEGER DEFAULT 1,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_addons_artist ON price_addons(artist_id, sort_order)')

      // ─── 增项-档位关联表 ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS addon_tiers (
          addon_id  INTEGER NOT NULL,
          tier_id   INTEGER NOT NULL,
          PRIMARY KEY (addon_id, tier_id),
          FOREIGN KEY (addon_id) REFERENCES price_addons(id) ON DELETE CASCADE,
          FOREIGN KEY (tier_id) REFERENCES price_tiers(id) ON DELETE CASCADE
        )
      `)

      // ─── 倍率表 ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS price_multipliers (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id     INTEGER NOT NULL,
          type          TEXT NOT NULL CHECK(type IN ('usage', 'rush')),
          name          TEXT NOT NULL,
          multiplier    REAL NOT NULL DEFAULT 1.0,
          description   TEXT,
          sort_order    INTEGER DEFAULT 0,
          enabled       INTEGER DEFAULT 1,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_multipliers_artist ON price_multipliers(artist_id, type)')

      // ─── 订单价格明细快照 ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_price_breakdown (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id     INTEGER NOT NULL,
          item_type    TEXT NOT NULL CHECK(item_type IN ('tier', 'addon', 'usage', 'rush')),
          item_name    TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          multiplier   REAL DEFAULT 1.0,
          quantity     INTEGER DEFAULT 1,
          sort_order   INTEGER DEFAULT 0,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)

      // ─── orders 表新增字段 ───
      const orderCols = database.prepare('PRAGMA table_info(orders)').all()
      if (!orderCols.some(c => c.name === 'total_price_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN total_price_cents INTEGER')
      }
      if (!orderCols.some(c => c.name === 'usage_multiplier_id')) {
        database.exec('ALTER TABLE orders ADD COLUMN usage_multiplier_id INTEGER')
      }
      if (!orderCols.some(c => c.name === 'rush_multiplier_id')) {
        database.exec('ALTER TABLE orders ADD COLUMN rush_multiplier_id INTEGER')
      }
    }
  },
  {
    version: 10,
    name: 'add_palette_id_column',
    up(database) {
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'palette_id')) {
        database.exec("ALTER TABLE artists ADD COLUMN palette_id TEXT DEFAULT 'paper'")
      }
    }
  },
  {
    version: 11,
    name: 'order_quote_focus_and_artist_prefs',
    up(database) {
      // ─── 迁移前自动备份（仅文件数据库） ───
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v11`)
          console.log(`📦 迁移 v11: 已备份 ${dbPath} → ${dbPath}.bak.v11`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v11: 备份失败（${err.message}），继续执行迁移`)
        }
      }

      // ─── orders 表新增 4 字段 ───
      const orderCols = database.prepare('PRAGMA table_info(orders)').all()
      if (!orderCols.some(c => c.name === 'quote_snapshot')) {
        database.exec('ALTER TABLE orders ADD COLUMN quote_snapshot TEXT')
      }
      if (!orderCols.some(c => c.name === 'final_price_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN final_price_cents INTEGER')
      }
      if (!orderCols.some(c => c.name === 'focus_image_path')) {
        database.exec('ALTER TABLE orders ADD COLUMN focus_image_path TEXT')
      }
      if (!orderCols.some(c => c.name === 'focus_image_mode')) {
        database.exec("ALTER TABLE orders ADD COLUMN focus_image_mode TEXT DEFAULT 'off'")
      }

      // ─── artists 表新增 2 字段 ───
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'dashboard_default_panel')) {
        database.exec('ALTER TABLE artists ADD COLUMN dashboard_default_panel TEXT')
      }
      if (!artistCols.some(c => c.name === 'revision_note')) {
        database.exec('ALTER TABLE artists ADD COLUMN revision_note TEXT')
      }
    }
  },
  {
    version: 12,
    name: 'order_gallery_links_note_image',
    up(database) {
      // ─── 迁移前自动备份（仅文件数据库） ───
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v12`)
          console.log(`📦 迁移 v12: 已备份 ${dbPath} → ${dbPath}.bak.v12`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v12: 备份失败（${err.message}），继续执行迁移`)
        }
      }

      // R15: artists.custom_links（JSON TEXT 列）
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'custom_links')) {
        database.exec('ALTER TABLE artists ADD COLUMN custom_links TEXT')
      }

      // R18: order_references.source（DEFAULT 'client' 兼容存量）
      const refCols = database.prepare('PRAGMA table_info(order_references)').all()
      if (!refCols.some(c => c.name === 'source')) {
        database.exec("ALTER TABLE order_references ADD COLUMN source TEXT DEFAULT 'client'")
      }

      // R19: order_notes.image_path
      const noteCols = database.prepare('PRAGMA table_info(order_notes)').all()
      if (!noteCols.some(c => c.name === 'image_path')) {
        database.exec('ALTER TABLE order_notes ADD COLUMN image_path TEXT')
      }
    }
  },
  {
    version: 13,
    name: 'login_codes_expires_at_integer',
    up(database) {
      // R35: login_codes.expires_at 列类型对齐（DATETIME → INTEGER）
      // SQLite 不支持 ALTER COLUMN，需重建表
      // 幂等：检查现有列类型，已是 INTEGER 则跳过
      const cols = database.prepare('PRAGMA table_info(login_codes)').all()
      const expiresCol = cols.find(c => c.name === 'expires_at')
      if (expiresCol && expiresCol.type.toUpperCase() === 'INTEGER') return // 已对齐

      // 重建表（CREATE → COPY → DROP → RENAME）
      database.exec(`
        CREATE TABLE login_codes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec(`
        INSERT INTO login_codes_new (id, artist_id, code, expires_at, attempts, created_at)
        SELECT id, artist_id, code, CAST(expires_at AS INTEGER), attempts, created_at
        FROM login_codes
      `)
      database.exec('DROP TABLE login_codes')
      database.exec('ALTER TABLE login_codes_new RENAME TO login_codes')
      database.exec('CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at)')
    }
  },
  {
    version: 14,
    name: 'orders_current_stage_id',
    up(database) {
      // R30d: 订单接入自定义工作流 — 新增 current_stage_id 列
      const cols = database.prepare('PRAGMA table_info(orders)').all()
      if (!cols.some(c => c.name === 'current_stage_id')) {
        database.exec('ALTER TABLE orders ADD COLUMN current_stage_id INTEGER')
      }
    }
  },
  {
    version: 15,
    name: 'accent_color_and_deadline',
    up(database) {
      // R49: 画师强调色（5 色白名单 + null，service 层校验）
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'accent_color')) {
        database.exec('ALTER TABLE artists ADD COLUMN accent_color TEXT DEFAULT NULL')
      }
      // R51: 订单截稿日
      const orderCols = database.prepare('PRAGMA table_info(orders)').all()
      if (!orderCols.some(c => c.name === 'deadline')) {
        database.exec('ALTER TABLE orders ADD COLUMN deadline DATETIME DEFAULT NULL')
      }
    }
  },
  {
    version: 16,
    name: 'order_template_id',
    up(database) {
      // R58-7: 下单页多模板机制 — 画师可选下单模板
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'order_template_id')) {
        database.exec("ALTER TABLE artists ADD COLUMN order_template_id TEXT DEFAULT 'default'")
      }
    }
  },
  {
    version: 17,
    name: 'platform_urls_and_inspiration_tags',
    up(database) {
      // R58-8: 画师平台链接（JSON 数组 [{url, platform}]）
      // 灵感标签自定义（JSON 数组 [string]）
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'platform_urls')) {
        database.exec('ALTER TABLE artists ADD COLUMN platform_urls TEXT DEFAULT NULL')
      }
      if (!cols.some(c => c.name === 'inspiration_tags')) {
        database.exec('ALTER TABLE artists ADD COLUMN inspiration_tags TEXT DEFAULT NULL')
      }
    }
  },
  {
    version: 18,
    name: 'order_extra_items',
    up(database) {
      // SPEC-003: 订单附加工作项（下单后追加需求）
      // 迁移前自动备份（恢复 v11/v12 模式，五号审计建议）
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v18`)
          console.log(`📦 迁移 v18: 已备份 ${dbPath} → ${dbPath}.bak.v18`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v18: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      // 纯新表，无 ALTER TABLE，无存量数据影响
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_extra_items (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id     INTEGER NOT NULL,
          name         TEXT    NOT NULL,
          description  TEXT,
          price_cents  INTEGER NOT NULL DEFAULT 0,
          created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_extra_items_order ON order_extra_items(order_id)')
    }
  },
  {
    version: 19,
    name: 'batch_buffer_system',
    up(database) {
      // SPEC-004: 名额与缓冲系统
      // 迁移前自动备份
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v19`)
          console.log(`📦 迁移 v19: 已备份 ${dbPath} → ${dbPath}.bak.v19`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v19: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      // artists 表：6 个新字段
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'batch_limit')) {
        database.exec('ALTER TABLE artists ADD COLUMN batch_limit INTEGER DEFAULT NULL')
      }
      if (!artistCols.some(c => c.name === 'buffer_limit')) {
        database.exec('ALTER TABLE artists ADD COLUMN buffer_limit INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'auto_promote')) {
        database.exec('ALTER TABLE artists ADD COLUMN auto_promote INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'hide_queue_position')) {
        database.exec('ALTER TABLE artists ADD COLUMN hide_queue_position INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'hide_promote_notify')) {
        database.exec('ALTER TABLE artists ADD COLUMN hide_promote_notify INTEGER DEFAULT 0')
      }
      if (!artistCols.some(c => c.name === 'buffer_short_form')) {
        database.exec('ALTER TABLE artists ADD COLUMN buffer_short_form INTEGER DEFAULT 0')
      }
      // orders 表：queue_zone
      const orderCols = database.prepare('PRAGMA table_info(orders)').all()
      if (!orderCols.some(c => c.name === 'queue_zone')) {
        database.exec("ALTER TABLE orders ADD COLUMN queue_zone TEXT DEFAULT 'formal'")
      }
      database.exec('CREATE INDEX IF NOT EXISTS idx_orders_queue_zone ON orders(artist_id, queue_zone)')
    }
  },
  {
    version: 20,
    name: 'stage_speech_template',
    up(database) {
      // plan-node-speech: 节点话术模板
      // 迁移前自动备份
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v20`)
          console.log(`📦 迁移 v20: 已备份 ${dbPath} → ${dbPath}.bak.v20`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v20: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      const cols = database.prepare('PRAGMA table_info(artist_workflow_stages)').all()
      if (!cols.some(c => c.name === 'speech_template')) {
        database.exec("ALTER TABLE artist_workflow_stages ADD COLUMN speech_template TEXT DEFAULT '{客户名}，你的订单已{节点名}。'")
      }
      // 存量回填（ALTER TABLE ADD COLUMN DEFAULT 存量行读出为默认值，但实际存储 NULL；显式回填确保一致）
      database.exec("UPDATE artist_workflow_stages SET speech_template = '{客户名}，你的订单已{节点名}。' WHERE speech_template IS NULL")
    }
  },
  {
    version: 21,
    name: 'announcement_and_like_count',
    up(database) {
      // F3: 画师小公告（announcement + 过期时间）
      // F1: 作品点赞计数
      // 迁移前自动备份
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v21`)
          console.log(`📦 迁移 v21: 已备份 ${dbPath} → ${dbPath}.bak.v21`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v21: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      // artists: announcement + announcement_expires_at
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'announcement')) {
        database.exec('ALTER TABLE artists ADD COLUMN announcement TEXT DEFAULT NULL')
      }
      if (!artistCols.some(c => c.name === 'announcement_expires_at')) {
        database.exec('ALTER TABLE artists ADD COLUMN announcement_expires_at DATETIME DEFAULT NULL')
      }
      // artworks: like_count
      const artworkCols = database.prepare('PRAGMA table_info(artworks)').all()
      if (!artworkCols.some(c => c.name === 'like_count')) {
        database.exec('ALTER TABLE artworks ADD COLUMN like_count INTEGER DEFAULT 0')
      }
    }
  },
  {
    version: 22,
    name: 'guestbook_messages',
    up(database) {
      // F4: 留言板
      // 迁移前自动备份
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v22`)
          console.log(`📦 迁移 v22: 已备份 ${dbPath} → ${dbPath}.bak.v22`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v22: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      database.exec(`
        CREATE TABLE IF NOT EXISTS guestbook_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          nickname TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          artist_reply TEXT DEFAULT NULL,
          replied_at DATETIME DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          deleted_by_admin INTEGER DEFAULT 0,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_guestbook_artist ON guestbook_messages(artist_id, status)')
    }
  },
  {
    version: 23,
    name: 'artist_monthly_quota',
    up(database) {
      // S5: 月度额度池（NULL=不限）
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v23`)
          console.log(`📦 迁移 v23: 已备份 ${dbPath} → ${dbPath}.bak.v23`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v23: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'monthly_quota')) {
        database.exec('ALTER TABLE artists ADD COLUMN monthly_quota INTEGER DEFAULT NULL')
      }
    }
  },
  {
    version: 24,
    name: 'quota_pool_paid_total',
    up(database) {
      // B7: 额度池 — orders.paid_total_cents + order_payments 表 + 存量换算
      const dbPath = process.env.DB_PATH || './data/commission.db'
      if (dbPath !== ':memory:' && existsSync(dbPath)) {
        try {
          copyFileSync(dbPath, `${dbPath}.bak.v24`)
          console.log(`📦 迁移 v24: 已备份 ${dbPath} → ${dbPath}.bak.v24`)
        } catch (err) {
          console.warn(`⚠️ 迁移 v24: 备份失败（${err.message}），继续执行迁移`)
        }
      }
      // 1. orders 加 paid_total_cents
      const cols = database.prepare('PRAGMA table_info(orders)').all()
      if (!cols.some(c => c.name === 'paid_total_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN paid_total_cents INTEGER DEFAULT 0')
      }
      // 2. 存量换算：已付分期 SUM → paid_total_cents
      database.exec(`
        UPDATE orders SET paid_total_cents = (
          SELECT COALESCE(SUM(amount_cents), 0)
          FROM order_payment_installments
          WHERE order_id = orders.id AND status = 'paid'
        )
      `)
      // 3. 收款流水表
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          amount_cents INTEGER NOT NULL,
          note TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT DEFAULT 'artist',
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id)')
    }
  },
  {
    version: 25,
    name: 'tier_visibility',
    up(database) {
      // v0.24 #10: 档位三态（visible/showcase/hidden）
      const cols = database.prepare('PRAGMA table_info(price_tiers)').all()
      if (!cols.some(c => c.name === 'visibility')) {
        database.exec("ALTER TABLE price_tiers ADD COLUMN visibility TEXT DEFAULT 'visible'")
      }
    }
  },
  {
    version: 26,
    name: 'quick_actions',
    up(database) {
      // v0.24-C: 快捷按钮 DB 持久化（JSON 数组）
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'quick_actions')) {
        database.exec('ALTER TABLE artists ADD COLUMN quick_actions TEXT DEFAULT NULL')
      }
    }
  },
  {
    version: 27,
    name: 'artwork_is_cover',
    up(database) {
      // v0.25 #5: 封面图指定（一个画师最多 1 个封面）
      const cols = database.prepare('PRAGMA table_info(artworks)').all()
      if (!cols.some(c => c.name === 'is_cover')) {
        database.exec('ALTER TABLE artworks ADD COLUMN is_cover INTEGER DEFAULT 0')
      }
    }
  },
  {
    version: 28,
    name: 'stage_random_template',
    up(database) {
      // v0.25 #8: 多模板随机（节点话术随机选择开关）
      const cols = database.prepare('PRAGMA table_info(artist_workflow_stages)').all()
      if (!cols.some(c => c.name === 'random_template')) {
        database.exec('ALTER TABLE artist_workflow_stages ADD COLUMN random_template INTEGER DEFAULT 0')
      }
    }
  }
]

/**
 * 在给定数据库实例上执行建表 + 版本化迁移
 */
export function initDatabase(database) {
  database.exec(schema)

  // ─── 版本化迁移 ───
  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    database.transaction(() => {
      migration.up(database)
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name)
    })()
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
  if (adminQq) {
    // 仅当 admin_qq 为空时写入（不覆盖运行时更换的值）
    database.prepare(
      "UPDATE platform_config SET value = ? WHERE key = 'admin_qq' AND (value = '' OR value IS NULL)"
    ).run(adminQq)

    // 确保管理员画师账号存在
    const existing = database.prepare('SELECT id FROM artists WHERE qq_number = ?').get(adminQq)
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
        const admin = database.prepare('SELECT id FROM artists WHERE qq_number = ?').get(adminQq)
        database.prepare('INSERT OR IGNORE INTO commission_rules (artist_id, content) VALUES (?, ?)').run(admin.id, '')
        // P1-5: 管理员画师也需要工作流种子
        const wfCount = database.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?').get(admin.id)
        if (wfCount.c === 0) {
          const tpl = database.prepare('SELECT * FROM default_workflow_template ORDER BY sort_order ASC').all()
          const ins = database.prepare('INSERT INTO artist_workflow_stages (artist_id, name, description, sort_order, takes_payment, basis_points, speech_template) VALUES (?, ?, ?, ?, ?, ?, ?)')
          for (const t of tpl) ins.run(admin.id, t.name, t.description || null, t.sort_order, t.takes_payment ? 1 : 0, t.basis_points, '{客户名}，你的订单已{节点名}。')
        }
        console.log(`✅ 管理员账号已自动创建 (QQ: ${adminQq})`)
      } catch (err) {
        console.error(`⚠️ 管理员账号创建失败: ${err.message}`)
      }
    }
  }
}

// CLI 直接执行时自动建表（import 时不触发副作用）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDatabase(db)
  console.log('✅ 数据库初始化完成')
}
