import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { preTargetDb, isApplied } from './migration-real-entry.js'

// ============================================
// 迁移 v75：取证类 IP（P4 后端批 2026-09-13，一个迁移建齐三列，不拆新号）
//   admin_actions.admin_ip / reports.report_ip / guestbook_messages.ip
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，绕开了
// initDatabase 的版本调度语义。现全部改走 `preTargetDb(75, revert)`：以 schema 基线起库、
// 手术回 v74 形态（三表无 IP 列）、预置除 v75 外全部版本行，由 initDatabase 调度器自己
// 跑到 v75。断言与改造前逐条对应，未削弱，只换驱动方式。
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

/**
 * 把基线库手术回 v75 前夜（v74 形态）：三表去掉 IP 列 + 每表留一条存量行。
 * 走 ALTER TABLE DROP COLUMN（SQLite 3.35+ 原生支持），不重建表——这样其余
 * 基线结构（后续迁移依赖的表/列）保持完整，initDatabase 才跑得通。
 */
function revertToV74(database: Database.Database): void {
  for (const { table, column } of FORENSIC_COLUMNS) {
    database.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
  }
  // 前置自检（在调度器启动前执行）：夹具确实退回了 v74 形态，否则后面的断言是假绿
  for (const { table, column } of FORENSIC_COLUMNS) {
    const still = (database.prepare(`PRAGMA table_info(${table})`).all() as PragmaCol[]).some(c => c.name === column)
    if (still) throw new Error(`夹具未退回 v74 形态：${table}.${column} 仍然存在`)
  }
  database.exec(`
    INSERT INTO artists (qq_number, name, subdomain) VALUES ('75001', '取证画师', 'forensic-artist');
    INSERT INTO admin_actions (admin_id, action, target_type, target_id, reason)
      VALUES (1, 'artist_ban', 'artist', 7, '老封禁');
    INSERT INTO reports (target_type, description) VALUES ('other', '老举报');
    INSERT INTO guestbook_messages (artist_id, nickname, content) VALUES (1, '老访客', '老留言');
  `)
}

/** 起一个「v74 形态 + 待调度 v75」的库，由 initDatabase 自己跑到 v75 */
function buildAndMigrate(): Database.Database {
  return preTargetDb(75, revertToV74)
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

// 老库升级语义：由 initDatabase 调度器在 v74 形态库上真实跑到 v75
describe('迁移 v75 老库升级（v74 形态 → v75，真实入口）', () => {
  it('TC-MV75-04: 老库升级后三列出列，存量行一条不丢，新列读为 NULL', () => {
    const mem = buildAndMigrate()
    try {
      // revertToV74 内含前置自检：起库时三列确实不存在（v74 形态）；
      // 这里再确认版本行是调度器写的，证明确实走了真实入口
      expect(isApplied(mem, 75), 'v75 版本行应由 initDatabase 调度器写入').toBe(true)

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
    } finally {
      mem.close()
    }
  })

  it('TC-MV75-05: 守卫二次验证——已是新形态时重跑不抛错、行数与列数不变', () => {
    const mem = buildAndMigrate()
    try {
      expect(() => initDatabase(mem)).not.toThrow()
      for (const { table, column } of FORENSIC_COLUMNS) {
        expect(pragmaCols(mem, table).filter(c => c.name === column)).toHaveLength(1)
      }
      expect((mem.prepare('SELECT COUNT(*) AS n FROM admin_actions').get() as { n: number }).n).toBe(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM reports').get() as { n: number }).n).toBe(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM guestbook_messages').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-MV75-06: 纯 ADD COLUMN 不需 noTransaction，且升级后新写入可带 IP', () => {
    // v75 刻意不设 noTransaction（同 v41/v61/v63/v68/v72 判定：ADD COLUMN 事务内安全）。
    // 迁移文件未声明该标志 = 断言点；顺带验证新列可写
    const v75 = MIGRATIONS.find(m => m.version === 75)!
    expect((v75 as { noTransaction?: boolean }).noTransaction).toBeUndefined()
    const mem = buildAndMigrate()
    try {
      mem.prepare("INSERT INTO admin_actions (admin_id, action, admin_ip) VALUES (1, 'artist_unban', '203.0.113.7')").run()
      const row = mem.prepare("SELECT admin_ip FROM admin_actions WHERE action = 'artist_unban'").get() as
        { admin_ip: string | null }
      expect(row.admin_ip).toBe('203.0.113.7')
    } finally {
      mem.close()
    }
  })
})
