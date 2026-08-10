/* eslint-disable no-console -- 迁移脚本按约定豁免（CLI 输出是脚本本职，源头防屎门禁豁免项） */
// @ts-nocheck — P2 豁免：1,899 行 DDL/迁移脚本，checkJs 下 14 处 catch err.message 报错（JS 文件无 as 断言），类型价值为零，按派工 P2-5 豁免路径处理；checkJs 仍覆盖未来新增 .js
import db from './connection.js'
import { fileURLToPath } from 'url'
import { copyFileSync, existsSync } from 'fs'

/**
 * 迁移前自动备份（仅文件数据库）— P0-10: 抽取自 13 处复制粘贴的迁移备份逻辑
 * 行为与原实现完全一致：备份文件名 dbPath.bak.vN、成功/失败日志格式不变
 */
function backupDbBeforeMigration(version) {
  const dbPath = process.env.DB_PATH || './data/commission.db'
  if (dbPath !== ':memory:' && existsSync(dbPath)) {
    try {
      copyFileSync(dbPath, `${dbPath}.bak.v${version}`)
      console.log(`📦 迁移 v${version}: 已备份 ${dbPath} → ${dbPath}.bak.v${version}`)
    } catch (err) {
      console.warn(`⚠️ 迁移 v${version}: 备份失败（${err.message}），继续执行迁移`)
    }
  }
}

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
  totp_secret TEXT,
  totp_verified INTEGER NOT NULL DEFAULT 0,
  totp_failed_attempts INTEGER NOT NULL DEFAULT 0,
  totp_locked_until INTEGER,
  deleted_at DATETIME,
  weibo_url TEXT,
  bilibili_url TEXT,
  notify_enabled INTEGER DEFAULT 1,
  quick_actions TEXT DEFAULT NULL,
  template_id TEXT DEFAULT 'default',
  palette_id TEXT DEFAULT 'paper',
  custom_page_path TEXT,
  dashboard_default_panel TEXT,
  revision_note TEXT,
  custom_links TEXT,
  accent_color TEXT DEFAULT NULL,
  platform_urls TEXT DEFAULT NULL,
  inspiration_tags TEXT DEFAULT NULL,
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
  discount_enabled INTEGER DEFAULT 0,
  multi_style_enabled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TOTP 已用动态码表（v48：重放防护，同一码只准成功一次）
CREATE TABLE IF NOT EXISTS totp_used_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (artist_id, code_hash)
);

-- 价格档位表
-- 档位表（历史遗留：迁移 v1-v37 依赖此表存在；v50（SPEC-PRICE-2 价格模型统一）DROP 移除，
-- 此处保留仅维持迁移链完整——新库建了也会被 v50 删掉）
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
  cover_order INTEGER DEFAULT 0,
  description TEXT DEFAULT NULL,
  width INTEGER DEFAULT NULL,
  height INTEGER DEFAULT NULL,
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

-- 订单表（v50 重建前基线 + 迁移补充列：tier_id 仅维持迁移链完整，v50 按此触发重建清退；
-- 旧倍率列 usage/rush_multiplier_id 由 v9 补齐、v50 重建移除；version 由 v53 补充——
-- 最终结构与迁移链一致，见 F-6（P3-19）一致性测试）
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  artist_id INTEGER NOT NULL,
  tier_id INTEGER,
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
);

-- D-2（R-9）: 下单/收款幂等键表——scope+key 复合主键兜业务重复
-- （UNIQUE order_no 只兜单号不兜业务重复；错误响应不落缓存，允许重试）
CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, key)
);

-- 参考图归属登记表（v55，审计批 F-10/P2-13 后端侧）
-- 客户上传参考图时按匿名凭证登记 (anon_id, file_path)；下单校验归属后绑定 order_id，
-- 绑定后不可再被他人使用；存量未登记路径由存在性校验兜底
CREATE TABLE IF NOT EXISTS reference_uploads (
  id INTEGER PRIMARY KEY,
  anon_id INTEGER NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  order_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

-- 订单付款分期表（v5；v40 加锁价列；v52 退役 paid_cents/status/paid_at/requested_at
-- 用户拍板（批4B）：老数据库允许丢弃，不留僵尸列；节点已收一律由 orders.paid_total_cents 顺序推导）
CREATE TABLE IF NOT EXISTS order_payment_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  basis_points INTEGER NOT NULL,
  amount_cents INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  locked_reason TEXT CHECK(locked_reason IS NULL OR locked_reason IN ('completed','paidOff','prev')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 收款流水表（v24 额度池）
CREATE TABLE IF NOT EXISTS order_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  installment_id INTEGER DEFAULT NULL,
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

-- 价格倍率表（历史遗留：迁移 v9-v49 依赖此表存在；v50（SPEC-PRICE-2）DROP 移除，
-- 用途/加急统一为 addon_templates category=usage/rush 增项；此处保留仅维持迁移链完整）
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

-- 订单价格明细快照表（v9；v50 SPEC-PRICE-2 新 item_type 口径）
CREATE TABLE IF NOT EXISTS order_price_breakdown (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('base','addon_fixed','addon_percent','usage','rush','discount')),
  item_name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  multiplier REAL DEFAULT 1.0,
  quantity INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 登录码表（历史遗留：迁移 v13 依赖此表存在；v41（REQ-027 R7）DROP 移除，此处保留仅维持迁移链完整）
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
  language TEXT DEFAULT 'zh-CN',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  artist_reply TEXT DEFAULT NULL,
  replied_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_by_admin INTEGER DEFAULT 0,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 折扣码表（v32）
CREATE TABLE IF NOT EXISTS discount_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK(discount_type IN ('percent', 'fixed')),
  discount_value REAL NOT NULL,
  max_uses INTEGER DEFAULT NULL,
  used_count INTEGER DEFAULT 0,
  expires_at DATETIME DEFAULT NULL,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  UNIQUE(artist_id, code)
);

-- 操作日志表（v35，永久保留）
CREATE TABLE IF NOT EXISTS order_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK(action_type IN (
    'status_change', 'price_change', 'extra_item', 'payment', 'stage_advance', 'note_update'
  )),
  actor TEXT NOT NULL DEFAULT 'artist',
  detail_json TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 增项库表（v36 画师级；v50 SPEC-PRICE-2 统一价格模型：
--   control_type 仅 switch/quantity；price_mode fixed(¥)/percent(%)；category add/usage/rush）
CREATE TABLE IF NOT EXISTS addon_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- v49 (REQ-036): artist_id 可空——NULL = 系统预置模板（全画师共用，管理员可维护）
  artist_id INTEGER,
  name TEXT NOT NULL,
  control_type TEXT NOT NULL DEFAULT 'switch' CHECK(control_type IN ('switch','quantity')),
  price_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(price_mode IN ('fixed','percent')),
  -- fixed: 元；percent: 整数百分比（50 = +50%）
  default_price REAL NOT NULL DEFAULT 0,
  unit_label TEXT,
  sort_order INTEGER DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'add' CHECK(category IN ('add','usage','rush')),
  max_quantity INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 画风表（v36）
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
);

-- 尺寸表（v36，挂在画风下；v37 加图/描述/天数字段）
CREATE TABLE IF NOT EXISTS style_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  art_style_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  base_price REAL NOT NULL,
  sort_order INTEGER DEFAULT 0,
  image TEXT DEFAULT NULL,
  image_artwork_id INTEGER DEFAULT NULL,
  description TEXT DEFAULT NULL,
  work_days INTEGER DEFAULT NULL,
  display_status TEXT NOT NULL DEFAULT 'available' CHECK(display_status IN ('available','showcase','closed')),
  FOREIGN KEY (art_style_id) REFERENCES art_styles(id) ON DELETE CASCADE,
  FOREIGN KEY (image_artwork_id) REFERENCES artworks(id) ON DELETE SET NULL
);

-- 作品档位标注表（v37，F6：作品 ↔ 尺寸多对多，双向 CASCADE）
CREATE TABLE IF NOT EXISTS artwork_size_tags (
  artwork_id INTEGER NOT NULL,
  style_size_id INTEGER NOT NULL,
  PRIMARY KEY (artwork_id, style_size_id),
  FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
  FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE CASCADE
);

-- 画风增项表（v36，从增项库导入，可改价/禁用；v50 SPEC-PRICE-2 快照列对齐新维度）
CREATE TABLE IF NOT EXISTS style_addons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  art_style_id INTEGER NOT NULL,
  -- v49 (REQ-036 C'): 可空 + ON DELETE SET NULL——删模板时解除引用、保留独立增项
  addon_template_id INTEGER,
  is_enabled INTEGER DEFAULT 1,
  price_override REAL,
  -- v49 (REQ-036 C') / v50: 模板快照列——解绑后独立增项的展示/计价数据（删除模板时从 addon_templates 拷入）
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
);

-- 尺寸覆盖表（v36，可选，不填沿用画风默认）
CREATE TABLE IF NOT EXISTS size_addon_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  style_size_id INTEGER NOT NULL,
  style_addon_id INTEGER NOT NULL,
  price_override REAL,
  is_hidden INTEGER DEFAULT 0,
  FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE CASCADE,
  FOREIGN KEY (style_addon_id) REFERENCES style_addons(id) ON DELETE CASCADE,
  UNIQUE(style_size_id, style_addon_id)
);

-- 订单价格条目账本表（v39，REQ-025 动态节点计价：总价 = Σ 条目 delta，只追加不删不改）
CREATE TABLE IF NOT EXISTS order_price_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'base', 'manual_adjust', 'extra_item', 'discount_item',
    'refund_item', 'extra_charge_after_close', 'extra_refund_after_close'
  )),
  delta_cents INTEGER NOT NULL,
  name TEXT,
  note TEXT,
  created_by TEXT NOT NULL DEFAULT 'artist',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
`

/**
 * 索引单独存放 — 在迁移之后执行，避免老库升级时因列不存在而崩溃
 */
export const schemaIndexes = `
CREATE INDEX IF NOT EXISTS idx_orders_artist_status ON orders(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders(artist_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_orders_client_qq ON orders(client_qq);
CREATE INDEX IF NOT EXISTS idx_order_references_order ON order_references(order_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_order ON deliverables(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_deadline ON orders(artist_id, deadline);
CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_qq ON artists(qq_number);
CREATE INDEX IF NOT EXISTS idx_extra_items_order ON order_extra_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_queue_zone ON orders(artist_id, queue_zone);
CREATE INDEX IF NOT EXISTS idx_guestbook_artist ON guestbook_messages(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_addon_templates_artist ON addon_templates(artist_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_art_styles_artist ON art_styles(artist_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_style_sizes_style ON style_sizes(art_style_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_style_addons_style ON style_addons(art_style_id);
CREATE INDEX IF NOT EXISTS idx_size_addon_overrides_size ON size_addon_overrides(style_size_id);
CREATE INDEX IF NOT EXISTS idx_artwork_size_tags_size ON artwork_size_tags(style_size_id);
CREATE INDEX IF NOT EXISTS idx_price_entries_order ON order_price_entries(order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_totp_used_artist ON totp_used_codes(artist_id);
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
      // 回填已有的 price_snapshot（形状感知守卫：新库基线已无 tier_id 列（SPEC-PRICE-2 v50），跳过）
      if (orderCols.some(c => c.name === 'tier_id')) {
        database.exec(`UPDATE orders SET price_snapshot = (
          SELECT t.price FROM price_tiers t WHERE t.id = orders.tier_id
        ) WHERE price_snapshot IS NULL AND tier_id IS NOT NULL`)
      }
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
      backupDbBeforeMigration(11)

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
      backupDbBeforeMigration(12)

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
      backupDbBeforeMigration(18)
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
      backupDbBeforeMigration(19)
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
      backupDbBeforeMigration(20)
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
      backupDbBeforeMigration(21)
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
      backupDbBeforeMigration(22)
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
      backupDbBeforeMigration(23)
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
      backupDbBeforeMigration(24)
      // 1. orders 加 paid_total_cents
      const cols = database.prepare('PRAGMA table_info(orders)').all()
      if (!cols.some(c => c.name === 'paid_total_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN paid_total_cents INTEGER DEFAULT 0')
      }
      // 2. 存量换算：已付分期 SUM → paid_total_cents
      // 守卫（批4B）：新形态库已退役 status 节点列（v52），空表无存量，换算自然不适用；
      // 仅旧形态库（含 status 列）照常执行。探测风格与第 1 步一致：PRAGMA table_info
      const instCols = database.prepare('PRAGMA table_info(order_payment_installments)').all()
      if (instCols.some(c => c.name === 'status')) {
        database.exec(`
          UPDATE orders SET paid_total_cents = (
            SELECT COALESCE(SUM(amount_cents), 0)
            FROM order_payment_installments
            WHERE order_id = orders.id AND status = 'paid'
          )
        `)
      }
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
  },
  {
    version: 29,
    name: 'order_start_date',
    up(database) {
      // v0.26 B: 开工日（画师手动设定，用于截稿日自动建议 + 日历带子起点）
      const cols = database.prepare('PRAGMA table_info(orders)').all()
      if (!cols.some(c => c.name === 'start_date')) {
        database.exec('ALTER TABLE orders ADD COLUMN start_date TEXT DEFAULT NULL')
      }
    }
  },
  {
    version: 30,
    name: 'artwork_dimensions',
    up(database) {
      // #15: 瀑布流零跳动——前端需预知图片宽高比，避免加载后 reflow
      const cols = database.prepare('PRAGMA table_info(artworks)').all()
      if (!cols.some(c => c.name === 'width')) {
        database.exec('ALTER TABLE artworks ADD COLUMN width INTEGER DEFAULT NULL')
      }
      if (!cols.some(c => c.name === 'height')) {
        database.exec('ALTER TABLE artworks ADD COLUMN height INTEGER DEFAULT NULL')
      }
    }
  },
  {
    version: 31,
    name: 'artwork_cover_order',
    up(database) {
      // v0.31: 多封面排序——cover_order 控制封面轮播顺序（0 = 未排序/非封面）
      const cols = database.prepare('PRAGMA table_info(artworks)').all()
      if (!cols.some(c => c.name === 'cover_order')) {
        database.exec('ALTER TABLE artworks ADD COLUMN cover_order INTEGER DEFAULT 0')
      }
      // 存量封面补编号：按 id 升序（先设的排前面）
      database.exec(`
        UPDATE artworks SET cover_order = (
          SELECT COUNT(*) FROM artworks a2
          WHERE a2.artist_id = artworks.artist_id AND a2.is_cover = 1 AND a2.id <= artworks.id
        ) WHERE is_cover = 1 AND cover_order = 0
      `)
    }
  },
  {
    version: 32,
    name: 'discount_codes',
    up(database) {
      // v0.31 F3: 折扣码（画师可开关，默认关；全局码，v0.32 多画风后再扩展）
      database.exec(`
        CREATE TABLE IF NOT EXISTS discount_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          discount_type TEXT NOT NULL DEFAULT 'percent' CHECK(discount_type IN ('percent', 'fixed')),
          discount_value REAL NOT NULL,
          max_uses INTEGER DEFAULT NULL,
          used_count INTEGER DEFAULT 0,
          expires_at DATETIME DEFAULT NULL,
          enabled INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
          UNIQUE(artist_id, code)
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_discount_codes_artist ON discount_codes(artist_id, enabled)')

      // 画师级开关（默认关）
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'discount_enabled')) {
        database.exec('ALTER TABLE artists ADD COLUMN discount_enabled INTEGER DEFAULT 0')
      }

      // 订单记录折扣信息（审计追溯）
      const orderCols = database.prepare('PRAGMA table_info(orders)').all()
      if (!orderCols.some(c => c.name === 'discount_code_id')) {
        database.exec('ALTER TABLE orders ADD COLUMN discount_code_id INTEGER DEFAULT NULL')
      }
      if (!orderCols.some(c => c.name === 'discount_amount_cents')) {
        database.exec('ALTER TABLE orders ADD COLUMN discount_amount_cents INTEGER DEFAULT 0')
      }
    }
  },
  {
    version: 33,
    name: 'installment_paid_cents',
    up(database) {
      // v0.31 F4: 节点收款重做——每节点记录实收金额
      const instCols = database.prepare('PRAGMA table_info(order_payment_installments)').all()
      if (!instCols.some(c => c.name === 'paid_cents')) {
        database.exec('ALTER TABLE order_payment_installments ADD COLUMN paid_cents INTEGER DEFAULT 0')
      }
      // 收款流水关联到具体节点（可选，null = 额度池兜底）
      const payCols = database.prepare('PRAGMA table_info(order_payments)').all()
      if (!payCols.some(c => c.name === 'installment_id')) {
        database.exec('ALTER TABLE order_payments ADD COLUMN installment_id INTEGER DEFAULT NULL')
      }
    }
  },
  {
    version: 34,
    name: 'guestbook_language',
    up(database) {
      // v0.31 REQ-021 F8 前置：留言记录语言（后端写入，不靠前端检测）
      const cols = database.prepare('PRAGMA table_info(guestbook_messages)').all()
      if (!cols.some(c => c.name === 'language')) {
        database.exec("ALTER TABLE guestbook_messages ADD COLUMN language TEXT DEFAULT 'zh-CN'")
      }
    }
  },
  {
    version: 35,
    name: 'order_activity_logs',
    up(database) {
      // v0.31 REQ-021 F1: 操作日志（永久保留，不清理）
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_activity_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          action_type TEXT NOT NULL CHECK(action_type IN (
            'status_change', 'price_change', 'extra_item', 'payment', 'stage_advance', 'note_update'
          )),
          actor TEXT NOT NULL DEFAULT 'artist',
          detail_json TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_activity_logs_order ON order_activity_logs(order_id, created_at)')
    }
  },
  {
    version: 36,
    name: 'multi_style_model',
    up(database) {
      // REQ-023 Phase 1: 多画风模型——5 表 + 老数据迁移
      backupDbBeforeMigration(36)

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
      const atColsV36 = database.prepare('PRAGMA table_info(addon_templates)').all().map(c => c.name)
      if (!atColsV36.includes('pricing_mode')) return
      const existingStyles = database.prepare('SELECT COUNT(*) AS c FROM art_styles').get().c
      if (existingStyles > 0) return // 已迁移过

      const artists = database.prepare('SELECT id FROM artists').all()
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
        ).all(artist.id)
        for (const tier of tiers) {
          insertSize.run(styleId, tier.name, tier.price, tier.sort_order ?? 0)
        }

        // 3. price_addons → addon_templates
        // 映射：toggle→switch, quantity→quantity, inquiry→radio
        // pricing_mode：fixed→fixed, percent→fixed（v1 不支持百分比增项）
        const addons = database.prepare(
          'SELECT * FROM price_addons WHERE artist_id = ? ORDER BY sort_order ASC'
        ).all(artist.id)
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
        ).all(artist.id)
        for (const tpl of templates) {
          insertStyleAddon.run(styleId, tpl.id)
        }
      }
    }
  },
  {
    version: 37,
    name: 'style_unify_sizes_artwork_tags_f5',
    up(database) {
      // REQ-024 画风档位统一（F1/F2/F5/F6 数据层，一次建全避免二次迁移）
      backupDbBeforeMigration(37)

      // ─── 1. style_sizes: 尺寸带图/描述/天数（F1） ───
      // image: 独立上传路径；image_artwork_id: 从作品集挑（删作品自动置空）
      const sizeCols = database.prepare('PRAGMA table_info(style_sizes)').all()
      if (!sizeCols.some(c => c.name === 'image')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN image TEXT DEFAULT NULL')
      }
      if (!sizeCols.some(c => c.name === 'image_artwork_id')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN image_artwork_id INTEGER DEFAULT NULL REFERENCES artworks(id) ON DELETE SET NULL')
      }
      if (!sizeCols.some(c => c.name === 'description')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN description TEXT DEFAULT NULL')
      }
      if (!sizeCols.some(c => c.name === 'work_days')) {
        database.exec('ALTER TABLE style_sizes ADD COLUMN work_days INTEGER DEFAULT NULL')
      }

      // ─── 2. artists: 多画风开关（F2，默认关） ───
      const artistCols = database.prepare('PRAGMA table_info(artists)').all()
      if (!artistCols.some(c => c.name === 'multi_style_enabled')) {
        database.exec('ALTER TABLE artists ADD COLUMN multi_style_enabled INTEGER DEFAULT 0')
      }

      // ─── 3. artworks: 自由描述（F6） ───
      const artworkCols = database.prepare('PRAGMA table_info(artworks)').all()
      if (!artworkCols.some(c => c.name === 'description')) {
        database.exec('ALTER TABLE artworks ADD COLUMN description TEXT DEFAULT NULL')
      }

      // ─── 4. artwork_size_tags: 作品↔尺寸多对多标注（F6，双向 CASCADE） ───
      database.exec(`
        CREATE TABLE IF NOT EXISTS artwork_size_tags (
          artwork_id INTEGER NOT NULL,
          style_size_id INTEGER NOT NULL,
          PRIMARY KEY (artwork_id, style_size_id),
          FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
          FOREIGN KEY (style_size_id) REFERENCES style_sizes(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_artwork_size_tags_size ON artwork_size_tags(style_size_id)')

      // ─── 5. F5: 旧模型画师迁移（showcase/hidden 丢弃——用户拍板） ───
      migrateF5OldModelArtists(database)
    }
  },
  {
    version: 38,
    name: 'artists_status_check_add_hidden',
    // ⚠️ 必须事务外执行：PRAGMA foreign_keys 在事务内是 no-op（2026-08-04 事故根因），
    // 重建 artists 表时 DROP 会触发子表 ON DELETE CASCADE——FK 不真正关闭就会清空全部子表数据
    noTransaction: true,
    up(database) {
      // BUG-8 第三项（用户拍板补 admin 设 hidden 能力）：
      // 存量 artists 表 CHECK 约束为 ('open','full','break')——v0.13 加 hidden 状态时
      // 应用层白名单已支持，但存量表 CHECK 焊死在建表语句里（ALTER ADD COLUMN 不更新 CHECK），
      // 导致任何写入 status='hidden' 的操作 500（SQLITE_CONSTRAINT_CHECK）。
      // SQLite 修改 CHECK 只能重建表（官方 12 步 alter 流程，事务外关 FK）。
      const tableSql = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'"
      ).get()
      // 幂等守卫：已含 hidden 则跳过（新库建表即带 hidden，也跳过）；清理上次失败残留的临时表
      if (tableSql && tableSql.sql.includes("'hidden'")) {
        database.exec('DROP TABLE IF EXISTS artists_new')
        return
      }

      backupDbBeforeMigration(38)

      const cols = database.prepare('PRAGMA table_info(artists)').all().map(c => c.name)
      const colList = cols.join(', ')

      // 用原表 CREATE TABLE 语句重建（只替换 status 的 CHECK 约束）——不手抄列清单，永不漏列
      // 表名可能带引号（ALTER RENAME 后 sqlite_master 存 "artists"），正则两种都匹配
      const newSql = tableSql.sql
        .replace(/^CREATE TABLE\s+"?artists"?(\s|\()/i, 'CREATE TABLE artists_new$1')
        .replace(/CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i, "CHECK(status IN ('open', 'full', 'break', 'hidden'))")
      if (newSql === tableSql.sql) {
        console.warn('⚠️ 迁移 v38: 未找到 status CHECK 约束，跳过重建')
        return
      }

      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止，绝不 DROP）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v38: foreign_keys 未能关闭（值=' + fkState + '），中止重建以防 CASCADE 清空子表')
      }
      try {
        // 索引定义必须在 DROP 前抓取（DROP TABLE 会连同索引一起删除）；sql IS NULL 的是 UNIQUE 约束自动索引，建表时已包含
        const indexes = database.prepare(
          "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='artists' AND sql IS NOT NULL"
        ).all()
        database.transaction(() => {
          database.exec(newSql)
          database.exec(`INSERT INTO artists_new (${colList}) SELECT ${colList} FROM artists`)
          database.exec('DROP TABLE artists')
          database.exec('ALTER TABLE artists_new RENAME TO artists')
          for (const idx of indexes) database.exec(idx.sql)
        })()
        // 官方 12 步流程要求：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
        const fkViolations = database.pragma('foreign_key_check')
        if (fkViolations.length > 0) {
          throw new Error('迁移 v38: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
      } finally {
        // 事务失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }
      console.log('📦 迁移 v38: artists CHECK 约束补 hidden（重建表，' + cols.length + ' 列数据已迁移）')
    }
  },
  {
    version: 39,
    name: 'order_price_entries',
    up(database) {
      // REQ-025 动态节点计价 第一阶段：价格条目账本表（总价 = Σ 条目 delta）
      // 只追加不删不改（服务层不提供 UPDATE/DELETE 路径）；纯建表，事务内安全（无 DROP/RENAME 父表）
      backupDbBeforeMigration(39)
      database.exec(`
        CREATE TABLE IF NOT EXISTS order_price_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN (
            'base', 'manual_adjust', 'extra_item', 'discount_item',
            'refund_item', 'extra_charge_after_close', 'extra_refund_after_close'
          )),
          delta_cents INTEGER NOT NULL,
          name TEXT,
          note TEXT,
          created_by TEXT NOT NULL DEFAULT 'artist',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_price_entries_order ON order_price_entries(order_id, created_at)')
    }
  },
  {
    version: 40,
    name: 'installments_locked_columns',
    up(database) {
      // REQ-025 第二阶段：节点锁价持久化（R4 完成/付清即锁 + 回退不解锁）
      // ALTER TABLE ADD COLUMN，无 DROP/RENAME 父表，事务内安全（对照 v38 教训：仅重建父表才事务外）
      const cols = database.prepare('PRAGMA table_info(order_payment_installments)').all()
      if (!cols.some(c => c.name === 'locked')) {
        database.exec('ALTER TABLE order_payment_installments ADD COLUMN locked INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'locked_reason')) {
        database.exec("ALTER TABLE order_payment_installments ADD COLUMN locked_reason TEXT CHECK(locked_reason IS NULL OR locked_reason IN ('completed','paidOff','prev'))")
      }
    }
  },
  {
    version: 41,
    name: 'totp_login',
    up(database) {
      // REQ-027：TOTP 动态口令登录
      // 1) artists 加 TOTP 绑定/防爆破列（ADD COLUMN 事务内安全，对照 v40）
      // 2) R7 一刀切：移除旧登录码表（DROP 子表 login_codes 不触发父表 CASCADE，对照 v38 教训：仅 DROP/RENAME 父表才事务外）
      const cols = database.prepare('PRAGMA table_info(artists)').all()
      if (!cols.some(c => c.name === 'totp_secret')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_secret TEXT')
      }
      if (!cols.some(c => c.name === 'totp_verified')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_verified INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'totp_failed_attempts')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_failed_attempts INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'totp_locked_until')) {
        database.exec('ALTER TABLE artists ADD COLUMN totp_locked_until INTEGER')
      }
      database.exec('DROP TABLE IF EXISTS login_codes')
    }
  },
  {
    version: 42,
    name: 'social_platforms',
    up(database) {
      // REQ-022 F2: 社交平台表（外链重做）
      // 纯 CREATE TABLE + 种子 INSERT，无 ALTER/DROP，事务内安全（对照 v40/v41）
      database.exec(`
        CREATE TABLE IF NOT EXISTS social_platforms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon_key TEXT,
          fallback_char TEXT,
          match_domains TEXT NOT NULL DEFAULT '[]',
          sort_order INTEGER DEFAULT 0,
          enabled INTEGER DEFAULT 1
        )
      `)
      // 种子数据（约 20 平台）：icon_key 采用 simple-icons slug（已对 master 分支逐一核验）；
      // simple-icons 无图标的平台（LOFTER/抖音/米画师/QQ空间）用 fallback_char 单字兜底。
      // 幂等守卫：仅当表为空时插入（复跑迁移不产生重复数据）。
      const count = database.prepare('SELECT COUNT(*) AS c FROM social_platforms').get().c
      if (count === 0) {
        const insert = database.prepare(`
          INSERT INTO social_platforms (name, icon_key, fallback_char, match_domains, sort_order, enabled)
          VALUES (?, ?, ?, ?, ?, 1)
        `)
        const seeds = [
          ['微博', 'sinaweibo', null, ['weibo.com', 'weibo.cn'], 1],
          ['Bilibili', 'bilibili', null, ['bilibili.com', 'b23.tv'], 2],
          ['小红书', 'xiaohongshu', null, ['xiaohongshu.com', 'xhslink.com'], 3],
          ['LOFTER', null, 'L', ['lofter.com'], 4],
          ['Pixiv', 'pixiv', null, ['pixiv.net', 'pixiv.me'], 5],
          ['X (Twitter)', 'x', null, ['x.com', 'twitter.com'], 6],
          ['抖音', null, '抖', ['douyin.com'], 7],
          ['快手', 'kuaishou', null, ['kuaishou.com'], 8],
          ['豆瓣', 'douban', null, ['douban.com'], 9],
          ['QQ空间', null, '空', ['qzone.qq.com'], 10],
          ['YouTube', 'youtube', null, ['youtube.com', 'youtu.be'], 11],
          ['Instagram', 'instagram', null, ['instagram.com'], 12],
          ['Twitch', 'twitch', null, ['twitch.tv'], 13],
          ['ArtStation', 'artstation', null, ['artstation.com'], 14],
          ['米画师', null, '米', ['mihuashi.com'], 15],
          ['TikTok', 'tiktok', null, ['tiktok.com'], 16],
          ['DeviantArt', 'deviantart', null, ['deviantart.com'], 17],
          ['站酷', 'zcool', null, ['zcool.com.cn', 'zcool.cn'], 18],
          ['爱发电', 'afdian', null, ['afdian.com', 'afdian.net'], 19],
          ['Weasyl', 'weasyl', null, ['weasyl.com'], 20],
          ['Threads', 'threads', null, ['threads.net'], 21],
          ['Tumblr', 'tumblr', null, ['tumblr.com'], 22],
          ['Behance', 'behance', null, ['behance.net'], 23],
          ['网易云音乐', 'neteasecloudmusic', null, ['music.163.com'], 24]
        ]
        for (const [name, iconKey, fallbackChar, domains, sortOrder] of seeds) {
          insert.run(name, iconKey, fallbackChar, JSON.stringify(domains), sortOrder)
        }
      }
    }
  },
  {
    version: 43,
    name: 'drop_addon_tables',
    // ⚠️ 必须事务外执行：DROP 父表触发子表 ON DELETE CASCADE（v38 事故同款陷阱），
    // PRAGMA foreign_keys 在事务内是 no-op——关 FK 后立即回读校验，值不为 0 直接中止，绝不 DROP
    noTransaction: true,
    up(database) {
      // 冻结依据（三号评估报告 §Q1.5，2026-08-05 用户拍板 DROP）：
      // ① 生产零写路径——旧增项 CRUD 已删（v0.36 C-1），算价读路径已移除（第一批 1b8a375），
      //    POST schema 已拒收 addons 字段（本批），前端已停传（13dd4e7）
      // ② 存量仅 1 行测试垃圾数据、0 订单引用
      // ③ 两表无下游 FK（orders 无列/FK 指向这两表）；price_addons 索引随表删除
      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v43: foreign_keys 未能关闭（值=' + fkState + '），中止 DROP 以防 CASCADE 清空子表')
      }
      try {
        database.exec('DROP TABLE IF EXISTS addon_tiers')
        database.exec('DROP TABLE IF EXISTS price_addons')
        // DROP 后恢复 FK 前验证无悬空外键引用（零悬空才安全）
        const fkViolations = database.pragma('foreign_key_check')
        if (fkViolations.length > 0) {
          throw new Error('迁移 v43: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
      } finally {
        // 失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }
    }
  },
  {
    version: 44,
    name: 'tracking_events_anon_tokens',
    up(database) {
      // REQ-033: 业务埋点——匿名凭证 + 事件表
      // 纯 CREATE TABLE + INDEX，无 ALTER/DROP，事务内安全（对照 v42）
      database.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          ts INTEGER NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          artist_id INTEGER,
          anon_id INTEGER,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
      database.exec('CREATE INDEX IF NOT EXISTS idx_events_name_ts ON events(name, ts)')
      database.exec(`
        CREATE TABLE IF NOT EXISTS anon_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
    }
  },
  {
    version: 45,
    name: 'tracking_events_artist_index',
    up(database) {
      // 性能：画师/管理员统计按 artist_id 过滤事件（REQ-033 统计页），防全表扫描
      // 纯 CREATE INDEX，无 ALTER/DROP，事务内安全（对照 v44）；IF NOT EXISTS 幂等
      database.exec('CREATE INDEX IF NOT EXISTS idx_events_artist_ts ON events(artist_id, ts)')
    }
  },
  {
    version: 46,
    name: 'client_profiles',
    up(database) {
      // REQ-035 批A: 画师私有客户标记（标签+备注，挂 client_qq 维度）
      database.exec(`
        CREATE TABLE IF NOT EXISTS client_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
          client_qq TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(artist_id, client_qq)
        );
        CREATE INDEX IF NOT EXISTS idx_client_profiles_artist ON client_profiles(artist_id);
      `)
    }
  },
  {
    version: 47,
    name: 'standalone_incomes',
    up(database) {
      // REQ-035 批C: 散单收入记账（不走订单流程，只记钱）
      database.exec(`
        CREATE TABLE IF NOT EXISTS standalone_incomes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          client_name TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          income_date TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_standalone_incomes_artist_date ON standalone_incomes(artist_id, income_date);
      `)
    }
  },
  {
    version: 48,
    name: 'totp_used_codes',
    up(database) {
      // P1-1：TOTP 重放防护——已用动态码记录表（唯一索引防并发插入，与 schema 区幂等）
      database.exec(`
        CREATE TABLE IF NOT EXISTS totp_used_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          artist_id INTEGER NOT NULL,
          code_hash TEXT NOT NULL,
          used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (artist_id, code_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_totp_used_artist ON totp_used_codes(artist_id);
      `)
    }
  },
  {
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
      //  4. 内置模板种子 5 个（系统预置 artist_id NULL，全画师共用）
      backupDbBeforeMigration(49)

      // ─── 1. style_sizes 加 display_status（ADD COLUMN 事务内安全，对照 v37） ───
      const sizeCols = database.prepare('PRAGMA table_info(style_sizes)').all()
      if (!sizeCols.some(c => c.name === 'display_status')) {
        database.exec("ALTER TABLE style_sizes ADD COLUMN display_status TEXT NOT NULL DEFAULT 'available' CHECK(display_status IN ('available','showcase','closed'))")
      }

      // ─── 2+3. 重建 addon_templates / style_addons（SQLite 改 NOT NULL/外键行为=重建表，官方 12 步） ───
      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v49: foreign_keys 未能关闭（值=' + fkState + '），中止重建以防 CASCADE 清空子表')
      }
      try {
        // 幂等守卫：已含 kind 列（旧形已迁移）或 category 列（新库直接新形，v50 SPEC-PRICE-2）则跳过；清理上次失败残留的临时表
        const atCols = database.prepare('PRAGMA table_info(addon_templates)').all().map(c => c.name)
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

        const saCols = database.prepare('PRAGMA table_info(style_addons)').all().map(c => c.name)
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
        const fkViolations = database.pragma('foreign_key_check')
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
      const seedCount = database.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id IS NULL').get().c
      // F-6（P3-19）: 旧形表（pricing_mode/kind，重建分支刚产出）无 price_mode 列，
      // 且旧形 CHECK 不含 percent——种子无法表达，跳过；v50 重建后系统模板由
      // 新库基线供给，旧库升级路径本迁移不产生种子（结构一致，数据口径见审计批F摘要）
      const atColsFinal = database.prepare('PRAGMA table_info(addon_templates)').all().map(c => c.name)
      if (seedCount === 0 && atColsFinal.includes('price_mode')) {
        const insert = database.prepare(`
          INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity)
          VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        // REQ-036 §三：默认 5 个内置模板（用户指定）；商用/加急 = 百分比计价（SPEC-PRICE-2：百分比金额只基于基础价）
        insert.run('加人物', 'quantity', 'fixed', 80, '人', 0, 'add', 10)
        insert.run('背景', 'quantity', 'fixed', 50, '个', 1, 'add', 10)
        insert.run('机甲', 'switch', 'fixed', 100, null, 2, 'add', null)
        insert.run('商用', 'switch', 'percent', 50, null, 3, 'usage', null)
        insert.run('加急', 'switch', 'percent', 100, null, 4, 'rush', null)
        console.log('📦 迁移 v49: 内置模板种子已写入（加人物/背景/机甲/商用/加急）')
      } else {
        console.log('📦 迁移 v49: 内置模板种子已存在，跳过')
      }
    }
  },
  {
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
      backupDbBeforeMigration(50)

      database.pragma('foreign_keys = OFF')
      // 事故教训双保险：确认 FK 真的关了（事务内 PRAGMA 是 no-op，此处若仍在事务内会返回 ON → 直接中止）
      const fkState = database.pragma('foreign_keys', { simple: true })
      if (fkState !== 0) {
        throw new Error('迁移 v50: foreign_keys 未能关闭（值=' + fkState + '），中止重建以防 CASCADE 清空子表')
      }
      try {
        // ─── 1. orders 重建（幂等守卫：已无 tier_id 则跳过） ───
        const oCols = database.prepare('PRAGMA table_info(orders)').all().map(c => c.name)
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
          database.exec('DROP TABLE IF EXISTS orders_new')
        }

        // ─── 2. order_price_breakdown 重建（幂等守卫：sqlite_master 中已含新口径则跳过） ───
        const bdSql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_price_breakdown'").get()
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
          database.exec('DROP TABLE IF EXISTS order_price_breakdown_new')
        }

        // ─── 3. addon_templates 重建（幂等守卫：已含 category 则跳过） ───
        const atCols = database.prepare('PRAGMA table_info(addon_templates)').all().map(c => c.name)
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
          database.exec('DROP TABLE IF EXISTS addon_templates_new')
        }

        // ─── 4. style_addons 重建（幂等守卫：已含 tpl_price_mode 则跳过） ───
        const saCols = database.prepare('PRAGMA table_info(style_addons)').all().map(c => c.name)
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
          database.exec('DROP TABLE IF EXISTS style_addons_new')
        }

        // ─── 5. 旧模型表清退（用户拍板：均为测试垃圾数据；0 订单引用旧倍率） ───
        database.exec('DROP TABLE IF EXISTS price_tiers')
        database.exec('DROP TABLE IF EXISTS price_multipliers')

        // 官方 12 步流程：FK 关闭期间完成重建后，恢复前验证无悬空外键引用
        const fkViolations = database.pragma('foreign_key_check')
        if (fkViolations.length > 0) {
          throw new Error('迁移 v50: foreign_key_check 发现 ' + fkViolations.length + ' 处悬空引用，中止: ' + JSON.stringify(fkViolations.slice(0, 3)))
        }
        console.log('📦 迁移 v50: SPEC-PRICE-2 价格模型统一完成（旧档位/旧倍率表已 DROP）')
      } finally {
        // 失败也必须恢复 FK，否则连接留在 OFF 状态（后续 CASCADE 全部失效）
        database.pragma('foreign_keys = ON')
      }
    }
  },
  {
    version: 51,
    name: 'style_addons_snapshot_cleanup',
    up(database) {
      // v50 修复补丁：v50 转换把已绑定行（快照本应为 NULL）的 tpl_* 写入了错误的
      // 'fixed'/'add' 默认值，遮蔽了模板真实值（如系统种子「加急」被显示成普通加法项）。
      // 快照列语义：仅服务解绑行（addon_template_id IS NULL）；绑定行以模板为准 → 清空其快照
      const r = database.prepare(`
        UPDATE style_addons SET
          tpl_name = NULL, tpl_control_type = NULL, tpl_price_mode = NULL,
          tpl_default_price = NULL, tpl_unit_label = NULL, tpl_category = NULL, tpl_max_quantity = NULL
        WHERE addon_template_id IS NOT NULL
      `).run()
      console.log(`📦 迁移 v51: 已清理 ${r.changes} 行绑定行的脏快照（模板为唯一权威）`)
    }
  },
  {
    version: 52,
    name: 'retire_installment_paid_columns',
    up(database) {
      // 批4B 用户拍板（方案 B = base schema 严格删列 + v24 探测守卫）：
      // 「如果我们现在有更好的解决方案，且确认无bug、更优，则老数据库允许丢弃。最终目的一定是最优解，
      // 最直觉，最符合设计，且最低屎山和技术债。现在没有真数据随时可以删数据库内容」
      // —— 历史迁移不可动的保护对象（存量库升级路径）已不存在；paid_cents/status/paid_at/requested_at
      // 属应消灭的僵尸列，节点已收一律由 orders.paid_total_cents 顺序推导（R7），本迁移在存量库上收尾删列。
      backupDbBeforeMigration(52)
      // 1) 清零冻结（防 DROP 前残留脏值；新形态库列不存在则跳过，空表无存量）
      const cols = database.prepare('PRAGMA table_info(order_payment_installments)').all().map(c => c.name)
      if (cols.includes('paid_cents') && cols.includes('status') && cols.includes('paid_at')) {
        database.exec(`
          UPDATE order_payment_installments
          SET paid_cents = 0, status = 'pending', paid_at = NULL
          WHERE paid_cents <> 0 OR status <> 'pending' OR paid_at IS NOT NULL
        `)
      }
      // 2) 列删除（幂等：每次 DROP 前重新 PRAGMA 探测，列不存在即跳过）
      for (const col of ['paid_cents', 'status', 'paid_at', 'requested_at']) {
        const curCols = database.prepare('PRAGMA table_info(order_payment_installments)').all().map(c => c.name)
        if (curCols.includes(col)) database.exec(`ALTER TABLE order_payment_installments DROP COLUMN ${col}`)
      }
    }
  },
  {
    version: 53,
    name: 'orders_version_optimistic_lock',
    up(database) {
      // D-1（R-5/P3-1）: 订单 version 乐观锁——双标签页/撤销重放防静默覆盖。
      // 幂等：新库基线 schema 已含该列（init.js 顶部 orders 表），存量库由本迁移补列
      const cols = database.prepare('PRAGMA table_info(orders)').all()
      if (!cols.some(c => c.name === 'version')) {
        database.exec('ALTER TABLE orders ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
      }
    }
  },
  {
    version: 54,
    name: 'idempotency_keys',
    up(database) {
      // D-2（R-9）: 下单/收款幂等键——UNIQUE order_no 只兜单号不兜业务重复，
      // 双标签页/慢渲染双击可产生两笔收款/两个订单；scope+key 复合主键兜业务幂等。
      // 幂等：IF NOT EXISTS（新库基线 schema 已含，存量库重复执行直接跳过）
      database.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          scope TEXT NOT NULL,
          key TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (scope, key)
        )
      `)
    }
  },
  {
    version: 55,
    name: 'reference_uploads_ownership',
    up(database) {
      // F-10（P2-13 后端侧）: 参考图归属凭据——上传按匿名凭证登记，下单校验并绑定。
      // 幂等：IF NOT EXISTS（新库基线 schema 已含，存量库重复执行直接跳过）
      database.exec(`
        CREATE TABLE IF NOT EXISTS reference_uploads (
          id INTEGER PRIMARY KEY,
          anon_id INTEGER NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          order_id INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
    }
  }
]

/**
 * F5: 旧模型画师迁移 —— art_styles 为零的画师建「默认」画风，visible 档位转尺寸
 *
 * 逐画师幂等：已有 art_styles 的画师跳过；重复执行不产生重复数据。
 * v36 全局守卫（任一画师有 art_styles 即跳过全体）会漏掉后建画师（如生产库 carol），
 * 此处用逐画师 NOT EXISTS 守卫补齐。
 * 只搬 visible 档位的 name/price/sort_order；图/描述/天数不搬（画师重写）。
 * 导出供测试直接调用。
 */
export function migrateF5OldModelArtists(database) {
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
  `).all()

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
    `).all(artist.id)
    for (const tier of tiers) {
      insertSize.run(styleId, tier.name, tier.price, tier.sort_order ?? 0)
    }
    console.log(`📦 迁移 F5: 画师 ${artist.id} 建「默认」画风 + ${tiers.length} 尺寸（showcase/hidden 已丢弃）`)
  }
}

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
    ).get()
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
