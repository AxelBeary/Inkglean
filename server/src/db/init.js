import db from './connection.js'
import { fileURLToPath } from 'url'

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
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'full', 'break')),
  contact_qq TEXT,
  token_version INTEGER DEFAULT 1,
  deleted_at DATETIME,
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

-- 版本化迁移跟踪表
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_price_tiers_artist ON price_tiers(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_qq ON artists(qq_number);
`

/**
 * 版本化迁移列表
 * 每个迁移有唯一 version 号，按顺序执行，已执行的自动跳过
 */
const MIGRATIONS = [
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
    migration.up(database)
    database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
      .run(migration.version, migration.name)
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
