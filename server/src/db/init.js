import db from './connection.js'
import { fileURLToPath } from 'url'

// ============================================
// 数据库初始化 - 创建所有表 + 增量迁移
// ============================================

export const schema = `
-- 画师表
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qq_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  artist_code TEXT UNIQUE,
  avatar TEXT,
  bio TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'break')),
  weibo_url TEXT,
  bilibili_url TEXT,
  notify_enabled INTEGER DEFAULT 1,
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

-- 订单表
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
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 订单备注表
CREATE TABLE IF NOT EXISTS order_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT DEFAULT 'artist',
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

-- 登录码表（临时）
CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

-- 平台配置表
CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_orders_artist_status ON orders(artist_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_queue ON orders(artist_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_login_codes_expires ON login_codes(expires_at);
`

/**
 * 在给定数据库实例上执行建表 + 增量迁移
 */
export function initDatabase(database) {
  database.exec(schema)

  // ─── 迁移：artists 表增加 artist_code 列（兼容旧库） ───
  // 注意：SQLite ALTER TABLE ADD COLUMN 不支持 UNIQUE 约束，需单独建索引
  const columns = database.prepare('PRAGMA table_info(artists)').all()
  if (!columns.some(c => c.name === 'artist_code')) {
    database.exec('ALTER TABLE artists ADD COLUMN artist_code TEXT')
    // 回填：用子域名大写作为默认身份码
    database.exec("UPDATE artists SET artist_code = UPPER(subdomain) WHERE artist_code IS NULL")
    // 单独创建唯一索引
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_code ON artists(artist_code)')
  }

  // ─── 迁移：artists 表增加 contact_qq 列（客户可见的联系QQ） ───
  if (!columns.some(c => c.name === 'contact_qq')) {
    database.exec('ALTER TABLE artists ADD COLUMN contact_qq TEXT')
  }

  // ─── 确保平台配置有默认值 ───
  database.exec(`
    INSERT OR IGNORE INTO platform_config (key, value) VALUES ('admin_qq', '')
  `)
}

// CLI 直接执行时自动建表（import 时不触发副作用）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDatabase(db)
  console.log('✅ 数据库初始化完成')
}
