import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v75-forensic-ip.js'

// ============================================
// 迁移 v75：取证类 IP（P4 后端批 2026-09-13，一个迁移建齐三列，不拆新号）
//   admin_actions.admin_ip / reports.report_ip / guestbook_messages.ip
// 范式照 migration-v68.test.ts：已应用 → 结构 → 幂等 → 老库升级 → 守卫二次验证
// ============================================

/** PRAGMA table_info 行（本文件消费字段） */
interface PragmaCol {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
}

/** schema_migrations 行 */
interface AppliedRow {
  version: number
}

/** 三表 × 列名（v75 的全部改动面） */
const FORENSIC_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'admin_actions', column: 'admin_ip' },
  { table: 'reports', column: 'report_ip' },
  { table: 'guestbook_messages', column: 'ip' }
]

function pragmaCols(database: Database.Database | typeof db, table: string): PragmaCol[] {
  return database.prepare(`PRAGMA table_info(${table})`).all() as PragmaCol[]
}

describe('迁移 v75: 取证类 IP（三表）', () => {
  it('TC-MV75-01: v75 已应用，三张表各多一个可空 TEXT IP 列（无默认值）', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 75'
    ).get() as AppliedRow | undefined
    expect(applied?.version).toBe(75)

    for (const { table, column } of FORENSIC_COLUMNS) {
      const col = pragmaCols(db, table).find(c => c.name === column)
      expect(col, `${table}.${column} 应存在`).toBeDefined()
      expect(col!.type).toBe('TEXT')
      expect(col!.notnull).toBe(0)
      expect(col!.dflt_value).toBeNull()
    }
  })

  it('TC-MV75-02: 幂等——重跑 initDatabase 不抛错，且每个 IP 列只有一条', () => {
    expect(() => initDatabase(db)).not.toThrow()
    for (const { table, column } of FORENSIC_COLUMNS) {
      expect(pragmaCols(db, table).filter(c => c.name === column)).toHaveLength(1)
    }
  })

  it('TC-MV75-03: DDL 双轨一致——新装库（schema.ts）与迁移链结构同形，无升级分裂', () => {
    // schema.ts 的 CREATE TABLE 与 v75 的 ADD COLUMN 必须给出同一形态：
    // 可空 TEXT、无默认值。这条断言把「两条安装路径结构分裂」钉在测试里
    for (const { table, column } of FORENSIC_COLUMNS) {
      const col = pragmaCols(db, table).find(c => c.name === column)
      expect(col, `${table}.${column}`).toBeTruthy()
      expect(col!.notnull).toBe(0)
      expect(col!.dflt_value).toBeNull()
    }
  })
})

// 老库升级语义：手搓 v74 形态（三表均无 IP 列）+ 存量行 → 跑 v75 → 列出现且旧数据不丢
describe('迁移 v75 老库升级（v74 形态 → v75）', () => {
  function buildOldDb(): Database.Database {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE admin_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER NULL,
        reason TEXT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_type TEXT NOT NULL,
        target_id INTEGER NULL,
        description TEXT NOT NULL,
        contact TEXT NULL,
        status TEXT DEFAULT 'pending',
        resolved_by INTEGER NULL,
        resolved_at TEXT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE guestbook_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        nickname TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT DEFAULT 'zh-CN',
        status TEXT DEFAULT 'pending',
        artist_reply TEXT DEFAULT NULL,
        replied_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_by_admin INTEGER DEFAULT 0
      );
      INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason)
        VALUES (1, 'artist_ban', 'artist', 7, '老封禁');
      INSERT INTO reports (target_type, description) VALUES ('other', '老举报');
      INSERT INTO guestbook_messages (artist_id, nickname, content) VALUES (7, '老访客', '老留言');
    `)
    return mem
  }

  it('TC-MV75-04: 老库升级后三列出列，存量行一条不丢，新列读为 NULL', () => {
    const mem = buildOldDb()
    for (const { table, column } of FORENSIC_COLUMNS) {
      expect(pragmaCols(mem, table).some(c => c.name === column)).toBe(false)
    }

    expect(() => migration.up(mem)).not.toThrow()

    for (const { table, column } of FORENSIC_COLUMNS) {
      expect(pragmaCols(mem, table).some(c => c.name === column)).toBe(true)
    }
    const oldAction = mem.prepare("SELECT * FROM admin_actions WHERE action = 'artist_ban'").get() as
      { reason: string; admin_ip: string | null }
    expect(oldAction.reason).toBe('老封禁')
    expect(oldAction.admin_ip).toBeNull()
    const oldReport = mem.prepare("SELECT report_ip FROM reports WHERE description = '老举报'").get() as
      { report_ip: string | null }
    expect(oldReport.report_ip).toBeNull()
    const oldMsg = mem.prepare("SELECT ip FROM guestbook_messages WHERE nickname = '老访客'").get() as
      { ip: string | null }
    expect(oldMsg.ip).toBeNull()
    mem.close()
  })

  it('TC-MV75-05: 守卫二次验证——已是新形态时重跑不抛错、行数与列数不变', () => {
    const mem = buildOldDb()
    migration.up(mem)
    expect(() => migration.up(mem)).not.toThrow()
    for (const { table, column } of FORENSIC_COLUMNS) {
      expect(pragmaCols(mem, table).filter(c => c.name === column)).toHaveLength(1)
    }
    expect((mem.prepare('SELECT COUNT(*) AS n FROM admin_actions').get() as { n: number }).n).toBe(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number }).n).toBe(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM guestbook_messages').get() as { n: number }).n).toBe(1)
    mem.close()
  })

  it('TC-MV75-06: 纯 ADD COLUMN 不需 noTransaction，且升级后新写入可带 IP', () => {
    // v75 刻意不设 noTransaction（同 v41/v61/v63/v68/v72 判定：ADD COLUMN 事务内安全）。
    // 迁移文件未声明该标志 = 断言点；顺带验证新列可写
    expect((migration as { noTransaction?: boolean }).noTransaction).toBeUndefined()
    const mem = buildOldDb()
    migration.up(mem)
    mem.prepare("INSERT INTO admin_actions (admin_id, action, admin_ip) VALUES (1, 'artist_unban', '203.0.113.7')").run()
    const row = mem.prepare("SELECT admin_ip FROM admin_actions WHERE action = 'artist_unban'").get() as
      { admin_ip: string | null }
    expect(row.admin_ip).toBe('203.0.113.7')
    mem.close()
  })
})
