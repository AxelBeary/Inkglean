import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { migration } from '../src/db/migrations/v76-content-takedown.js'

// ============================================
// v76: 内容级下架（P4 后端批）
//   artists.home_takedown_at / home_takedown_reason
//   artworks.takedown_at / takedown_reason
// 四列均为可空 TEXT、无默认值（照 v68 三件套范式：已应用 / 列结构 / 幂等 / 老库升级）
// ============================================

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null }

const V76_ARTIST_COLS = ['home_takedown_at', 'home_takedown_reason']
const V76_ARTWORK_COLS = ['takedown_at', 'takedown_reason']

describe('迁移 v76: content_takedown', () => {
  it('TC-MV76-01: v76 已应用（schema_migrations 有版本 76）', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 76'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(76)
  })

  it('TC-MV76-02: artists 两列存在——TEXT / 可空 / 无默认', () => {
    const cols = db.prepare('PRAGMA table_info(artists)').all() as ColInfo[]
    for (const name of V76_ARTIST_COLS) {
      const col = cols.find(c => c.name === name)
      expect(col, `artists.${name} 应存在`).toBeDefined()
      expect(col!.type).toBe('TEXT')
      expect(col!.notnull).toBe(0)
      expect(col!.dflt_value).toBeNull()
    }
  })

  it('TC-MV76-03: artworks 两列存在——TEXT / 可空 / 无默认', () => {
    const cols = db.prepare('PRAGMA table_info(artworks)').all() as ColInfo[]
    for (const name of V76_ARTWORK_COLS) {
      const col = cols.find(c => c.name === name)
      expect(col, `artworks.${name} 应存在`).toBeDefined()
      expect(col!.type).toBe('TEXT')
      expect(col!.notnull).toBe(0)
      expect(col!.dflt_value).toBeNull()
    }
  })

  it('TC-MV76-04: 幂等——重跑 initDatabase 不抛错且列不重复', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const artistCols = db.prepare('PRAGMA table_info(artists)').all() as ColInfo[]
    const artworkCols = db.prepare('PRAGMA table_info(artworks)').all() as ColInfo[]
    for (const name of V76_ARTIST_COLS) {
      expect(artistCols.filter(c => c.name === name)).toHaveLength(1)
    }
    for (const name of V76_ARTWORK_COLS) {
      expect(artworkCols.filter(c => c.name === name)).toHaveLength(1)
    }
  })
})

// 老库升级语义：手搓 v75 形态（artists/artworks 均无 v76 新列）+ 塞存量行 → 跑 up()
describe('迁移 v76 老库升级', () => {
  function buildOldDb() {
    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE artists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qq_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        subdomain TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'open',
        is_banned INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    mem.exec(`
      CREATE TABLE artworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_id INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        title TEXT,
        like_count INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0
      )
    `)
    mem.exec(`
      INSERT INTO artists (qq_number, name, subdomain, status) VALUES ('90001', '老画师', 'legacy-artist', 'open');
      INSERT INTO artworks (artist_id, image_path, title, like_count, sort_order) VALUES (1, 'images/1/old.webp', '老作品', 7, 1);
    `)
    return mem
  }

  it('TC-MV76-05: 老库四列加出、存量行不丢、新列读为 NULL', () => {
    const mem = buildOldDb()
    expect(() => migration.up(mem)).not.toThrow()

    const artistCols = mem.prepare('PRAGMA table_info(artists)').all() as ColInfo[]
    const artworkCols = mem.prepare('PRAGMA table_info(artworks)').all() as ColInfo[]
    for (const name of V76_ARTIST_COLS) {
      expect(artistCols.some(c => c.name === name), `artists.${name}`).toBe(true)
    }
    for (const name of V76_ARTWORK_COLS) {
      expect(artworkCols.some(c => c.name === name), `artworks.${name}`).toBe(true)
    }

    // 存量行不丢，且新列默认 NULL（老数据本就未下架）
    const artist = mem.prepare('SELECT * FROM artists WHERE subdomain = ?').get('legacy-artist') as
      { name: string; home_takedown_at: string | null; home_takedown_reason: string | null }
    expect(artist.name).toBe('老画师')
    expect(artist.home_takedown_at).toBeNull()
    expect(artist.home_takedown_reason).toBeNull()

    const artwork = mem.prepare('SELECT * FROM artworks WHERE id = ?').get(1) as
      { title: string; like_count: number; takedown_at: string | null; takedown_reason: string | null }
    expect(artwork.title).toBe('老作品')
    expect(artwork.like_count).toBe(7)
    expect(artwork.takedown_at).toBeNull()
    expect(artwork.takedown_reason).toBeNull()
    mem.close()
  })

  it('TC-MV76-06: 幂等守卫——已是新形态时重跑跳过且存量行不受影响', () => {
    const mem = buildOldDb()
    migration.up(mem)
    expect(() => migration.up(mem)).not.toThrow()

    const artistCols = mem.prepare('PRAGMA table_info(artists)').all() as ColInfo[]
    const artworkCols = mem.prepare('PRAGMA table_info(artworks)').all() as ColInfo[]
    expect(artistCols.filter(c => c.name === 'home_takedown_at')).toHaveLength(1)
    expect(artworkCols.filter(c => c.name === 'takedown_at')).toHaveLength(1)
    // 重跑不复制、不销毁存量行
    expect((mem.prepare('SELECT COUNT(*) AS n FROM artists').get() as { n: number }).n).toBe(1)
    expect((mem.prepare('SELECT COUNT(*) AS n FROM artworks').get() as { n: number }).n).toBe(1)
    mem.close()
  })
})
