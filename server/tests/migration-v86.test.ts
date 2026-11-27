// v86 activity_events 迁移测试
//
// 判据口径（issue #118 刚立的规矩）：迁移测试必须走**真实入口** initDatabase（含 schema_migrations
// 版本行写入），**禁止直调 migration.up()** —— 直调会绕开「是否真的被迁移链登记/执行」「是否真的
// 写了版本行」「新装库与升级库是否同径」这三个真正会出事的点，只能证明那个函数本身不抛。
//
// 本文件覆盖：
//   - 真实 initDatabase 后 schema_migrations 有 version=86 行（证明登记进 index.ts 且被链执行）
//   - activity_events 表结构 / 两处 CHECK / 三条查询索引存在
//   - 幂等：已应用 v86 的库再跑 initDatabase 不抛、不重复插版本行
//   - 升级路径：v85 已应用但没有本表的老库 → initDatabase 补建表 + 写 v86 行
//   - 分级 TTL 的三档时间边界可由 at 整数列直接算（列类型/语义锚点）
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再开临时内存库——
// 范式同 migration-v84.test.ts，避免循环求值撞迁移链的版本升序断言。
import { db } from './setup.js'
import { initDatabase, MIGRATIONS } from '../src/db/init.js'

/** schema_migrations 行 */
interface VersionRow {
  version: number
  name: string
}

/** PRAGMA table_info 行 */
interface ColumnRow {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

/** sqlite_master 索引行 */
interface IndexRow {
  name: string
}

/** 建表原文行 */
interface SqlRow {
  sql: string
}

const TABLE = 'activity_events'

function versions(database: Database.Database): VersionRow[] {
  return database.prepare('SELECT version, name FROM schema_migrations WHERE version = 86').all() as VersionRow[]
}

function columns(database: Database.Database): ColumnRow[] {
  return database.prepare(`PRAGMA table_info(${TABLE})`).all() as ColumnRow[]
}

function indexNames(database: Database.Database): string[] {
  return (database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?").all(TABLE) as IndexRow[])
    .map(i => i.name)
}

function tableSql(database: Database.Database): string {
  const row = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(TABLE) as SqlRow | undefined
  return (row?.sql ?? '').replace(/\s+/g, ' ')
}

describe('迁移 v86: activity_events（事件流水幕布步 1）', () => {
  it('TC-V86-00: 迁移链登记——MIGRATIONS 里有且仅有一个 v86，位于 v84 之后（v85 让号 PR #116）', () => {
    const v86 = MIGRATIONS.filter(m => m.version === 86)
    expect(v86).toHaveLength(1)
    expect(v86[0].name).toBe('activity_events')
    // 链尾就是 v86（本批合入时 v85 尚未落地；#116 若先合则本批需顺移，届时此断言同步调整）
    expect(MIGRATIONS[MIGRATIONS.length - 1].version).toBe(86)
  })

  it('TC-V86-01: 真实入口 initDatabase 跑完后 schema_migrations 有 v86 行（不是直调 up）', () => {
    // db 来自 ./setup.js，其内部已跑过一遍真实 initDatabase —— 这里是「生产新装路径」的版本行证据
    const rows = versions(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('activity_events')

    // 另开一个干净库，完整走一次真实入口，断言同一个结果可复现（排除共享库残留的偶然性）
    const fresh = new Database(':memory:')
    initDatabase(fresh)
    expect(versions(fresh)).toHaveLength(1)
    fresh.close()
  })

  it('TC-V86-02: 表结构 10 列齐全，主键自增，at/action/actor_kind/outcome 为 NOT NULL', () => {
    const fresh = new Database(':memory:')
    initDatabase(fresh)
    const cols = columns(fresh)
    expect(cols.map(c => c.name)).toEqual([
      'id', 'at', 'actor_kind', 'actor_id', 'ip', 'action', 'target_type', 'target_id', 'meta_json', 'outcome'
    ])
    const byName = new Map(cols.map(c => [c.name, c]))
    expect(byName.get('id')!.pk).toBe(1)
    for (const name of ['at', 'actor_kind', 'action', 'meta_json', 'outcome']) {
      expect(byName.get(name)!.notnull, `${name} 应 NOT NULL`).toBe(1)
    }
    // 可空列：actor_id / ip / target_type / target_id —— 「没取到」存 NULL，不写占位串
    for (const name of ['actor_id', 'ip', 'target_type', 'target_id']) {
      expect(byName.get(name)!.notnull, `${name} 应可空`).toBe(0)
    }
    expect(byName.get('meta_json')!.dflt_value).toBe("'{}'")
    expect(byName.get('outcome')!.dflt_value).toBe("'ok'")
    fresh.close()
  })

  it('TC-V86-03: 两处 CHECK 枚举生效（actor_kind 四态 / outcome 两态），非法值被库拒', () => {
    const fresh = new Database(':memory:')
    initDatabase(fresh)
    const sql = tableSql(fresh)
    expect(sql).toContain("CHECK(actor_kind IN ('admin', 'artist', 'client', 'anon'))")
    expect(sql).toContain("CHECK(outcome IN ('ok', 'fail'))")

    const insert = fresh.prepare(
      'INSERT INTO activity_events (at, actor_kind, actor_id, ip, action, outcome) VALUES (?, ?, ?, ?, ?, ?)'
    )
    expect(() => insert.run(1, 'admin', 7, '203.0.113.7', 'artist_ban', 'ok')).not.toThrow()
    expect(() => insert.run(1, 'ghost', 7, null, 'x', 'ok')).toThrow(/CHECK/)
    expect(() => insert.run(1, 'admin', 7, null, 'x', 'maybe')).toThrow(/CHECK/)
    fresh.close()
  })

  it('TC-V86-04: 三条查询索引就位（at DESC / action+at / actor_kind+actor_id+at）', () => {
    const fresh = new Database(':memory:')
    initDatabase(fresh)
    const names = indexNames(fresh)
    expect(names).toContain('idx_activity_events_at')
    expect(names).toContain('idx_activity_events_action_at')
    expect(names).toContain('idx_activity_events_actor_at')
    // 索引列序证据：action+at 复合索引的首列必须是 action，否则筛选用不上索引
    const info = fresh.prepare("PRAGMA index_info('idx_activity_events_action_at')").all() as Array<{ name: string }>
    expect(info.map(i => i.name)).toEqual(['action', 'at'])
    const actorInfo = fresh.prepare("PRAGMA index_info('idx_activity_events_actor_at')").all() as Array<{ name: string }>
    expect(actorInfo.map(i => i.name)).toEqual(['actor_kind', 'actor_id', 'at'])
    fresh.close()
  })

  it('TC-V86-05: 幂等——已应用 v86 的库再跑 initDatabase 不抛，版本行仍是 1 行', () => {
    const fresh = new Database(':memory:')
    initDatabase(fresh)
    expect(() => initDatabase(fresh)).not.toThrow()
    expect(versions(fresh)).toHaveLength(1)
    // 表还在，且没有因为重跑长出第二份结构
    expect(columns(fresh)).toHaveLength(10)
    fresh.close()
  })

  it('TC-V86-06: 升级路径——v85 已应用但无 activity_events 的老库，initDatabase 补建表并写 v86 行', () => {
    const legacy = new Database(':memory:')
    // 模拟 master 现状（v84 是链尾）+ PR #116 的 v85 已合入：版本行到 85，但没有本表
    legacy.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
    const mark = legacy.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
    for (const m of MIGRATIONS) {
      if (m.version <= 85) mark.run(m.version, m.name)
    }
    expect(legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(TABLE)).toBeUndefined()

    expect(() => initDatabase(legacy)).not.toThrow()
    expect(legacy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(TABLE)).toBeDefined()
    expect(versions(legacy)).toHaveLength(1)
    legacy.close()
  })

  it('TC-V86-07: at 为整数毫秒——分级 TTL 三档边界可直接算术比较', () => {
    const fresh = new Database(':memory:')
    initDatabase(fresh)
    const now = Date.now()
    const day = 86_400_000
    const insert = fresh.prepare('INSERT INTO activity_events (at, actor_kind, action, outcome) VALUES (?, ?, ?, ?)')
    insert.run(now - 400 * day, 'admin', 'artist_ban', 'ok')     // 超 365 天档
    insert.run(now - 200 * day, 'artist', 'login_success', 'ok') // 超 180 天档、未超 365
    insert.run(now - 100 * day, 'client', 'order_create', 'ok')  // 超 90 天档、未超 180
    insert.run(now - 10 * day, 'client', 'report_submit', 'ok')  // 未到期

    // typeof 是整数列的直接证据（TEXT 时间戳会返回 'text'）
    const kinds = fresh.prepare('SELECT typeof(at) AS t FROM activity_events').all() as Array<{ t: string }>
    expect(kinds.every(k => k.t === 'integer')).toBe(true)

    const expired = fresh.prepare('SELECT COUNT(*) AS c FROM activity_events WHERE at < ?').get(now - 365 * day) as { c: number }
    expect(expired.c).toBe(1)
    fresh.close()
  })
})
