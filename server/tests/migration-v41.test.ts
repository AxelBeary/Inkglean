// 迁移 v41 测试：REQ-027 TOTP 动态口令登录
// 1) artists 加 totp_secret/totp_verified/totp_failed_attempts/totp_locked_until 列（ADD COLUMN 事务内安全）
// 2) R7 一刀切：DROP login_codes（子表，不触发父表 CASCADE，对照 v38 教训）
//
// 【真实入口改造 · issue #117 判据】TC-MIG-41e 原直调 `v41.up(db)` 验幂等，
// 现改走 `replayVersion(db, 41)`：删掉版本行后由 initDatabase 调度器重跑该迁移。
// 其余用例本就由 initDatabase 建库，保持不变。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'
import { replayVersion } from './migration-real-entry.js'

describe('迁移 v41: totp_login（TOTP 动态口令）', () => {
  let db: Database.Database
  beforeAll(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initDatabase(db)
  })
  afterAll(() => db.close())

  function seedArtist(qq: string, subdomain: string) {
    const result = db.prepare('INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)').run(qq, 'TotpArtist', subdomain)
    return Number(result.lastInsertRowid)
  }

  it('TC-MIG-41a: MIGRATIONS 含 v41 且已应用', () => {
    const v41 = MIGRATIONS.find(m => m.version === 41)!
    expect(v41).toBeTruthy()
    expect(v41.name).toBe('totp_login')
    expect(v41.noTransaction).toBeFalsy() // ADD COLUMN + DROP 子表，事务内安全
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 41').get()
    expect(applied).toBeTruthy()
  })

  it('TC-MIG-41b: artists 四列就位且默认值正确', () => {
    const cols = db.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string; dflt_value: string | null }>
    const names = cols.map(c => c.name)
    expect(names).toContain('totp_secret')
    expect(names).toContain('totp_verified')
    expect(names).toContain('totp_failed_attempts')
    expect(names).toContain('totp_locked_until')
    const verified = cols.find(c => c.name === 'totp_verified')!
    expect(verified.dflt_value).toBe('0')
    const failed = cols.find(c => c.name === 'totp_failed_attempts')!
    expect(failed.dflt_value).toBe('0')
  })

  it('TC-MIG-41c: 新插入画师默认未绑定（存量兼容）', () => {
    const id = seedArtist('77111', 'totp-c')
    const row = db.prepare('SELECT totp_secret, totp_verified, totp_failed_attempts, totp_locked_until FROM artists WHERE id = ?').get(id) as { totp_secret: string | null; totp_verified: number; totp_failed_attempts: number; totp_locked_until: string | null }
    expect(row.totp_secret).toBeNull()
    expect(row.totp_verified).toBe(0)
    expect(row.totp_failed_attempts).toBe(0)
    expect(row.totp_locked_until).toBeNull()
  })

  it('TC-MIG-41d: login_codes 表已移除（R7 一刀切）', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_codes'").all() as Array<{ name: string }>
    expect(tables).toHaveLength(0)
  })

  it('TC-MIG-41e: 幂等守卫——重跑迁移不报错（真实入口：调度器重放 v41）', () => {
    // 列已存在 + 表已删除 → 守卫跳过；版本行由调度器重新写回，证明它真的跑了这一条
    expect(replayVersion(db, 41), 'v41 版本行应由调度器重放后写回').toBe(true)
    const cols = (db.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>)
      .filter(c => c.name === 'totp_secret')
    expect(cols).toHaveLength(1) // 不重复加列
    // 重放不得把 login_codes 复活
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_codes'").get()).toBeUndefined()
  })
})
