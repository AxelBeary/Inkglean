import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// v45 (2026-08-07): events 表 artist_id 复合索引（画师/管理员统计按 artist_id 过滤，防全表扫描）
// setup.js import 时 initDatabase 已跑全量迁移（含 v45），索引已建
describe('迁移 v45: tracking_events_artist_index', () => {
  it('TC-MV-01: v45 已应用且 idx_events_artist_ts 索引存在', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 45'
    ).get()
    expect(applied?.version).toBe(45)

    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_events_artist_ts'"
    ).get()
    expect(idx?.name).toBe('idx_events_artist_ts')
  })

  it('TC-MV-02: 幂等——重跑 initDatabase 不报错且索引仍在', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_events_artist_ts'"
    ).get()
    expect(idx?.name).toBe('idx_events_artist_ts')
  })

  it('TC-MV-03: 原 events 索引 idx_events_name_ts 不受影响', () => {
    const idx = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_events_name_ts'"
    ).get()
    expect(idx?.name).toBe('idx_events_name_ts')
  })
})
