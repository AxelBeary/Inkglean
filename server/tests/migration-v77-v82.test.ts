import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { db } from './setup.js'
import { migration as v77 } from '../src/db/migrations/v77-reference-uploads-quota-columns.js'
import { migration as v80 } from '../src/db/migrations/v80-deliverable-download-fail-total.js'
import { migration as v81 } from '../src/db/migrations/v81-order-previews.js'
import { migration as v82 } from '../src/db/migrations/v82-preview-uploads.js'

/**
 * B3-F0101：v77/v80/v81/v82 专属迁移回归测试（此前这四条只有全量 initDatabase 覆盖，
 * 无专项测试）。每条验：版本已应用 + 结构落点 + 老库升级补齐 + 幂等重跑。
 */
const colNames = (database: Database.Database | typeof db, table: string): string[] =>
  (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name)
const tableExists = (database: Database.Database | typeof db, table: string): boolean => !!database.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
).get(table)
const applied = (version: number): boolean => !!db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version)

describe('B3-F0101: v77/v80/v81/v82 专属回归', () => {
  it('TC-F0101-v77-01: v77 已应用，reference_uploads 含 ip/file_size，老库升级+幂等', () => {
    expect(applied(77)).toBe(true)
    expect(colNames(db, 'reference_uploads')).toContain('ip')
    expect(colNames(db, 'reference_uploads')).toContain('file_size')

    const mem = new Database(':memory:')
    mem.exec(`CREATE TABLE reference_uploads (id INTEGER PRIMARY KEY, file_path TEXT NOT NULL, anon_id INTEGER);`)
    mem.exec(`INSERT INTO reference_uploads (file_path, anon_id) VALUES ('p1.png', 1)`)
    expect(() => v77.up(mem)).not.toThrow()
    expect(colNames(mem, 'reference_uploads')).toContain('ip')
    expect(colNames(mem, 'reference_uploads')).toContain('file_size')
    expect(() => v77.up(mem)).not.toThrow()
    expect((mem.prepare('SELECT COUNT(*) AS n FROM reference_uploads').get() as { n: number }).n).toBe(1)
    mem.close()
  })

  it('TC-F0101-v80-01: v80 已应用，deliverables 含 download_fail_total（NOT NULL DEFAULT 0），老库升级+幂等', () => {
    expect(applied(80)).toBe(true)
    const col = (db.prepare('PRAGMA table_info(deliverables)').all() as Array<{ name: string; type: string; notnull: number; dflt_value: unknown }>)
      .find(c => c.name === 'download_fail_total')
    expect(col?.type.toUpperCase()).toBe('INTEGER')
    expect(col?.notnull).toBe(1)
    expect(col?.dflt_value).toBe('0')

    const mem = new Database(':memory:')
    mem.exec(`CREATE TABLE deliverables (id INTEGER PRIMARY KEY, file_path TEXT);`)
    expect(() => v80.up(mem)).not.toThrow()
    expect(colNames(mem, 'deliverables')).toContain('download_fail_total')
    expect(() => v80.up(mem)).not.toThrow()
    expect((mem.prepare('PRAGMA table_info(deliverables)').all() as Array<{ name: string }>).filter(c => c.name === 'download_fail_total')).toHaveLength(1)
    mem.close()
  })

  it('TC-F0101-v81-01: v81 建 order_previews 表 + 三列幂等补齐，老库升级数据不丢', () => {
    expect(applied(81)).toBe(true)
    expect(tableExists(db, 'order_previews')).toBe(true)
    for (const c of ['preview_visible_to_client', 'free_revision_limit']) expect(colNames(db, 'orders')).toContain(c)
    expect(colNames(db, 'style_sizes')).toContain('free_revisions')

    const mem = new Database(':memory:')
    mem.exec(`
      CREATE TABLE orders (id INTEGER PRIMARY KEY, client_qq TEXT);
      CREATE TABLE style_sizes (id INTEGER PRIMARY KEY);
      INSERT INTO orders (id) VALUES (1);
    `)
    expect(() => v81.up(mem)).not.toThrow()
    expect(tableExists(mem, 'order_previews')).toBe(true)
    expect(colNames(mem, 'orders')).toContain('preview_visible_to_client')
    expect(colNames(mem, 'orders')).toContain('free_revision_limit')
    expect(colNames(mem, 'style_sizes')).toContain('free_revisions')
    // 默认 0=不限/不可见（契约冻结），存量行行为零变化
    expect((mem.prepare('SELECT preview_visible_to_client, free_revision_limit FROM orders WHERE id=1').get() as { preview_visible_to_client: number; free_revision_limit: number })).toEqual({ preview_visible_to_client: 0, free_revision_limit: 0 })
    expect(() => v81.up(mem)).not.toThrow()
    mem.close()
  })

  it('TC-F0101-v82-01: v82 建 preview_uploads 表 + file_path UNIQUE + 两索引，老库升级+幂等', () => {
    expect(applied(82)).toBe(true)
    expect(tableExists(db, 'preview_uploads')).toBe(true)
    for (const c of ['artist_id', 'file_path', 'file_size', 'ip', 'created_at']) expect(colNames(db, 'preview_uploads')).toContain(c)
    const idxs = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='preview_uploads'").all() as Array<{ name: string }>).map(r => r.name)
    expect(idxs).toContain('idx_preview_uploads_artist')
    expect(idxs).toContain('idx_preview_uploads_created')
    // file_path UNIQUE 自动索引存在（防重复落盘台账）
    const uniqueIdx = (db.prepare('PRAGMA index_list(preview_uploads)').all() as Array<{ unique: number; origin: string }>).filter(i => i.unique === 1 && i.origin === 'u')
    expect(uniqueIdx.length).toBeGreaterThanOrEqual(1)

    const mem = new Database(':memory:')
    // v82 建 idx_order_previews_file ON order_previews(file_path)，老库须已有该表
    mem.exec(`CREATE TABLE order_previews (id INTEGER PRIMARY KEY, order_id INTEGER, file_path TEXT);`)
    expect(() => v82.up(mem)).not.toThrow()
    expect(tableExists(mem, 'preview_uploads')).toBe(true)
    expect(() => v82.up(mem)).not.toThrow()
    // UNIQUE 约束生效
    mem.exec(`INSERT INTO preview_uploads (artist_id, file_path, file_size) VALUES (1, 'x.png', 100)`)
    expect(() => mem.exec(`INSERT INTO preview_uploads (artist_id, file_path, file_size) VALUES (1, 'x.png', 100)`)).toThrow()
    mem.close()
  })
})
