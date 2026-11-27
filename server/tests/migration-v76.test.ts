import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import Database from 'better-sqlite3'
import { preTargetDb, isApplied } from './migration-real-entry.js'

// ============================================
// v76: 内容级下架（P4 后端批）
//   artists.home_takedown_at / home_takedown_reason
//   artworks.takedown_at / takedown_reason
// 四列均为可空 TEXT、无默认值（照 v68 三件套范式：已应用 / 列结构 / 幂等 / 老库升级）
//
// 【真实入口改造 · issue #117 判据】原用例直调 `migration.up(mem)`，现改走
// `preTargetDb(76, revertToV75)`：以 schema 基线起库、手术回 v75 形态（四列不存在）
// + 存量行，预置除 v76 外全部版本行，由 initDatabase 调度器自己跑到 v76。断言未削弱。
// ============================================

type ColInfo = { name: string; type: string; notnull: number; dflt_value: string | null }

const V76_ARTIST_COLS = ['home_takedown_at', 'home_takedown_reason']
const V76_ARTWORK_COLS = ['takedown_at', 'takedown_reason']

/** 把基线库手术回 v76 前夜（v75 形态）：去掉四列 + 留一条存量画师/作品 */
function revertToV75(database: Database.Database): void {
  for (const name of V76_ARTIST_COLS) database.exec(`ALTER TABLE artists DROP COLUMN ${name}`)
  for (const name of V76_ARTWORK_COLS) database.exec(`ALTER TABLE artworks DROP COLUMN ${name}`)
  // 前置自检：夹具确实退回了 v75 形态，否则后续断言是假绿
  const artistCols = (database.prepare('PRAGMA table_info(artists)').all() as ColInfo[]).map(c => c.name)
  const artworkCols = (database.prepare('PRAGMA table_info(artworks)').all() as ColInfo[]).map(c => c.name)
  for (const name of V76_ARTIST_COLS) {
    if (artistCols.includes(name)) throw new Error(`夹具未退回 v75 形态：artists.${name} 仍然存在`)
  }
  for (const name of V76_ARTWORK_COLS) {
    if (artworkCols.includes(name)) throw new Error(`夹具未退回 v75 形态：artworks.${name} 仍然存在`)
  }
  database.exec(`
    INSERT INTO artists (qq_number, name, subdomain, status) VALUES ('90001', '老画师', 'legacy-artist', 'open');
    INSERT INTO artworks (artist_id, image_path, title, like_count, sort_order)
      VALUES (1, 'images/1/old.webp', '老作品', 7, 1);
  `)
}

function buildAndMigrate(): Database.Database {
  return preTargetDb(76, revertToV75)
}

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

// 老库升级语义：由 initDatabase 调度器在 v75 形态库上真实跑到 v76
describe('迁移 v76 老库升级', () => {
  it('TC-MV76-05: 老库四列加出、存量行不丢、新列读为 NULL', () => {
    const mem = buildAndMigrate()
    try {
      expect(isApplied(mem, 76), 'v76 版本行应由 initDatabase 调度器写入').toBe(true)

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
    } finally {
      mem.close()
    }
  })

  it('TC-MV76-06: 幂等守卫——已是新形态时重跑跳过且存量行不受影响', () => {
    const mem = buildAndMigrate()
    try {
      expect(() => initDatabase(mem)).not.toThrow()

      const artistCols = mem.prepare('PRAGMA table_info(artists)').all() as ColInfo[]
      const artworkCols = mem.prepare('PRAGMA table_info(artworks)').all() as ColInfo[]
      expect(artistCols.filter(c => c.name === 'home_takedown_at')).toHaveLength(1)
      expect(artworkCols.filter(c => c.name === 'takedown_at')).toHaveLength(1)
      // 重跑不复制、不销毁存量行
      expect((mem.prepare('SELECT COUNT(*) AS n FROM artists').get() as { n: number }).n).toBe(1)
      expect((mem.prepare('SELECT COUNT(*) AS n FROM artworks').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })
})
