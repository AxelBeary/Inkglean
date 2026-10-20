import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'
import type { SizeAddonOverrideBatchItem } from '../src/features/pricing/style.types.js'

// ============================================
// N×M 批量覆盖批：GET /api/artist/art-styles/overrides
// 画风管理页「全量尺寸覆盖」只读端点 —— 消前端 N 画风 × M 尺寸的逐对 GET
// 契约：按 request.artist.id 过滤（绝不跨画师）；行结构 = SizeAddonOverride + style_id；
//       固定一条 SQL（JOIN style_sizes / art_styles），不分页、不加 scope。
// ============================================

const BATCH_URL = '/api/artist/art-styles/overrides'

/** 把批量行裁成逐对端点（getSizeOverrides）同形，用于并轨一致性断言 */
function stripStyleId(o: SizeAddonOverrideBatchItem): Omit<SizeAddonOverrideBatchItem, 'style_id'> {
  return {
    id: o.id,
    style_size_id: o.style_size_id,
    style_addon_id: o.style_addon_id,
    price_override: o.price_override,
    is_hidden: o.is_hidden
  }
}

/** 精确定位一行（找不到即报错，避免 undefined 断言泄漏语义） */
function rowOf(rows: SizeAddonOverrideBatchItem[], sizeId: number, addonId: number): SizeAddonOverrideBatchItem {
  const row = rows.find(o => o.style_size_id === sizeId && o.style_addon_id === addonId)
  if (!row) throw new Error(`未找到 size=${sizeId} addon=${addonId} 的覆盖行`)
  return row
}

describe('GET /api/artist/art-styles/overrides 全量尺寸覆盖', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  /** 场景：2 画风 × 2 尺寸 + 2 个普通增项（每画风都绑这两个增项） */
  function seedStyleScene(artist: ArtistRow) {
    const style1 = styleService.createArtStyle(artist.id, { name: '日系' })
    const style2 = styleService.createArtStyle(artist.id, { name: '厚涂' })
    const size1 = styleService.createStyleSize(artist.id, style1.id, { name: '头像', base_price: 200 })
    const size2 = styleService.createStyleSize(artist.id, style1.id, { name: '全身', base_price: 400 })
    const size3 = styleService.createStyleSize(artist.id, style2.id, { name: '半身', base_price: 300 })
    const size4 = styleService.createStyleSize(artist.id, style2.id, { name: '立绘', base_price: 600 })

    const tplPerson = styleService.createAddonTemplate(artist.id, {
      name: '加人', control_type: 'quantity', price_mode: 'fixed', default_price: 100, unit_label: '人'
    })
    const tplBg = styleService.createAddonTemplate(artist.id, {
      name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 80
    })
    styleService.setStyleAddons(artist.id, style1.id, [{ addon_template_id: tplPerson.id }, { addon_template_id: tplBg.id }])
    styleService.setStyleAddons(artist.id, style2.id, [{ addon_template_id: tplPerson.id }, { addon_template_id: tplBg.id }])

    /** 取某画风下某模板绑定的 style_addons 行 */
    const addonOf = (styleId: number, templateId: number) => {
      const sa = styleService.getStyleAddons(styleId).find(a => a.addon_template_id === templateId)
      if (!sa) throw new Error(`模板 ${templateId} 未绑定到画风 ${styleId}`)
      return sa
    }

    return {
      style1, style2, size1, size2, size3, size4,
      s1Person: addonOf(style1.id, tplPerson.id),
      s1Bg: addonOf(style1.id, tplBg.id),
      s2Person: addonOf(style2.id, tplPerson.id),
      s2Bg: addonOf(style2.id, tplBg.id)
    }
  }

  it('TC-OVB-01: A 画师 2 画风 × 2 尺寸的覆盖全量返回，style_id 正确，B 画师数据不串', async () => {
    const artistA = seedArtist({ qq_number: '77101', subdomain: 'ovb-a' })
    const artistB = seedArtist({ qq_number: '77102', subdomain: 'ovb-b' })
    const scene = seedStyleScene(artistA)

    // A：4 个尺寸各写覆盖，其中 size1 同尺寸挂两个增项
    styleService.setSizeOverrides(artistA.id, scene.style1.id, scene.size1.id, [
      { style_addon_id: scene.s1Person.id, price_override: 220 },
      { style_addon_id: scene.s1Bg.id, is_hidden: true }
    ])
    styleService.setSizeOverrides(artistA.id, scene.style1.id, scene.size2.id, [
      { style_addon_id: scene.s1Person.id, price_override: 380 }
    ])
    styleService.setSizeOverrides(artistA.id, scene.style2.id, scene.size3.id, [
      { style_addon_id: scene.s2Person.id, is_hidden: true }
    ])
    styleService.setSizeOverrides(artistA.id, scene.style2.id, scene.size4.id, [
      { style_addon_id: scene.s2Bg.id, price_override: 90 }
    ])

    // B：独立画风 / 尺寸 / 增项 / 覆盖
    const bStyle = styleService.createArtStyle(artistB.id, { name: 'Q版' })
    const bSize = styleService.createStyleSize(artistB.id, bStyle.id, { name: '头像', base_price: 100 })
    const bTpl = styleService.createAddonTemplate(artistB.id, {
      name: '背景', control_type: 'switch', price_mode: 'fixed', default_price: 10
    })
    styleService.setStyleAddons(artistB.id, bStyle.id, [{ addon_template_id: bTpl.id }])
    const bAddon = styleService.getStyleAddons(bStyle.id).find(a => a.addon_template_id === bTpl.id)!
    styleService.setSizeOverrides(artistB.id, bStyle.id, bSize.id, [
      { style_addon_id: bAddon.id, price_override: 999 }
    ])
    const bRows = db.prepare('SELECT id FROM size_addon_overrides WHERE style_size_id = ?').all(bSize.id) as Array<{ id: number }>
    expect(bRows).toHaveLength(1)

    const tokenA = createSession(artistA.id, artistA.token_version)
    const resA = await app.inject({ method: 'GET', url: BATCH_URL, headers: { Authorization: `Bearer ${tokenA}` } })
    expect(resA.statusCode).toBe(200)
    const batch = resA.json() as SizeAddonOverrideBatchItem[]

    expect(batch).toHaveLength(5)
    // 行形状锁死：snake_case + style_id，与逐对端点同形
    for (const row of batch) {
      expect(Object.keys(row).sort()).toEqual([
        'id', 'is_hidden', 'price_override', 'style_addon_id', 'style_id', 'style_size_id'
      ])
    }
    // style_id 归属正确（每条都等于其 style_size 所属画风）
    const styleIdBySize = new Map<number, number>([
      [scene.size1.id, scene.style1.id],
      [scene.size2.id, scene.style1.id],
      [scene.size3.id, scene.style2.id],
      [scene.size4.id, scene.style2.id]
    ])
    for (const row of batch) {
      expect(row.style_id).toBe(styleIdBySize.get(row.style_size_id))
    }
    expect(new Set(batch.map(o => o.style_id))).toEqual(new Set([scene.style1.id, scene.style2.id]))

    // 逐条值与写入一致
    expect(rowOf(batch, scene.size1.id, scene.s1Person.id)).toMatchObject({
      price_override: 220, is_hidden: 0, style_id: scene.style1.id
    })
    expect(rowOf(batch, scene.size1.id, scene.s1Bg.id)).toMatchObject({
      price_override: null, is_hidden: 1, style_id: scene.style1.id
    })
    expect(rowOf(batch, scene.size2.id, scene.s1Person.id)).toMatchObject({
      price_override: 380, is_hidden: 0, style_id: scene.style1.id
    })
    expect(rowOf(batch, scene.size3.id, scene.s2Person.id)).toMatchObject({
      price_override: null, is_hidden: 1, style_id: scene.style2.id
    })
    expect(rowOf(batch, scene.size4.id, scene.s2Bg.id)).toMatchObject({
      price_override: 90, is_hidden: 0, style_id: scene.style2.id
    })

    // B 的行一条都不许出现（跨画师零泄漏）
    const bIds = new Set(bRows.map(r => r.id))
    expect(batch.some(o => bIds.has(o.id))).toBe(false)
    expect(batch.some(o => o.style_size_id === bSize.id)).toBe(false)
    expect(batch.some(o => o.style_id === bStyle.id)).toBe(false)

    // 与逐对端点评并轨：同 size 的 getSizeOverrides 与批量切片逐字段一致
    for (const [sizeId, styleId] of styleIdBySize) {
      expect(styleService.getSizeOverrides(artistA.id, styleId, sizeId)).toEqual(
        batch.filter(o => o.style_size_id === sizeId).map(stripStyleId)
      )
    }

    // 反向：B 调用只看得到自己那一行
    const tokenB = createSession(artistB.id, artistB.token_version)
    const resB = await app.inject({ method: 'GET', url: BATCH_URL, headers: { Authorization: `Bearer ${tokenB}` } })
    expect(resB.statusCode).toBe(200)
    const batchB = resB.json() as SizeAddonOverrideBatchItem[]
    expect(batchB).toHaveLength(1)
    expect(batchB[0]).toMatchObject({
      id: bRows[0].id, style_size_id: bSize.id, style_addon_id: bAddon.id, price_override: 999, style_id: bStyle.id
    })
  })

  it('TC-OVB-02: 无认证 → 401；伪造 token → 401', async () => {
    const anonymous = await app.inject({ method: 'GET', url: BATCH_URL })
    expect(anonymous.statusCode).toBe(401)

    const forged = await app.inject({
      method: 'GET',
      url: BATCH_URL,
      headers: { Authorization: 'Bearer not-a-real-session-token' }
    })
    expect(forged.statusCode).toBe(401)
  })

  it('TC-OVB-03: 有画风与尺寸但一条覆盖都没有 → 200 + []', async () => {
    const artist = seedArtist({ qq_number: '77103', subdomain: 'ovb-empty' })
    seedStyleScene(artist) // 建画风/尺寸/增项绑定，但不写任何覆盖

    const token = createSession(artist.id, artist.token_version)
    const res = await app.inject({ method: 'GET', url: BATCH_URL, headers: { Authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('TC-OVB-04: 同一 size 多 addon 各自独立，价格与隐藏位不串，也不串到别的 size', async () => {
    const artist = seedArtist({ qq_number: '77104', subdomain: 'ovb-multi' })
    const scene = seedStyleScene(artist)

    styleService.setSizeOverrides(artist.id, scene.style1.id, scene.size1.id, [
      { style_addon_id: scene.s1Person.id, price_override: 150 },
      { style_addon_id: scene.s1Bg.id, price_override: 30, is_hidden: true }
    ])
    // 同画风另一尺寸只覆盖一个 addon（若按画风串行/按 addon 覆盖会在此暴露）
    styleService.setSizeOverrides(artist.id, scene.style1.id, scene.size2.id, [
      { style_addon_id: scene.s1Bg.id, price_override: 66 }
    ])

    const token = createSession(artist.id, artist.token_version)
    const res = await app.inject({ method: 'GET', url: BATCH_URL, headers: { Authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const batch = res.json() as SizeAddonOverrideBatchItem[]

    expect(batch).toHaveLength(3)
    const sameSize = batch.filter(o => o.style_size_id === scene.size1.id)
    expect(sameSize).toHaveLength(2)
    const byAddon = new Map(sameSize.map(o => [o.style_addon_id, o]))
    expect(byAddon.get(scene.s1Person.id)).toMatchObject({ price_override: 150, is_hidden: 0 })
    expect(byAddon.get(scene.s1Bg.id)).toMatchObject({ price_override: 30, is_hidden: 1 })
    // 两个 addon 的行 id 必须互异（同一 size 下未被合并成一行）
    expect(byAddon.get(scene.s1Person.id)!.id).not.toBe(byAddon.get(scene.s1Bg.id)!.id)

    const otherSize = batch.filter(o => o.style_size_id === scene.size2.id)
    expect(otherSize).toHaveLength(1)
    expect(otherSize[0]).toMatchObject({ style_addon_id: scene.s1Bg.id, price_override: 66, is_hidden: 0 })
  })

  it('TC-OVB-05: 全量读取固定一条 size_addon_overrides 查询，不随画风/尺寸数增长', async () => {
    const artist = seedArtist({ qq_number: '77105', subdomain: 'ovb-onesql' })
    const scene = seedStyleScene(artist)
    styleService.setSizeOverrides(artist.id, scene.style1.id, scene.size1.id, [
      { style_addon_id: scene.s1Person.id, price_override: 210 },
      { style_addon_id: scene.s1Bg.id, is_hidden: true }
    ])
    styleService.setSizeOverrides(artist.id, scene.style2.id, scene.size3.id, [
      { style_addon_id: scene.s2Bg.id, price_override: 70 }
    ])

    const token = createSession(artist.id, artist.token_version)
    const countOverridePrepares = async (): Promise<number> => {
      const spy = vi.spyOn(db, 'prepare')
      spy.mockClear()
      const res = await app.inject({ method: 'GET', url: BATCH_URL, headers: { Authorization: `Bearer ${token}` } })
      const count = spy.mock.calls.filter(([sql]) => typeof sql === 'string' && sql.includes('size_addon_overrides')).length
      spy.mockRestore()
      expect(res.statusCode).toBe(200)
      return count
    }

    const before = await countOverridePrepares()
    expect(before).toBe(1)

    // 再加 2 画风 × 2 尺寸 × 各 1 条覆盖，查询次数仍为 1（N+1 已从源头消掉）
    const extraStyle1 = styleService.createArtStyle(artist.id, { name: '赛璐璐' })
    const extraStyle2 = styleService.createArtStyle(artist.id, { name: '像素' })
    for (const style of [extraStyle1, extraStyle2]) {
      for (const name of ['小图', '大图']) {
        const size = styleService.createStyleSize(artist.id, style.id, { name, base_price: 120 })
        const addon = styleService.getStyleAddons(style.id).find(a => a.addon_template_id !== null)!
        styleService.setSizeOverrides(artist.id, style.id, size.id, [{ style_addon_id: addon.id, price_override: 140 }])
      }
    }

    const after = await countOverridePrepares()
    expect(after).toBe(1)

    const res = await app.inject({ method: 'GET', url: BATCH_URL, headers: { Authorization: `Bearer ${token}` } })
    expect(res.json()).toHaveLength(7) // 初始 3（size1 两条 + size3 一条）+ 追加 4，一次拿全
  })
})
