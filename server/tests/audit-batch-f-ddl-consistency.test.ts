import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, schema, schemaIndexes, MIGRATIONS } from '../src/db/init.js'

/**
 * 审计批 F-6（P3-19）: DDL 双事实源一致性
 *
 * 风险：init.js 的完整 schema 字符串与 v1~v54 迁移链双轨维护，新表/新列易漏改一侧。
 * 锁法：两个空内存库——
 *   A 走 initDatabase（完整 schema 初始化 = schema 字符串 + 全部迁移 + 索引，生产新装路径）
 *   B 走 v1 基线（引入版本化迁移前的历史建表 SQL，提取自 7b9141d initial release）+ 全部迁移
 * 比对两库的表清单 + 每表列清单（PRAGMA table_info）完全一致，不一致即失败并输出差异。
 *
 * R3-① CHECK 口径（2026-11-24）：PRAGMA table_info 不含 CHECK，本文件另加 CHECK 快照断言：
 *   - 新装库 A 与 v1 迁移链库 B（discount_codes 由当前 v32 DDL 首次建表）都必须带三条新增 CHECK；
 *   - 存量库（version=32 已应用、旧形 discount_codes）重启后保持无 CHECK 属 R3-① 裁定预期
 *     （migrate.ts 跳过 v32 + CREATE TABLE IF NOT EXISTS 不重建；不新增迁移号、不重建存量表）。
 *   两口径差异由 STATUS「已拍板规则」R3-① 条固化。
 *
 * 语义说明：
 * - 列按 name 排序比较（SQLite 不保证 ALTER 追加列与 schema 声明列的顺序一致，顺序差异不构成漂移）。
 * - B 额外手工建 schema_migrations / platform_config：真实老库升级时由 initDatabase 的
 *   schema exec 补齐这两张基础表（迁移链不创建、迁移假定存在），此处模拟该升级前置。
 * - 迁移 v49 种子对旧形表（pricing_mode/kind）跳过：旧形 CHECK 不含 percent，系统模板
 *   种子无法表达，由 v50 重建后新库基线供给（见 init.js v49 内 F-6 注释）。
 */

/** schema_migrations 行 */
interface MigrationVersionRow {
  version: number
}

/** sqlite_master 表名行 */
interface TableNameRow {
  name: string
}

/** PRAGMA table_info 行 */
interface TableInfoRow {
  name: string
  type: string
  notnull: number
  dflt_value: unknown
  pk: number
}

/** 列快照（比对用子集） */
interface ColumnSnapshot {
  name: string
  type: string
  notnull: number
  dflt_value: unknown
  pk: number
}

/** 库结构快照：表名 → 列清单 */
type SchemaSnapshot = Record<string, ColumnSnapshot[]>

/** B3-F0101: 外键清单行（PRAGMA foreign_key_list） */
interface FkRow {
  table: string
  from: string
  ref_table: string
  to: string
  on_delete: string
  on_update: string
}

/**
 * B3-F0101: 关键索引白名单（新装库 A 与老库升级路径 B 都必须具备）。
 * 只选具名索引，避开 sqlite_autoindex_N 编号（编号对列声明顺序敏感、ALTER 加列会漂移）；
 * 这些都是 DDL 双事实源不该漂移的查询侧索引，存在性断言即可抓住「新装库漏建索引」类真实 bug。
 */
const KEY_INDEXES: Array<{ table: string; index: string }> = [
  { table: 'invite_codes', index: 'idx_invite_codes_status' }, // v58
  { table: 'discount_codes', index: 'idx_discount_codes_artist' }, // v32
  { table: 'greeting_templates', index: 'idx_greeting_artist' }, // v06
  { table: 'greeting_templates', index: 'idx_greeting_templates_special_day' }, // v64 + schemaIndexes（F0101 修补）
  { table: 'preview_uploads', index: 'idx_preview_uploads_artist' }, // v82 + schemaIndexes
]

/**
 * R3-①: discount_codes 的三条新增 CHECK 原文（与 schema.ts / v32 双事实源同款）。
 * PRAGMA table_info 不含 CHECK，故从 sqlite_master.sql 取建表原文、压 whitespace 后子串断言。
 */
const DISCOUNT_CHECKS = [
  'CHECK(discount_value > 0)',
  'CHECK(max_uses IS NULL OR max_uses >= 0)',
  'CHECK(used_count >= 0)',
] as const

/** R3-①: 取表建表 SQL（归一化空白），缺表返回空串 */
function tableCreateSql(database: Database.Database, table: string): string {
  const row = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(table) as { sql: string } | undefined
  return (row?.sql ?? '').replace(/\s+/g, ' ')
}

/**
 * B3-F0101: 采集外键清单（表名 → 规范化 FK 元组排序数组）。
 * 子代理实测两库 FK 0 差异，可作全量断言；规范化忽略 rowid 顺序噪声。
 */
function snapshotForeignKeys(database: Database.Database): Record<string, string[]> {
  const tables = (database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as TableNameRow[]).map(r => r.name)
  const result: Record<string, string[]> = {}
  for (const table of tables) {
    const rows = database.prepare(`PRAGMA foreign_key_list(${JSON.stringify(table)})`).all() as FkRow[]
    result[table] = rows.map(r => `${r.table}|${r.from}|${r.ref_table}|${r.to}|${r.on_delete}|${r.on_update}`).sort()
  }
  return result
}

const V1_BASELINE_SQL = `
-- 画师表
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qq_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
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
`

/** 与 initDatabase 相同的迁移执行语义（noTransaction 事务外，其余包事务） */
function applyMigrationChain(database: Database.Database): void {
  const applied = new Set(
    (database.prepare('SELECT version FROM schema_migrations').all() as MigrationVersionRow[]).map(r => r.version)
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    if (migration.noTransaction) {
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
  }
  database.exec(schemaIndexes)
}

/** 表 → 列清单（PRAGMA table_info，按列名排序） */
function snapshotSchema(database: Database.Database): SchemaSnapshot {
  const tables = (database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as TableNameRow[]).map(r => r.name)
  const snapshot: SchemaSnapshot = {}
  for (const table of tables) {
    snapshot[table] = (database.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as TableInfoRow[])
      .map(col => ({
        name: col.name,
        type: col.type,
        notnull: col.notnull,
        dflt_value: col.dflt_value,
        pk: col.pk
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }
  return snapshot
}

/** 输出两库结构差异（仅测试/诊断用，不抛错） */
function diffSnapshots(a: SchemaSnapshot, b: SchemaSnapshot): string[] {
  const lines: string[] = []
  const tablesA = new Set(Object.keys(a))
  const tablesB = new Set(Object.keys(b))
  const onlyA = [...tablesA].filter(t => !tablesB.has(t))
  const onlyB = [...tablesB].filter(t => !tablesA.has(t))
  if (onlyA.length) lines.push(`仅 A（schema 初始化）有表: ${onlyA.join(', ')}`)
  if (onlyB.length) lines.push(`仅 B（v1 起步 + 迁移链）有表: ${onlyB.join(', ')}`)
  for (const table of [...tablesA].filter(t => tablesB.has(t))) {
    const colsA = new Map(a[table].map((c): [string, ColumnSnapshot] => [c.name, c]))
    const colsB = new Map(b[table].map((c): [string, ColumnSnapshot] => [c.name, c]))
    const onlyColsA = [...colsA.keys()].filter(k => !colsB.has(k))
    const onlyColsB = [...colsB.keys()].filter(k => !colsA.has(k))
    if (onlyColsA.length) lines.push(`${table}: 仅 A 有列 ${onlyColsA.join(', ')}`)
    if (onlyColsB.length) lines.push(`${table}: 仅 B 有列 ${onlyColsB.join(', ')}`)
    for (const name of [...colsA.keys()].filter(k => colsB.has(k))) {
      const ca = colsA.get(name)
      const cb = colsB.get(name)
      if (JSON.stringify(ca) !== JSON.stringify(cb)) {
        lines.push(`${table}.${name}: A=${JSON.stringify(ca)} B=${JSON.stringify(cb)}`)
      }
    }
  }
  return lines
}

describe('审计批 F-6: DDL 双事实源一致性（完整 schema vs v1 起步 + 迁移链）', () => {
  it('TC-F6-01: 两库表清单 + 每表列清单完全一致', () => {
    // A：完整 schema 初始化（生产新装路径）
    const dbA = new Database(':memory:')
    initDatabase(dbA)

    // B：v1 基线 + 全部迁移（老库升级路径）
    const dbB = new Database(':memory:')
    dbB.pragma('foreign_keys = ON')
    dbB.exec(V1_BASELINE_SQL)
    dbB.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
    dbB.exec('CREATE TABLE IF NOT EXISTS platform_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    expect(() => applyMigrationChain(dbB)).not.toThrow()

    const snapshotA = snapshotSchema(dbA)
    const snapshotB = snapshotSchema(dbB)

    const diffs = diffSnapshots(snapshotA, snapshotB)
    if (diffs.length > 0) {
      throw new Error('DDL 双事实源不一致：\n' + diffs.join('\n'))
    }
    expect(snapshotA).toEqual(snapshotB)

    dbA.close()
    dbB.close()
  })

  it('TC-F6-02: schema 字符串本身可独立建表（索引引用完整）', () => {
    const dbC = new Database(':memory:')
    expect(() => dbC.exec(schema)).not.toThrow()
    expect(() => dbC.exec(schemaIndexes)).not.toThrow()
    dbC.close()
  })

  // B3-F0101：把外键与关键索引纳入 DDL 双事实源校验（列快照之外的补充）。
  // 全量索引 toEqual 不可行：sqlite_autoindex_N 编号/创建顺序属噪声，且 artists.artist_code
  // 在两路径下分别为隐式 UNIQUE 与命名索引（功能等价、DDL 不同）——故采用
  // 「外键全量相等（实测 0 差异）+ 具名关键索引白名单存在性」组合，既抓真实漂移又不被噪声误伤。
  it('TC-B3-F0101-01: 两库外键清单完全一致（全量）', () => {
    const dbA = new Database(':memory:')
    initDatabase(dbA)
    const dbB = new Database(':memory:')
    dbB.pragma('foreign_keys = ON')
    dbB.exec(V1_BASELINE_SQL)
    dbB.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
    dbB.exec('CREATE TABLE IF NOT EXISTS platform_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    expect(() => applyMigrationChain(dbB)).not.toThrow()
    const fkA = snapshotForeignKeys(dbA)
    const fkB = snapshotForeignKeys(dbB)
    expect(fkA).toEqual(fkB)
    dbA.close()
    dbB.close()
  })

  it('TC-B3-F0101-02: 两库都具备关键索引（含 F0101 修补的 special_day_id 索引）', () => {
    for (const build of ['new', 'chain'] as const) {
      const database = new Database(':memory:')
      if (build === 'new') {
        initDatabase(database)
      } else {
        database.pragma('foreign_keys = ON')
        database.exec(V1_BASELINE_SQL)
        database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        database.exec('CREATE TABLE IF NOT EXISTS platform_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        applyMigrationChain(database)
      }
      for (const { table, index } of KEY_INDEXES) {
        const row = database.prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name=?"
        ).get(table, index)
        expect(row, `${build} 路径应含索引 ${table}.${index}`).toBeDefined()
      }
      database.close()
    }
  })

  // R3-① CHECK 口径固化：新装库 A 与 v1 迁移链库 B（当前 v32 DDL 首次建表）都必须带三条 CHECK。
  it('TC-R3-CHECK-01: 新装库与迁移链库 discount_codes 都带三条新增 CHECK', () => {
    for (const build of ['new', 'chain'] as const) {
      const database = new Database(':memory:')
      if (build === 'new') {
        initDatabase(database)
      } else {
        database.pragma('foreign_keys = ON')
        database.exec(V1_BASELINE_SQL)
        database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
        database.exec('CREATE TABLE IF NOT EXISTS platform_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        applyMigrationChain(database)
      }
      const sql = tableCreateSql(database, 'discount_codes')
      for (const check of DISCOUNT_CHECKS) {
        expect(sql, `${build} 路径 discount_codes 应含 ${check}`).toContain(check)
      }
      database.close()
    }
  })

  // R3-① 存量口径：version=32 已应用且旧形 discount_codes（无 CHECK）存在时，initDatabase 的
  // schema exec 是 IF NOT EXISTS、v32 被跳过 → CHECK 不会被补上。这是裁定后的预期而非缺陷。
  it('TC-R3-CHECK-02: 存量旧形库重启后 discount_codes 保持无 CHECK（裁定预期，不新增迁移号）', () => {
    const database = new Database(':memory:')
    database.exec(`
      CREATE TABLE discount_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        discount_type TEXT NOT NULL DEFAULT 'percent',
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
    // 模拟存量已应用 v32（及全部迁移），initDatabase 只 exec(schema) + 索引，不重放 v32
    database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)')
    for (let v = 1; v <= MIGRATIONS.length; v++) {
      database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(v, `v${v}`)
    }
    expect(() => initDatabase(database)).not.toThrow()
    const sql = tableCreateSql(database, 'discount_codes')
    for (const check of DISCOUNT_CHECKS) {
      expect(sql, `存量旧形库不应被补上 ${check}`).not.toContain(check)
    }
    // 关键：裁定生效——未新增迁移号来重建存量 discount_codes 表。
    // 迁移总数随 PR114 MINOR-2 的 v84（DROP 冗余 idx_invite_codes_code）从 83 增至 84。
    expect(MIGRATIONS.length).toBe(84)
    database.close()
  })
})
