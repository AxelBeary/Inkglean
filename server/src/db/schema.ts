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
  -- REQ-042（v59）: 封禁独立态——1=封禁（主页下架+登录拒绝），不动 status 三态
  is_banned INTEGER NOT NULL DEFAULT 0,
  deleted_at DATETIME,
  weibo_url TEXT,
  bilibili_url TEXT,
  notify_enabled INTEGER DEFAULT 1,
  -- 820-L（v68）: 留言功能画师手动开关——1=开启（默认）0=关闭（客户主页隐藏留言板块+暂停接收）
  guestbook_enabled INTEGER NOT NULL DEFAULT 1,
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
  -- REQ-043（v60）: 开张任务卡后端标记——自然达成/画师主动「不再提示」都写这里，前端不靠 localStorage
  onboarded_at TEXT NULL,
  onboarding_dismissed_at TEXT NULL,
  -- 视觉批备料（v61）: 登录时间/问候展示时间/仪表盘模块显隐（NULL=全部模块显示）
  last_login_at TEXT,
  -- 登录留痕批（v72）: 上次登录来源 IP（仅管理后台可见，DTO 默认剔除）
  last_login_ip TEXT,
  last_greeting_shown_at TEXT,
  dashboard_modules TEXT DEFAULT NULL,
  -- 自定义首页批一（v70）: 仪表盘布局偏好 JSON（schema v1；NULL=默认布局；吞并 dashboard_modules）
  dashboard_prefs TEXT DEFAULT NULL,
  -- oimimo 吸纳批一（v69）: 日历订阅（ICS）开关与私密令牌——令牌即凭证，可旋转
  calendar_feed_enabled INTEGER NOT NULL DEFAULT 0,
  calendar_feed_token TEXT DEFAULT NULL,
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

-- 问候特别日表（v64；date_key 形如 'MM-DD' 年重复，artist_id NULL=全平台）
CREATE TABLE IF NOT EXISTS greeting_special_days (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  date_key   TEXT NOT NULL CHECK(date_key GLOB '[0-1][0-9]-[0-3][0-9]'),
  artist_id  INTEGER,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 问候语模板表（v6；v67 重建后基线：7 档时段 CHECK（early/morning/noon/afternoon/evening/midnight/any）+ special_day_id 列与外键）
CREATE TABLE IF NOT EXISTS greeting_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER,
  text TEXT NOT NULL,
  time_slot TEXT NOT NULL DEFAULT 'any'
             CHECK(time_slot IN ('early','morning','noon','afternoon','evening','midnight','any')),
  is_enabled INTEGER NOT NULL DEFAULT 1,
  special_day_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
  FOREIGN KEY (special_day_id) REFERENCES greeting_special_days(id) ON DELETE CASCADE
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

-- 举报表（REQ-042 v59：先发后审——匿名可提交，管理员处理）
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK(target_type IN ('artist_home', 'artwork', 'message', 'other')),
  target_id INTEGER NULL,
  description TEXT NOT NULL,
  contact TEXT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
  resolved_by INTEGER NULL,
  resolved_at TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 管理动作留痕表（REQ-042 v59：下架/封禁/举报处理全部登记）
CREATE TABLE IF NOT EXISTS admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER NULL,
  reason TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
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
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target_type, target_id);
`
