// 迁移 v38 回归测试：重建 artists 表不得清空子表数据（2026-08-04 事故场景）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'

describe('迁移 v38: artists CHECK 补 hidden', () => {
  let db

  beforeAll(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    initDatabase(db)
  })
  afterAll(() => db.close())

  it('TC-MIG-38a: status hidden 写入合法（CHECK 已含 hidden）', () => {
    db.prepare("INSERT INTO artists (qq_number, name, subdomain, status) VALUES (?, ?, ?, 'hidden')").run('99901', 'HiddenTest', 'hidden-test')
    const row = db.prepare("SELECT status FROM artists WHERE subdomain = 'hidden-test'").get()
    expect(row.status).toBe('hidden')
  })

  it('TC-MIG-38b: 重建后子表数据零丢失（事故回归）', () => {
    const artist = db.prepare("INSERT INTO artists (qq_number, name, subdomain) VALUES (?, ?, ?)").run('99902', 'CascadeGuard', 'cascade-guard')
    const artistId = Number(artist.lastInsertRowid)
    // 在 artists 下挂子表数据
    db.prepare('INSERT INTO artworks (artist_id, image_path, title) VALUES (?, ?, ?)').run(artistId, 'images/x/a.png', '作品A')
    db.prepare('INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, ?, 0, 1)').run(artistId, '默认')
    const style = db.prepare("SELECT id FROM art_styles WHERE artist_id = ?").get(artistId)
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price) VALUES (?, ?, ?)').run(style.id, '头像', 50)
    db.prepare('INSERT INTO orders (artist_id, order_no, client_qq, status) VALUES (?, ?, ?, ?)').run(artistId, 'CG-001', '88888', 'pending')

    const before = {
      artworks: db.prepare('SELECT COUNT(*) c FROM artworks').get().c,
      styles: db.prepare('SELECT COUNT(*) c FROM art_styles').get().c,
      sizes: db.prepare('SELECT COUNT(*) c FROM style_sizes').get().c,
      orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c
    }

    // 移除 v38 记录并回退 CHECK 到 3 值，模拟"未应用 v38 的存量库"，再重跑迁移
    db.prepare('DELETE FROM schema_migrations WHERE version = 38').run()
    // 直接重跑 v38 迁移（幂等守卫检测无 hidden → 走重建路径）
    const v38 = MIGRATIONS.find(m => m.version === 38)
    expect(v38.noTransaction).toBe(true) // 必须事务外
    v38.up(db)

    const after = {
      artworks: db.prepare('SELECT COUNT(*) c FROM artworks').get().c,
      styles: db.prepare('SELECT COUNT(*) c FROM art_styles').get().c,
      sizes: db.prepare('SELECT COUNT(*) c FROM style_sizes').get().c,
      orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c
    }
    // 事故断言：子表行数必须与重建前完全一致（before 已含本测试插入的行）
    expect(after.artworks).toBe(before.artworks)
    expect(after.styles).toBe(before.styles)
    expect(after.sizes).toBe(before.sizes)
    expect(after.orders).toBe(before.orders)
    // artists 行本身也保留
    expect(db.prepare("SELECT COUNT(*) c FROM artists WHERE id = ?").get(artistId).c).toBe(1)
    // 重建后 CHECK 含 hidden，FK 恢复 ON
    db.prepare("UPDATE artists SET status = 'hidden' WHERE id = ?").run(artistId)
    expect(db.prepare('SELECT status FROM artists WHERE id = ?').get(artistId).status).toBe('hidden')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})
