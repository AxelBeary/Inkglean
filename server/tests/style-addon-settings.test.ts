import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'

// ============================================
// F0192: 增项「一次保存」事务端点（PUT /api/artist/art-styles/:id/addon-settings）
// 口径（施工图 §2 + 拍板）：单 db.transaction 全成全败；互斥由服务端按库内 category 推导；
// 孤儿行（addon_template_id:null）带模板价 = 跳过模板级写入 + 告警，不 422 整批拒。
// ============================================

/** 812-B B7 种子：系统预置 usage×2（个人/商业）+ rush×2（标准/加急），cleanDb 保留、createArtStyle 自动绑定 */
const SYSTEM_USAGE_COUNT = 2
const SYSTEM_RUSH_COUNT = 2

describe('F0192 saveAddonSettings（service 层）', () => {
  let artist: ArtistRow
  let style: ReturnType<typeof styleService.createArtStyle>
  let size1: ReturnType<typeof styleService.createStyleSize>
  let size2: ReturnType<typeof styleService.createStyleSize>

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77210', subdomain: 'f0192-svc' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
    size1 = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    size2 = styleService.createStyleSize(artist.id, style.id, { name: '半身', base_price: 400 })
  })

  it('TC-F1-01: 四层一次落库 + 同类互斥服务端推导（rush 打开 → 同类含系统预置全停用，usage/add 不受影响）', () => {
    // 画师私有加急 ×2（rush 必须 percent+switch，SPEC-PRICE-2）
    const rushA = styleService.createAddonTemplate(artist.id, { name: '加急A', category: 'rush', price_mode: 'percent', default_price: 20 })
    const rushB = styleService.createAddonTemplate(artist.id, { name: '加急B', category: 'rush', price_mode: 'percent', default_price: 30 })
    // 先给 B 落一个画风覆盖（后续断言 stylePriceOverride:null 的继承清覆盖语义）
    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: rushA.id },
      { addon_template_id: rushB.id, price_override: 28 }
    ])
    const rowB = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === rushB.id)!
    expect(rowB.price_override).toBe(28)

    const result = styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: rowB.id,
      templateDefaultPrice: 35,       // 模板级：percent 整数约束由 updateAddonTemplate 兜底
      stylePriceOverride: null,       // 画风级：null = 清覆盖跟随模板
      styleEnabled: true,             // 画风级激活 → 服务端推导同类互斥
      sizeOverrides: [
        { sizeId: size1.id, priceOverride: 15, isHidden: false },
        { sizeId: size2.id, priceOverride: null, isHidden: true }
      ]
    })

    // 模板级已落库
    expect(styleService.getAddonTemplate(artist.id, rushB.id).default_price).toBe(35)
    // 画风级：B 激活 + 覆盖已清（继承语义）
    const after = result.addons.find(r => r.id === rowB.id)!
    expect(after.is_enabled).toBe(1)
    expect(after.price_override).toBeNull()
    // 互斥推导：同 rush 类其他启用行（画师私有 A + 系统预置标准/加急）全部停用
    const rushOthers = result.addons.filter(r => r.template_category === 'rush' && r.addon_template_id !== rushB.id)
    expect(rushOthers).toHaveLength(1 + SYSTEM_RUSH_COUNT)
    for (const r of rushOthers) expect(r.is_enabled).toBe(0)
    // usage 类不受影响（系统预置个人/商业仍启用）
    const usageRows = result.addons.filter(r => r.template_category === 'usage')
    expect(usageRows).toHaveLength(SYSTEM_USAGE_COUNT)
    for (const r of usageRows) expect(r.is_enabled).toBe(1)
    // 尺寸级覆盖已落库
    const ov1 = styleService.getSizeOverrides(artist.id, style.id, size1.id).find(o => o.style_addon_id === rowB.id)!
    expect(ov1.price_override).toBe(15)
    expect(ov1.is_hidden).toBe(0)
    const ov2 = styleService.getSizeOverrides(artist.id, style.id, size2.id).find(o => o.style_addon_id === rowB.id)!
    expect(ov2.price_override).toBeNull()
    expect(ov2.is_hidden).toBe(1)
    // 聚合返回：sizeOverrides 为画师全量批量形状（带 style_id 便于前端归并）
    expect(result.sizeOverrides.filter(o => o.style_id === style.id)).toHaveLength(2)
  })

  it('TC-F1-02: add 类激活不触发互斥（add 不互斥铁律）', () => {
    const addA = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 50 })
    const addB = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: addA.id },
      { addon_template_id: addB.id }
    ])
    const rowA = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === addA.id)!
    const rowB = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === addB.id)!

    styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: rowB.id,
      styleEnabled: true,
      sizeOverrides: []
    })

    const after = styleService.getStyleAddons(style.id)
    expect(after.find(r => r.id === rowB.id)!.is_enabled).toBe(1)
    // 同为 add 类的 A 不被停用
    expect(after.find(r => r.id === rowA.id)!.is_enabled).toBe(1)
  })

  it('TC-F1-03: 中途注入非法 sizeId → 整体回滚（模板价/激活/覆盖全部未落库）', () => {
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id, is_enabled: false }])
    const row = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!
    expect(row.is_enabled).toBe(0)

    expect(() => styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: row.id,
      templateDefaultPrice: 200,     // 先于尺寸级执行——若不回滚此处会落库
      styleEnabled: true,
      sizeOverrides: [{ sizeId: 99999, priceOverride: 1, isHidden: false }] // 非法 sizeId 触发抛错
    })).toThrow('STYLE_SIZE_NOT_FOUND')

    // 回滚生效：模板价未变、激活未落库、无任何覆盖行
    expect(styleService.getAddonTemplate(artist.id, tpl.id).default_price).toBe(100)
    expect(styleService.getStyleAddons(style.id).find(r => r.id === row.id)!.is_enabled).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS c FROM size_addon_overrides').get() as { c: number }).c).toBe(0)
  })

  it('TC-F1-04: 孤儿行拍板口径——模板级写入跳过 + 告警日志，其余层级照常生效，不 422', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // 构造孤儿行：绑定 → 删模板（deleteAddonTemplate 快照解绑，addon_template_id 置 NULL）
      const tpl = styleService.createAddonTemplate(artist.id, { name: '旧加急', category: 'rush', price_mode: 'percent', default_price: 25 })
      styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
      const bound = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!
      styleService.deleteAddonTemplate(artist.id, tpl.id)
      const orphan = styleService.getStyleAddons(style.id).find(r => r.id === bound.id)!
      expect(orphan.addon_template_id).toBeNull()
      const snapshotPrice = orphan.template_default_price // 快照价 25

      const result = styleService.saveAddonSettings(artist.id, style.id, {
        styleAddonId: orphan.id,
        templateDefaultPrice: 99,      // 孤儿行带模板价 → 拍板口径：跳过 + 告警
        stylePriceOverride: 40,
        styleEnabled: true,
        sizeOverrides: [{ sizeId: size1.id, priceOverride: 12, isHidden: false }]
      })

      // 不 422：调用成功，画风级/尺寸级照常生效
      const orphanAfter = result.addons.find(r => r.id === orphan.id)!
      expect(orphanAfter.price_override).toBe(40)
      expect(orphanAfter.is_enabled).toBe(1)
      expect(styleService.getSizeOverrides(artist.id, style.id, size1.id)[0].price_override).toBe(12)
      // 模板级写入被跳过：快照价原样（孤儿行无模板可改）
      expect(orphanAfter.template_default_price).toBe(snapshotPrice)
      // 告警日志已发出（含 F0192 线索）
      expect(warnSpy).toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('F0192')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('TC-F1-05: 孤儿行按快照类别参与互斥推导（根治 F0190/F0191 的服务端面）', () => {
    // 孤儿 rush 行（沿用 TC-F1-04 构造法），保持启用
    const tpl = styleService.createAddonTemplate(artist.id, { name: '旧加急', category: 'rush', price_mode: 'percent', default_price: 25 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const bound = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!
    styleService.deleteAddonTemplate(artist.id, tpl.id)
    const orphanId = styleService.getStyleAddons(style.id).find(r => r.id === bound.id)!.id

    // 新建另一 rush 模板并经一次保存启用 → 服务端应连孤儿行一并停用（旧前端互斥拼装会漏掉孤儿行）
    const rushC = styleService.createAddonTemplate(artist.id, { name: '加急C', category: 'rush', price_mode: 'percent', default_price: 40 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: rushC.id, is_enabled: false }])
    const rowC = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === rushC.id)!

    styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: rowC.id,
      styleEnabled: true,
      sizeOverrides: []
    })

    const after = styleService.getStyleAddons(style.id)
    expect(after.find(r => r.id === rowC.id)!.is_enabled).toBe(1)
    expect(after.find(r => r.id === orphanId)!.is_enabled).toBe(0)
  })

  it('TC-F1-06: 系统预置模板行 scope=all 带模板价 → 跳过模板级写入+告警，不 404、不回滚用户自有修改（XEND-01/R1-F13）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // 系统预置加急（artist_id NULL）被 createArtStyle 自动绑定且启用
      const sysRush = styleService.getStyleAddons(style.id).find(r => r.template_category === 'rush')!
      expect(sysRush.addon_template_id).not.toBeNull()
      const sysTplId = sysRush.addon_template_id!
      const priceBefore = styleService.getAddonTemplate(artist.id, sysTplId).default_price

      const result = styleService.saveAddonSettings(artist.id, style.id, {
        styleAddonId: sysRush.id,
        templateDefaultPrice: 999,      // 系统模板画师不可改 → 应跳过 + 告警（旧实现 404 整批回滚）
        stylePriceOverride: 33,         // 画师自有行的合法修改，必须照常生效
        styleEnabled: true,
        sizeOverrides: [{ sizeId: size1.id, priceOverride: 7, isHidden: false }]
      })

      // 不 404：调用成功；系统模板全局默认价未被改写
      expect(styleService.getAddonTemplate(artist.id, sysTplId).default_price).toBe(priceBefore)
      // 画师自有行的合法修改未被回滚
      const after = result.addons.find(r => r.id === sysRush.id)!
      expect(after.price_override).toBe(33)
      expect(after.is_enabled).toBe(1)
      expect(styleService.getSizeOverrides(artist.id, style.id, size1.id).find(o => o.style_addon_id === sysRush.id)!.price_override).toBe(7)
      // 告警含 F0192 线索（与孤儿行同口径）
      expect(warnSpy).toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('F0192')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('TC-F1-08: 系统模板行存在时 scope=all 保存成功且只改画师自有行（系统模板价与其他行均不受影响）', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // 画师自有加急模板 + 绑定行（可改模板价）
      const own = styleService.createAddonTemplate(artist.id, { name: '自有加急', category: 'rush', price_mode: 'percent', default_price: 20 })
      styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: own.id }])
      const ownRow = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === own.id)!
      // 系统预置行快照：模板价 + 行激活态
      const sysRush = styleService.getStyleAddons(style.id).find(r => r.template_category === 'rush' && r.addon_template_id !== own.id)!
      const sysTplId = sysRush.addon_template_id!
      const sysPriceBefore = styleService.getAddonTemplate(artist.id, sysTplId).default_price
      const sysEnabledBefore = sysRush.is_enabled

      // 对「画师自有行」做 scope=all 保存：只应改自有模板价，系统模板行原样
      styleService.saveAddonSettings(artist.id, style.id, {
        styleAddonId: ownRow.id,
        templateDefaultPrice: 45,
        sizeOverrides: []
      })

      expect(styleService.getAddonTemplate(artist.id, own.id).default_price).toBe(45)
      expect(styleService.getAddonTemplate(artist.id, sysTplId).default_price).toBe(sysPriceBefore)
      const sysAfter = styleService.getStyleAddons(style.id).find(r => r.id === sysRush.id)!
      expect(sysAfter.is_enabled).toBe(sysEnabledBefore)
      expect(sysAfter.price_override).toBe(sysRush.price_override)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('TC-F1-09: 归属校验不放宽——行绑定他人模板（数据异常/越权）仍 404，不吞真实越权', () => {
    const other = seedArtist({ qq_number: '77212', subdomain: 'f0192-foreign' })
    const foreignTpl = styleService.createAddonTemplate(other.id, { name: '他人模板', category: 'rush', price_mode: 'percent', default_price: 30 })
    // 直接在画师自有画风内造一条指向他人模板的行（正常 API 不会产生，仅模拟数据异常/越权载体）
    const foreignRowId = Number(db.prepare(
      'INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled, price_override) VALUES (?, ?, 1, NULL)'
    ).run(style.id, foreignTpl.id).lastInsertRowid)

    expect(() => styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: foreignRowId,
      templateDefaultPrice: 88,
      sizeOverrides: []
    })).toThrow('ADDON_TEMPLATE_NOT_FOUND')
    // 他人模板价未被越权改写
    expect(styleService.getAddonTemplate(other.id, foreignTpl.id).default_price).toBe(30)
  })

  it('TC-F1-07: 归属校验——跨画师画风 404 / 不存在行 404', () => {
    const other = seedArtist({ qq_number: '77211', subdomain: 'f0192-other' })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const row = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!

    expect(() => styleService.saveAddonSettings(other.id, style.id, {
      styleAddonId: row.id, sizeOverrides: []
    })).toThrow('STYLE_NOT_FOUND')

    expect(() => styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: 99999, sizeOverrides: []
    })).toThrow('STYLE_ADDON_NOT_FOUND')
  })

  it('TC-SVR04-01: 50 项 sizeOverrides —— 归属/存在性查询固定 2 条批量，无逐项 N+1，且全部落库', () => {
    const sizes = Array.from({ length: 50 }, (_, i) =>
      styleService.createStyleSize(artist.id, style.id, { name: `尺寸${i}`, base_price: 100 + i })
    )
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 80 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const row = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!

    const prepareSpy = vi.spyOn(db, 'prepare')
    const result = styleService.saveAddonSettings(artist.id, style.id, {
      styleAddonId: row.id,
      sizeOverrides: sizes.map((s, i) => ({ sizeId: s.id, priceOverride: i, isHidden: i % 2 === 0 }))
    })
    const sizeLookups = prepareSpy.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /SELECT id FROM style_sizes WHERE id = \? AND art_style_id = \?/.test(sql)).length
    const overrideLookups = prepareSpy.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /SELECT id FROM size_addon_overrides WHERE style_size_id = \? AND style_addon_id = \?/.test(sql)).length
    const batchSizes = prepareSpy.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /SELECT id FROM style_sizes WHERE art_style_id = \? AND id IN \(/.test(sql)).length
    const batchOverrides = prepareSpy.mock.calls.filter(([sql]) =>
      typeof sql === 'string' && /SELECT style_size_id, id FROM size_addon_overrides WHERE style_addon_id = \? AND style_size_id IN \(/.test(sql)).length
    prepareSpy.mockRestore()

    // 逐项 N+1 归零，批量预取固定各 1 条（与 items 数量无关）
    expect(sizeLookups).toBe(0)
    expect(overrideLookups).toBe(0)
    expect(batchSizes).toBe(1)
    expect(batchOverrides).toBe(1)
    // 正确性：50 条覆盖全部落库且价格/隐藏值与入参一致
    const overrides = result.sizeOverrides.filter(o => o.style_id === style.id && o.style_addon_id === row.id)
    expect(overrides).toHaveLength(50)
    for (let i = 0; i < 50; i++) {
      const o = overrides.find(x => x.style_size_id === sizes[i].id)!
      expect(o.price_override).toBe(i)
      expect(o.is_hidden).toBe(i % 2 === 0 ? 1 : 0)
    }
  })
})

describe('F0192 saveAddonSettings（路由层集成）', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  /** 构造：画师 + 画风 + 尺寸 + 私有模板绑定（返回认证头与定位数据） */
  function setupScene(qq: string, subdomain: string) {
    const artist = seedArtist({ qq_number: qq, subdomain })
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 80 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id, is_enabled: false }])
    const row = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!
    const token = createSession(artist.id, artist.token_version)
    return { artist, style, size, tpl, row, headers: { Authorization: `Bearer ${token}` } }
  }

  it('TC-RT-F1-01: 未登录 → 401（payload 走 schema 合法形，过校验层后由 requireAuth 拦截）', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/artist/art-styles/1/addon-settings',
      payload: { styleAddonId: 1, sizeOverrides: [] }
    })
    expect(res.statusCode).toBe(401)
  })

  it('TC-RT-F1-02: 完整链路 → 200，返回聚合状态且库内四层生效', async () => {
    const { style, size, row, headers } = setupScene('77220', 'f0192-rt')

    const res = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/addon-settings`, headers,
      payload: {
        styleAddonId: row.id,
        templateDefaultPrice: 90,
        stylePriceOverride: 12,
        styleEnabled: true,
        sizeOverrides: [{ sizeId: size.id, priceOverride: 5, isHidden: false }]
      }
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // 聚合返回形状：addons + sizeOverrides（带 style_id）
    expect(Array.isArray(body.addons)).toBe(true)
    expect(body.sizeOverrides).toHaveLength(1)
    expect(body.sizeOverrides[0]).toMatchObject({ style_size_id: size.id, style_addon_id: row.id, price_override: 5, is_hidden: 0 })
    // 库内四层生效
    const rowAfter = styleService.getStyleAddons(style.id).find(r => r.id === row.id)!
    expect(rowAfter.is_enabled).toBe(1)
    expect(rowAfter.price_override).toBe(12)
  })

  it('TC-RT-F1-03: schema 拒绝——缺 styleAddonId / sizeOverrides 超 maxItems 50', async () => {
    const { style, row, headers } = setupScene('77221', 'f0192-schema')

    const missing = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/addon-settings`, headers,
      payload: { sizeOverrides: [] }
    })
    expect(missing.statusCode).toBe(400)

    const oversized = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/addon-settings`, headers,
      payload: {
        styleAddonId: row.id,
        sizeOverrides: Array.from({ length: 51 }, (_, i) => ({ sizeId: i + 1, priceOverride: null, isHidden: false }))
      }
    })
    expect(oversized.statusCode).toBe(400)
  })

  it('TC-RT-F1-04: 跨画师画风 → 404（requireOwnStyle 归属守卫）', async () => {
    const { style, row } = setupScene('77222', 'f0192-own1')
    const other = seedArtist({ qq_number: '77223', subdomain: 'f0192-own2' })
    const tokenOther = createSession(other.id, other.token_version)

    const res = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/addon-settings`,
      headers: { Authorization: `Bearer ${tokenOther}` },
      payload: { styleAddonId: row.id, sizeOverrides: [] }
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-RT-F1-05: percent 模板价非整数 → 服务端 VALIDATION 400（复用 updateAddonTemplate percent 整数约束）', async () => {
    const { artist, style, headers } = setupScene('77224', 'f0192-pct')
    const tpl = styleService.createAddonTemplate(artist.id, { name: '精细', category: 'add', price_mode: 'percent', default_price: 20 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const row = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!

    const res = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/addon-settings`, headers,
      payload: { styleAddonId: row.id, templateDefaultPrice: 12.5, sizeOverrides: [] }
    })
    expect(res.statusCode).toBe(400)
    // 整体回滚：模板价原样
    expect(styleService.getAddonTemplate(artist.id, tpl.id).default_price).toBe(20)
  })
})
