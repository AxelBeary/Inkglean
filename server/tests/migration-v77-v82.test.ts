import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { preTargetDb, isApplied, dropColumnIfExists, tableExists } from './migration-real-entry.js'

/**
 * B3-F0101：v77/v80/v81/v82 专属迁移回归测试
 *
 * 【真实入口改造 · issue #117 判据】原用例每遇老库升级都直调 `vNN.up(mem)`，
 * 绕开 initDatabase 的版本调度语义。现统一改走 `preTargetDb(版本号, revert)`：
 * 以 schema 基线起库 → 手术回该迁移前夜形态 → 预置除该版本外全部版本行 →
 * 调度器自己跑到它。断言逐条对应改造前，未削弱。
 *
 * 每条验：版本已应用 + 结构落点 + 老库升级补齐 + 幂等重跑。
 */
const columnNames = (database: Database.Database, table: string): string[] =>
  (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(c => c.name)
const colNames = (database: Database.Database | typeof db, table: string): string[] => columnNames(database as Database.Database, table)
const applied = (version: number): boolean => !!db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version)

describe('B3-F0101: v77/v80/v81/v82 专属回归', () => {
  it('TC-F0101-v77-01: v77 已应用，reference_uploads 含 ip/file_size，老库升级+幂等', () => {
    expect(applied(77)).toBe(true)
    expect(colNames(db, 'reference_uploads')).toContain('ip')
    expect(colNames(db, 'reference_uploads')).toContain('file_size')

    const mem = preTargetDb(77, d => {
      dropColumnIfExists(d, 'reference_uploads', 'ip')
      dropColumnIfExists(d, 'reference_uploads', 'file_size')
      if (columnNames(d, 'reference_uploads').some(c => c === 'ip' || c === 'file_size')) {
        throw new Error('夹具未退回 v76 形态：reference_uploads 仍有 ip/file_size')
      }
      d.exec("INSERT INTO reference_uploads (file_path, anon_id) VALUES ('p1.png', 1)")
    })
    try {
      expect(isApplied(mem, 77), 'v77 版本行应由调度器写入').toBe(true)
      expect(colNames(mem, 'reference_uploads')).toContain('ip')
      expect(colNames(mem, 'reference_uploads')).toContain('file_size')
      expect(() => initDatabase(mem)).not.toThrow()
      expect((mem.prepare('SELECT COUNT(*) AS n FROM reference_uploads').get() as { n: number }).n).toBe(1)
    } finally {
      mem.close()
    }
  })

  it('TC-F0101-v80-01: v80 已应用，deliverables 含 download_fail_total（NOT NULL DEFAULT 0），老库升级+幂等', () => {
    expect(applied(80)).toBe(true)
    const col = (db.prepare('PRAGMA table_info(deliverables)').all() as Array<{ name: string; type: string; notnull: number; dflt_value: unknown }>)
      .find(c => c.name === 'download_fail_total')
    expect(col?.type.toUpperCase()).toBe('INTEGER')
    expect(col?.notnull).toBe(1)
    expect(col?.dflt_value).toBe('0')

    const mem = preTargetDb(80, d => {
      // v80 才加该列，schema.ts 基线里本就没有 → 此处是 no-op，正是「v79 形态」
      dropColumnIfExists(d, 'deliverables', 'download_fail_total')
      if (columnNames(d, 'deliverables').includes('download_fail_total')) {
        throw new Error('夹具未退回 v79 形态：deliverables 仍有 download_fail_total')
      }
    })
    try {
      expect(isApplied(mem, 80), 'v80 版本行应由调度器写入').toBe(true)
      expect(colNames(mem, 'deliverables')).toContain('download_fail_total')
      expect(() => initDatabase(mem)).not.toThrow()
      expect((mem.prepare('PRAGMA table_info(deliverables)').all() as Array<{ name: string }>).filter(c => c.name === 'download_fail_total')).toHaveLength(1)
    } finally {
      mem.close()
    }
  })

  it('TC-F0101-v81-01: v81 建 order_previews 表 + 三列幂等补齐，老库升级数据不丢', () => {
    expect(applied(81)).toBe(true)
    expect(tableExists(db, 'order_previews')).toBe(true)
    for (const c of ['preview_visible_to_client', 'free_revision_limit']) expect(colNames(db, 'orders')).toContain(c)
    expect(colNames(db, 'style_sizes')).toContain('free_revisions')

    const mem = preTargetDb(81, d => {
      d.exec('DROP TABLE IF EXISTS order_previews')
      for (const [t, c] of [['orders', 'preview_visible_to_client'], ['orders', 'free_revision_limit'], ['style_sizes', 'free_revisions']] as const) {
        dropColumnIfExists(d, t, c)
      }
      if (tableExists(d, 'order_previews')) throw new Error('夹具未退回 v80 形态：order_previews 仍然存在')
      // 老库存量订单：v81 只加列建表，存量行必须一条不丢
      d.exec(`
        INSERT INTO artists (qq_number, name, subdomain) VALUES ('81001', '过程稿画师', 'preview-artist');
        INSERT INTO orders (artist_id, order_no, client_qq) VALUES (1, 'PV-001', '8100');
      `)
    })
    try {
      expect(isApplied(mem, 81), 'v81 版本行应由调度器写入').toBe(true)
      expect(tableExists(mem, 'order_previews')).toBe(true)
      expect(colNames(mem, 'orders')).toContain('preview_visible_to_client')
      expect(colNames(mem, 'orders')).toContain('free_revision_limit')
      expect(colNames(mem, 'style_sizes')).toContain('free_revisions')
      // 默认 0=不限/不可见（契约冻结），存量行行为零变化
      expect((mem.prepare('SELECT preview_visible_to_client, free_revision_limit FROM orders WHERE order_no = ?').get('PV-001') as { preview_visible_to_client: number; free_revision_limit: number })).toEqual({ preview_visible_to_client: 0, free_revision_limit: 0 })
      expect(() => initDatabase(mem)).not.toThrow()
    } finally {
      mem.close()
    }
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

    const mem = preTargetDb(82, d => {
      d.exec('DROP TABLE IF EXISTS preview_uploads')
      if (tableExists(d, 'preview_uploads')) throw new Error('夹具未退回 v81 形态：preview_uploads 仍然存在')
      // v82 建 idx_order_previews_file ON order_previews(file_path)，老库须已有该表（v81 建的，基线 schema 已含）
    })
    try {
      expect(isApplied(mem, 82), 'v82 版本行应由调度器写入').toBe(true)
      expect(tableExists(mem, 'preview_uploads')).toBe(true)
      expect(() => initDatabase(mem)).not.toThrow()
      // UNIQUE 约束生效
      mem.exec("INSERT INTO preview_uploads (artist_id, file_path, file_size) VALUES (1, 'x.png', 100)")
      expect(() => mem.exec("INSERT INTO preview_uploads (artist_id, file_path, file_size) VALUES (1, 'x.png', 100)")).toThrow()
    } finally {
      mem.close()
    }
  })
})