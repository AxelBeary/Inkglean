import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// v43 (2026-08-05): DROP price_addons + addon_tiers（用户拍板，事务外 + 显式关 FK）
// setup.js import 时 initDatabase 已跑全量迁移（含 v43），两表已删
describe('迁移 v43: DROP price_addons/addon_tiers', () => {
  it('TC-MV-01: v43 已应用且两表不存在', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 43'
    ).get()
    expect(applied?.version).toBe(43)

    for (const t of ['price_addons', 'addon_tiers']) {
      const row = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      ).get(t)
      expect(row).toBeUndefined()
    }
  })

  it('TC-MV-02: 幂等——重跑 initDatabase 不报错且两表仍不存在', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'price_addons'"
    ).get()
    expect(row).toBeUndefined()
  })

  it('TC-MV-03: 活表不受影响——price_tiers 档位基础价表仍存在', () => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'price_tiers'"
    ).get()
    expect(row?.name).toBe('price_tiers')
  })
})
