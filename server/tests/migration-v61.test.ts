import { describe, it, expect } from 'vitest'
import { db } from './setup.js'
import { initDatabase } from '../src/db/init.js'

// v61: 视觉批备料——artists 新增 last_login_at / last_greeting_shown_at / dashboard_modules
// setup.js import 时 initDatabase 已跑全量迁移（含 v61），以下按迁移真实产物做回读断言
describe('迁移 v61: dashboard_visual_prep', () => {
  const tableCols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)

  it('TC-MV-11: v61 已应用且三列存在', () => {
    const applied = db.prepare(
      'SELECT version FROM schema_migrations WHERE version = 61'
    ).get() as { version: number } | undefined
    expect(applied?.version).toBe(61)
    const cols = tableCols('artists')
    for (const col of ['last_login_at', 'last_greeting_shown_at', 'dashboard_modules']) {
      expect(cols).toContain(col)
    }
  })

  it('TC-MV-12: 幂等——重跑 initDatabase 不抛错且列结构不变', () => {
    expect(() => initDatabase(db)).not.toThrow()
    const cols = tableCols('artists')
    for (const col of ['last_login_at', 'last_greeting_shown_at', 'dashboard_modules']) {
      expect(cols).toContain(col)
    }
  })
})
