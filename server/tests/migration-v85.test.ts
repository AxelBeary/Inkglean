import { describe, it, expect } from 'vitest'
// 先拉起共享模块图（connection → init → migrate → migrations/index），再直导 v85——
// 否则迁移模块循环求值会撞版本升序断言（范式同 migration-v36/v84.test.ts）
import { db } from './setup.js'
import Database from 'better-sqlite3'
import { initDatabase, schema } from '../src/db/init.js'

/**
 * v85 回归（交叉审计 DB-4）：v36 的搬运循环取「无画风 OR 无模板」并集，导致
 * 「画风与模板都有、但一条 style_addons 都没有」的画师被整块跳过，增项在画师侧/客户端都不显示。
 * v85 把这类画师的模板按 (sort_order, id) 挂到其首个画风（同样 OR IGNORE 幂等）。
 *
 * 判据是「该画师名下一条关联都没有」——只要有任何关联就视为已被维护，迁移不覆盖人的选择。
 */

/** 终态基线建库 + 版本行 1..84（v85 是唯一待跑迁移，隔离出它的行为） */
function buildPreV85Db(): Database.Database {
  const mem = new Database(':memory:')
  mem.pragma('foreign_keys = ON')
  mem.exec(schema)
  const markApplied = mem.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
  for (let version = 1; version <= 84; version++) markApplied.run(version, `v${version}`)
  return mem
}

function seedArtist(mem: Database.Database, name: string): number {
  return Number(mem.prepare(
    "INSERT INTO artists (qq_number, name, subdomain, artist_code, status, totp_secret, totp_verified) VALUES (?, ?, ?, ?, 'hidden', 'JBSWY3DPEHPK3PXP', 1)"
  ).run(`9${name}`, name, name, name.toUpperCase()).lastInsertRowid)
}

function seedStyle(mem: Database.Database, artistId: number, name: string, sortOrder: number): number {
  return Number(mem.prepare(
    'INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, ?, ?, 1)'
  ).run(artistId, name, sortOrder).lastInsertRowid)
}

function seedTemplate(mem: Database.Database, artistId: number, name: string, sortOrder: number): number {
  return Number(mem.prepare(
    "INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, sort_order) VALUES (?, ?, 'switch', 'fixed', 10, ?)"
  ).run(artistId, name, sortOrder).lastInsertRowid)
}

const linksOf = (mem: Database.Database, artistId: number) => mem.prepare(`
  SELECT sa.art_style_id AS styleId, sa.addon_template_id AS templateId, sa.is_enabled AS isEnabled
  FROM style_addons sa JOIN art_styles st ON st.id = sa.art_style_id
  WHERE st.artist_id = ? ORDER BY st.sort_order, st.id, sa.id
`).all(artistId) as Array<{ styleId: number; templateId: number; isEnabled: number }>

describe('迁移 v85: legacy_addon_link_backfill（DB-4 历史补链）', () => {
  it('TC-V85-00: 全量链路（setup.js initDatabase）已登记并应用 v85', () => {
    const applied = db.prepare('SELECT version FROM schema_migrations WHERE version = 85').get() as { version: number } | undefined
    expect(applied?.version).toBe(85)
  })

  it('TC-V85-01: 有模板但一条关联都没有 → 按 (sort_order,id) 挂到首个画风，is_enabled=1', () => {
    const mem = buildPreV85Db()
    const artistId = seedArtist(mem, 'carol')
    const styleId = seedStyle(mem, artistId, '默认', 0)
    const second = seedTemplate(mem, artistId, '第二个', 2)
    const first = seedTemplate(mem, artistId, '第一个', 0)

    initDatabase(mem)

    expect(linksOf(mem, artistId)).toEqual([
      { styleId, templateId: first, isEnabled: 1 },
      { styleId, templateId: second, isEnabled: 1 }
    ])
    mem.close()
  })

  it('TC-V85-02: 「首个画风」按 sort_order 取，不是按 id 取', () => {
    const mem = buildPreV85Db()
    const artistId = seedArtist(mem, 'dave')
    seedStyle(mem, artistId, '先建的但排后面', 5) // id 更小、sort_order 更大
    const intended = seedStyle(mem, artistId, '排序第一', 0)
    seedTemplate(mem, artistId, '加人', 0)

    initDatabase(mem)

    expect(linksOf(mem, artistId).map(l => l.styleId)).toEqual([intended])
    mem.close()
  })

  it('TC-V85-03: 已有任意关联的画师不被改动（哪怕关联不在首个画风上）', () => {
    const mem = buildPreV85Db()
    const artistId = seedArtist(mem, 'erin')
    const firstStyle = seedStyle(mem, artistId, '默认', 0)
    const secondStyle = seedStyle(mem, artistId, '另一个', 1)
    const templateA = seedTemplate(mem, artistId, '加人', 0)
    seedTemplate(mem, artistId, '加背景', 1)
    // 人工维护过的形态：只把 1 个模板挂到第二个画风
    mem.prepare('INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled) VALUES (?, ?, 0)').run(secondStyle, templateA)

    initDatabase(mem)

    // 不得补到首个画风、不得改 is_enabled
    expect(linksOf(mem, artistId)).toEqual([{ styleId: secondStyle, templateId: templateA, isEnabled: 0 }])
    expect(linksOf(mem, artistId).some(l => l.styleId === firstStyle)).toBe(false)
    mem.close()
  })

  it('TC-V85-04: 二跑幂等——关联行不增、不重复登记版本', () => {
    const mem = buildPreV85Db()
    const artistId = seedArtist(mem, 'frank')
    seedStyle(mem, artistId, '默认', 0)
    seedTemplate(mem, artistId, '加人', 0)
    seedTemplate(mem, artistId, '加背景', 1)

    initDatabase(mem)
    const afterFirst = linksOf(mem, artistId)
    expect(afterFirst).toHaveLength(2)

    expect(() => initDatabase(mem)).not.toThrow()
    expect(linksOf(mem, artistId)).toEqual(afterFirst)
    expect((mem.prepare('SELECT COUNT(*) AS c FROM schema_migrations WHERE version = 85').get() as { c: number }).c).toBe(1)
    mem.close()
  })

  it('TC-V85-05: 只有模板、没有画风 → 跳过不抛（留给人工处理）', () => {
    const mem = buildPreV85Db()
    const artistId = seedArtist(mem, 'grace')
    seedTemplate(mem, artistId, '孤儿模板', 0)

    expect(() => initDatabase(mem)).not.toThrow()
    expect(linksOf(mem, artistId)).toEqual([])
    expect((mem.prepare('SELECT COUNT(*) AS c FROM addon_templates WHERE artist_id = ?').get(artistId) as { c: number }).c).toBe(1)
    mem.close()
  })
})
