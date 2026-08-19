import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v68-artists-guestbook-enabled.js'

// v68: 留言功能画师手动开关（820-L）——artists.guestbook_enabled（1=开启默认，0=关闭）
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

  it('TC-MV68-03: 幂等——重跑 initDatabase 不抛错且结构不变', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>
    expect(cols.filter(c => c.name === 'guestbook_enabled')).toHaveLength(1)
  })
})

// 旧库升级语义：合成 v67 形态（无 guestbook_enabled）→ 跑 v68 → 列出现且旧行默认开启
describe('迁移 v68 旧库升级', () => {
  function buildOldDb() {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qq_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'open',
        notify_enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    mem.exec(`
      INSERT INTO artists (qq_number, name, subdomain) VALUES ('998802', '老画师', 'legacy-artist')
    `)
    return mem
  }

  it('TC-MV68-04: 老库加列后旧行默认开启，历史数据不丢', () => {
    const mem = buildOldDb()
    expect(() => migration.up(mem)).not.toThrow()
    const cols = mem.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>
    expect(cols.some(c => c.name === 'guestbook_enabled')).toBe(true)
    const row = mem.prepare('SELECT * FROM artists WHERE subdomain = ?').get('legacy-artist') as { guestbook_enabled: number; name: string }
    expect(row.guestbook_enabled).toBe(1)
    expect(row.name).toBe('老画师')
    mem.close()
  })

  it('TC-MV68-06: 迁移后新画师默认开启（不显式传 guestbook_enabled）', () => {
    const mem = buildOldDb()
    migration.up(mem)
    const row = mem.prepare(`
      INSERT INTO artists (qq_number, name, subdomain)
      VALUES ('998803', '新画师', 'v68-new')
      RETURNING guestbook_enabled
    `).get() as { guestbook_enabled: number }
    expect(row.guestbook_enabled).toBe(1)
    mem.close()
  })

  it('TC-MV68-05: 幂等守卫——已是新形态时重跑跳过且不报错', () => {
    const mem = buildOldDb()
    migration.up(mem)
    expect(() => migration.up(mem)).not.toThrow()
    const cols = mem.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>
    expect(cols.filter(c => c.name === 'guestbook_enabled')).toHaveLength(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM artists').get() as { n: number }).n).toBe(1)
    mem.close()
  })
})
