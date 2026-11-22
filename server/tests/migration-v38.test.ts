// 迁移 v38 回归测试：重建 artists 表不得清空子表数据（2026-08-04 事故场景）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'

describe('迁移 v38: artists CHECK 补 hidden', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initDatabase(db)
  })
  afterAll(() => db.close())

  it('TC-MIG-38a: status hidden 写入合法（CHECK 已含 hidden）', () => {
    db.prepare("INSERT INTO artists (qq_number, name, subdomain, status) VALUES (?, ?, ?, 'hidden')").run('99901', 'HiddenTest', 'hidden-test')
    const row = db.prepare("SELECT status FROM artists WHERE subdomain = 'hidden-test'").get() as { status: string }
    expect(row.status).toBe('hidden')
  })

  it('TC-MIG-38b: 重建后子表数据零丢失（事故回归）', () => {
    const artist = db.prepare("INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)").run('99902', 'CascadeGuard', 'cascade-guard')
    const artistId = Number(artist.lastInsertRowid)
    // 在 artists 下挂子表数据
    db.prepare('INSERT INTO artworks (artist_id, image_path, title) VALUES (?, ?, ?)').run(artistId, 'images/x/a.png', '作品A')
    db.prepare('INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, ?, 0, 1)').run(artistId, '默认')
    const style = db.prepare("SELECT id FROM art_styles WHERE artist_id = ?").get(artistId) as { id: number }
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)').run(style.id, '头像', 50)
    db.prepare('INSERT INTO orders (artist_id, order_no, client_qq, status) VALUES (?, ?, ?, ?)').run(artistId, 'CG-001', '88888', 'pending')

    const before = {
      artworks: (db.prepare('SELECT COUNT(*) c FROM artworks').get() as { c: number }).c,
      styles: (db.prepare('SELECT COUNT(*) c FROM art_styles').get() as { c: number }).c,
      sizes: (db.prepare('SELECT COUNT(*) c FROM style_sizes').get() as { c: number }).c,
      orders: (db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    }

    // F0083: 原测试只删迁移记录，但 artists 表仍是 initDatabase 建的 4 值 CHECK（含 hidden），
    // v38 幂等守卫命中 hidden 直接早退——最危险的重建路径从未被覆盖。此处真正把 CHECK
    // 回退到 3 值形态（模拟未应用 v38 的存量库），确保守卫不命中，强制走重建分支。
    const artistsSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'").get() as { sql: string }).sql
    // v38 守卫是 tableSql.sql.includes("'hidden'")，而 schema.ts 的 artists DDL 含注释
    // 「不复用 status='hidden'」——必须连该注释行一起剔除，守卫才会判定「未含 hidden」而走重建。
    const legacySql = artistsSql
      .replace(/CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i, "CHECK(status IN ('open','full','break'))")
      .split('\n').filter(line => !line.includes("'hidden'")).join('\n')
    // 3 值 CHECK 下 hidden 行无法拷回，先临时降级；v38 重建恢复 4 值后再验证 hidden 可写
    db.exec("UPDATE artists SET status='open' WHERE status='hidden'")
    const cols = (db.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>).map(c => c.name).join(', ')
    db.pragma('foreign_keys = OFF')
    try {
      db.exec(legacySql.replace(/^CREATE TABLE\s+"?artists"?(\s|\()/i, 'CREATE TABLE artists_legacy$1'))
      db.exec(`INSERT INTO artists_legacy (${cols}) SELECT ${cols} FROM artists`)
      db.exec('DROP TABLE artists')
      db.exec('ALTER TABLE artists_legacy RENAME TO artists')
    } finally {
      db.pragma('foreign_keys = ON')
    }
    // 用与 v38 守卫完全相同的口径确认：重建后的建表 SQL 不含 'hidden'（否则又会早退）
    const reverted = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'").get() as { sql: string }).sql
    expect(reverted).not.toContain("'hidden'")

    db.prepare('DELETE FROM schema_migrations WHERE version = 38').run()
    // 重跑 v38：守卫检测无 hidden → 走真正的重建路径
    const v38 = MIGRATIONS.find(m => m.version === 38)!
    expect(v38.noTransaction).toBe(true) // 必须事务外
    v38.up(db)

    const after = {
      artworks: (db.prepare('SELECT COUNT(*) c FROM artworks').get() as { c: number }).c,
      styles: (db.prepare('SELECT COUNT(*) c FROM art_styles').get() as { c: number }).c,
      sizes: (db.prepare('SELECT COUNT(*) c FROM style_sizes').get() as { c: number }).c,
      orders: (db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
    }
    // 事故断言：子表行数必须与重建前完全一致（before 已含本测试插入的行）
    expect(after.artworks).toBe(before.artworks)
    expect(after.styles).toBe(before.styles)
    expect(after.sizes).toBe(before.sizes)
    expect(after.orders).toBe(before.orders)
    // artists 行本身也保留
    expect((db.prepare("SELECT COUNT(*) c FROM artists WHERE id = ?").get(artistId) as { c: number }).c).toBe(1)
    // 重建后 CHECK 含 hidden，FK 恢复 ON
    db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artistId)
    expect((db.prepare('SELECT status FROM artists WHERE id = ?').get(artistId) as { status: string }).status).toBe('hidden')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
