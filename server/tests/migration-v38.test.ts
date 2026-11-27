// 迁移 v38 回归测试：重建 artists 表不得清空子表数据（2026-08-04 事故场景）
//
// 【真实入口改造 · issue #117 判据】TC-MIG-38b 原构建走 schema 的 DDL 再手工回退 CHECK、
// 删版本行后直调 `v38.up(db)`。现改走 `preTargetDb(38, revertToV37)`：以 schema 基线起库 →
// 把 artists 的 CHECK 手术回 3 值（模拟未应用 v38 的存量库）+ 挂好子表数据 → 预置除 v38 外
// 全部版本行 → 调度器自己跑到 v38（noTransaction 走事务外重建）。断言逐条对应，未削弱。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'
import { preTargetDb, isApplied } from './migration-real-entry.js'

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

  /**
   * 把基线库手术回 v38 前夜（v37 形态）：artists 的 CHECK 回退到 3 值 open/full/break。
   *
   * 做法与事故复现一致——SQLite 不能 ALTER CHECK，只能重建 artists：
   * FK=OFF 下建 artists_legacy（3 值 CHECK）→ 搬数据 → DROP → RENAME。
   * 子表数据在 revert 里挂好，正是要验「重建父表不清空子表」。
   */
  function revertToV37(d: Database.Database): void {
    const artistsSql = (d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'").get() as { sql: string }).sql
    // v38 守卫是 tableSql.sql.includes("'hidden'")，而 schema.ts 的 artists DDL 含注释
    // 「不复用 status='hidden'」——必须连该注释行一起剔除，守卫才会判定「未含 hidden」而走重建。
    const legacySql = artistsSql
      .replace(/CHECK\s*\(\s*status\s+IN\s*\([^)]*\)\s*\)/i, "CHECK(status IN ('open','full','break'))")
      .split('\n').filter(line => !line.includes("'hidden'")).join('\n')
    // 3 值 CHECK 下 hidden 行无法拷回，先临时降级；v38 重建恢复 4 值后再验证 hidden 可写
    d.exec("UPDATE artists SET status='open' WHERE status='hidden'")
    const cols = (d.prepare('PRAGMA table_info(artists)').all() as Array<{ name: string }>).map(c => c.name).join(', ')
    d.pragma('foreign_keys = OFF')
    try {
      d.exec(legacySql.replace(/^CREATE TABLE\s+"?artists"?(\s|\()/i, 'CREATE TABLE artists_legacy$1'))
      d.exec(`INSERT INTO artists_legacy (${cols}) SELECT ${cols} FROM artists`)
      d.exec('DROP TABLE artists')
      d.exec('ALTER TABLE artists_legacy RENAME TO artists')
    } finally {
      d.pragma('foreign_keys = ON')
    }
    // 用与 v38 守卫完全相同的口径确认：重建后的建表 SQL 不含 'hidden'（否则又会早退）
    const reverted = (d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='artists'").get() as { sql: string }).sql
    if (reverted.includes("'hidden'")) {
      throw new Error('夹具未退回 v37 形态：artists 建表 SQL 仍含 hidden')
    }
    // 在 artists 下挂子表数据（事故场景：重建父表时这些行必须零丢失）
    const artist = d.prepare("INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)").run('99902', 'CascadeGuard', 'cascade-guard')
    const artistId = Number(artist.lastInsertRowid)
    d.prepare('INSERT INTO artworks (artist_id, image_path, title) VALUES (?, ?, ?)').run(artistId, 'images/x/a.png', '作品A')
    d.prepare('INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, ?, 0, 1)').run(artistId, '默认')
    const style = d.prepare('SELECT id FROM art_styles WHERE artist_id = ?').get(artistId) as { id: number }
    d.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)').run(style.id, '头像', 50)
    d.prepare('INSERT INTO orders (artist_id, order_no, client_qq, status) VALUES (?, ?, ?, ?)').run(artistId, 'CG-001', '88888', 'pending')
    // 让 hidden 行也存在于存量库里（v38 重建后必须仍可写回）
    d.prepare("INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)").run('99903', 'HiddenLegacy', 'hidden-legacy')
  }

  it('TC-MIG-38b: 重建后子表数据零丢失（事故回归，真实入口）', () => {
    const v38 = MIGRATIONS.find(m => m.version === 38)!
    expect(v38.noTransaction).toBe(true) // 必须事务外

    const mem = preTargetDb(38, revertToV37)
    try {
      // 能走到这里 = 调度器在事务外跑完了 noTransaction 的 v38 重建
      expect(isApplied(mem, 38), 'v38 版本行应由调度器写入').toBe(true)

      const after = {
        artworks: (mem.prepare('SELECT COUNT(*) c FROM artworks').get() as { c: number }).c,
        styles: (mem.prepare('SELECT COUNT(*) c FROM art_styles').get() as { c: number }).c,
        sizes: (mem.prepare('SELECT COUNT(*) c FROM style_sizes').get() as { c: number }).c,
        orders: (mem.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c
      }
      // 事故断言：子表行数必须与重建前完全一致（revert 里各挂了 1 行）
      expect(after.artworks).toBe(1)
      expect(after.styles).toBe(1)
      expect(after.sizes).toBe(1)
      expect(after.orders).toBe(1)
      // artists 行本身也保留
      expect((mem.prepare("SELECT COUNT(*) c FROM artists WHERE subdomain = 'cascade-guard'").get() as { c: number }).c).toBe(1)
      // 重建后 CHECK 含 hidden，FK 恢复 ON
      const artistId = (mem.prepare("SELECT id FROM artists WHERE subdomain = 'cascade-guard'").get() as { id: number }).id
      mem.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artistId)
      expect((mem.prepare('SELECT status FROM artists WHERE id = ?').get(artistId) as { status: string }).status).toBe('hidden')
      expect(mem.pragma('foreign_keys', { simple: true })).toBe(1)
    } finally {
      mem.close()
    }
  })
})
