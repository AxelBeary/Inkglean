import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { preTargetDb, isApplied } from './migration-real-entry.js'

// v68: 留言功能画师手动开关（820-L）——artists.guestbook_enabled（1=开启默认，0=关闭）
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，现改走
// `preTargetDb(68, revertToV67)`：v68 是 noTransaction（备份要 VACUUM INTO，事务内不可用），
// 只有走 initDatabase 才验证得到「调度器先 COMMIT 释放锁 → 事务外执行 → 重新抢锁」这条路。
// 断言未削弱。
describe('迁移 v68: artists_guestbook_enabled', () => {
  it('TC-MV68-01: v68 已应用且列存在（默认 1=开启）', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 68'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(68)

    const cols = db.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>
    const col = cols.find(c => c.name === 'guestbook_enabled')!
    expect(col).toBeDefined()
    expect(col.type).toBe('INTEGER')
    expect(col.notnull).toBe(1)
    expect(col.dflt_value).toBe('1')
  })

  it('TC-MV68-02: noTransaction 必须为 true（备份 VACUUM INTO 在事务内不可用）', () => {
    // 生产首部署实测过：事务内 wal_checkpoint 报 database table is locked。
    // 这条把「必须事务外」钉死在迁移声明上——调度器据此走 COMMIT → up() → BEGIN IMMEDIATE 路径
    const v68 = MIGRATIONS.find(m => m.version === 68)!
    expect(v68.noTransaction).toBe(true)
  })

  it('TC-MV68-03: 幂等——重跑 initDatabase 不抛错且结构不变', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>
    expect(cols.filter(c => c.name === 'guestbook_enabled')).toHaveLength(1)
  })
})

// 旧库升级语义：v67 形态（无 guestbook_enabled）→ 由 initDatabase 调度器真实跑到 v68
describe('迁移 v68 旧库升级', () => {
  /** 把基线库手术回 v68 前夜（v67 形态）：去掉 guestbook_enabled 列 + 留一位存量画师 */
  function revertToV67(database: Database.Database): void {
    database.exec('ALTER TABLE artists DROP COLUMN guestbook_enabled')
    // 前置自检：夹具确实退回了 v67 形态，否则后续断言是假绿
    const cols = (database.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>).map(c => c.name)
    if (cols.includes('guestbook_enabled')) {
      throw new Error('夹具未退回 v67 形态：artists.guestbook_enabled 仍然存在')
    }
    database.exec("INSERT INTO artists (qq_number, name, subdomain) VALUES ('998802', '老画师', 'legacy-artist')")
  }

  it('TC-MV68-04: 老库加列后旧行默认开启，历史数据不丢', () => {
    const mem = preTargetDb(68, revertToV67)
    try {
      expect(isApplied(mem, 68), 'v68 版本行应由 initDatabase 调度器写入').toBe(true)
      const cols = mem.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>
      expect(cols.some(c => c.name === 'guestbook_enabled')).toBe(true)
      const row = mem.prepare('SELECT * FROM artists WHERE subdomain = ?').get('legacy-artist') as { guestbook_enabled: number; name: string }
      expect(row.guestbook_enabled).toBe(1)
      expect(row.name).toBe('老画师')
    } finally {
      mem.close()
    }
  })

  it('TC-MV68-06: 迁移后新画师默认开启（不显式传 guestbook_enabled）', () => {
    const mem = preTargetDb(68, revertToV67)
    try {
      const row = mem.prepare(`
        INSERT INTO artists (qq_number, name, subdomain)
        VALUES ('998803', '新画师', 'v68-new')
        RETURNING guestbook_enabled
      `).get() as { guestbook_enabled: number }
      expect(row.guestbook_enabled).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-MV68-05: 幂等守卫——已是新形态时重跑跳过且不报错', () => {
    const mem = preTargetDb(68, revertToV67)
    try {
      expect(() => initDatabase(mem)).not.toThrow()
      const cols = mem.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>
      expect(cols.filter(c => c.name === 'guestbook_enabled')).toHaveLength(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM artists').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })
})
