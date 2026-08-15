// 815 剩余销账 M 路：三域消毒（M-1 order / M-2 style / M-3 compliance）+
// OG Host 反射与缓存投毒修复（M-4）
// 选档口径：所有字段经前端渲染面核实均为 {{ }} 插值/文本列 → sanitizeStoredText
//（纯文本档，零标签提取；& < > 零实体化，防双重转义误伤）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import * as orderService from '../src/features/order/order.service.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as complianceService from '../src/features/compliance/compliance.service.js'
import { buildOgMeta, clearOgCache } from '../src/features/og/og-meta.service.js'

const PREV_DOMAIN = process.env.DOMAIN

describe('M-1 order 域文本字段消毒（sanitizeStoredText）', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-M1-01: createOrder 的 client_name/description 恶意标签入库前清理', () => {
    const artist = seedArtist({ qq_number: '815101', subdomain: 'm1-order' })
    const order = orderService.createOrder({
      artistId: artist.id,
      clientQq: '111',
      clientName: '<script>alert(1)</script><img src=x onerror=alert(2)>小明',
      description: '<a href="javascript:alert(1)">详情</a><style>p{}</style>立绘'
    })
    expect(order.client_name).toBe('小明')
    expect(order.description).toBe('详情立绘')
  })

  it('TC-M1-02: addNote 备注恶意内容入库前清理', () => {
    const artist = seedArtist({ qq_number: '815102', subdomain: 'm1-note' })
    const order = orderService.createOrder({ artistId: artist.id, clientQq: '111' })
    orderService.addNote(order.id, '<script>alert(1)</script><a href="javascript:alert(2)">点我</a>备注')
    const note = db.prepare('SELECT content FROM order_notes WHERE order_id = ?').get(order.id)
    expect(note.content).toBe('点我备注')
  })

  it('TC-M1-03: 正常文本零误伤（价格<100 / R&D 原样保留）', () => {
    const artist = seedArtist({ qq_number: '815103', subdomain: 'm1-clean' })
    const order = orderService.createOrder({
      artistId: artist.id,
      clientQq: '111',
      clientName: 'R&D 同学',
      description: '价格<100 起，5<6 折再谈'
    })
    expect(order.client_name).toBe('R&D 同学')
    expect(order.description).toBe('价格<100 起，5<6 折再谈')

    orderService.addNote(order.id, '备注：价格<100 & R&D 已确认')
    const note = db.prepare('SELECT content FROM order_notes WHERE order_id = ?').get(order.id)
    expect(note.content).toBe('备注：价格<100 & R&D 已确认')
  })
})

describe('M-2 style 域文本字段消毒（sanitizeStoredText）', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '815201', subdomain: 'm2-style' })
  })

  it('TC-M2-01: 画风 name/description 创建+更新恶意内容清理', () => {
    const style = styleService.createArtStyle(artist.id, {
      name: '<script>alert(1)</script>日系',
      description: '<img src=x onerror=alert(1)>清新'
    })
    expect(style.name).toBe('日系')
    expect(style.description).toBe('清新')

    const updated = styleService.updateArtStyle(artist.id, style.id, {
      name: '<a href="javascript:alert(1)">厚涂</a>',
      description: '<style>p{}</style>质感'
    })
    expect(updated.name).toBe('厚涂')
    expect(updated.description).toBe('质感')
  })

  it('TC-M2-02: 尺寸 name/description 创建+更新恶意内容清理', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const size = styleService.createStyleSize(artist.id, style.id, {
      name: '<script>alert(1)</script>全身',
      base_price: 600,
      description: '<img src=x onerror=alert(1)>带背景'
    })
    expect(size.name).toBe('全身')
    expect(size.description).toBe('带背景')

    const updated = styleService.updateStyleSize(artist.id, style.id, size.id, {
      name: '<a href="javascript:alert(1)">半身</a>',
      description: '<style>p{}</style>简单'
    })
    expect(updated.name).toBe('半身')
    expect(updated.description).toBe('简单')
  })

  it('TC-M2-03: 增项模板 name/unit_label 创建+更新恶意内容清理', () => {
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '<script>alert(1)</script>背景',
      control_type: 'quantity',
      price_mode: 'fixed',
      default_price: 50,
      unit_label: '<img src=x onerror=alert(1)>张'
    })
    expect(tpl.name).toBe('背景')
    expect(tpl.unit_label).toBe('张')

    const updated = styleService.updateAddonTemplate(artist.id, tpl.id, {
      name: '<a href="javascript:alert(1)">精细</a>',
      unit_label: '<style>p{}</style>个'
    })
    expect(updated.name).toBe('精细')
    expect(updated.unit_label).toBe('个')
  })

  it('TC-M2-04: 解绑快照 tpl_name/tpl_unit_label 写入前清理（存量脏数据兜底）', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const rawTplId = Number(db.prepare(`
      INSERT INTO addon_templates
        (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity)
      VALUES (?, '<script>alert(1)</script>存量模板', 'switch', 'fixed', 10, '<img src=x onerror=alert(1)>张', 99, 'add', NULL)
    `).run(artist.id).lastInsertRowid)
    db.prepare('INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled) VALUES (?, ?, 1)')
      .run(style.id, rawTplId)

    styleService.deleteAddonTemplate(artist.id, rawTplId)
    const snap = db.prepare(
      'SELECT tpl_name, tpl_unit_label FROM style_addons WHERE art_style_id = ? AND addon_template_id IS NULL'
    ).get(style.id)
    expect(snap.tpl_name).toBe('存量模板')
    expect(snap.tpl_unit_label).toBe('张')
  })

  it('TC-M2-05: 正常文本零误伤（价格<100 / R&D 原样保留）', () => {
    const style = styleService.createArtStyle(artist.id, {
      name: '日系 R&D',
      description: '价格<100 起，全身 5<6 折'
    })
    expect(style.name).toBe('日系 R&D')
    expect(style.description).toBe('价格<100 起，全身 5<6 折')

    const size = styleService.createStyleSize(artist.id, style.id, {
      name: '全身<100',
      base_price: 600,
      description: 'R&D 与 5<6 折并存'
    })
    expect(size.name).toBe('全身<100')
    expect(size.description).toBe('R&D 与 5<6 折并存')

    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '背景 R&D',
      control_type: 'quantity',
      price_mode: 'fixed',
      default_price: 50,
      unit_label: '<100 张'
    })
    expect(tpl.name).toBe('背景 R&D')
    expect(tpl.unit_label).toBe('<100 张')
  })
})

describe('M-3 compliance 域文本字段消毒（sanitizeStoredText）', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-M3-01: 举报 description/contact 恶意内容入库前清理', () => {
    const report = complianceService.createReport({
      targetType: 'artist_home',
      targetId: 1,
      description: '<script>alert(1)</script>主页含违规内容',
      contact: '<img src=x onerror=alert(1)>QQ123'
    })
    expect(report.description).toBe('主页含违规内容')
    expect(report.contact).toBe('QQ123')
  })

  it('TC-M3-02: 处理留痕 reason 恶意内容入库前清理', () => {
    complianceService.writeAdminAction(1, 'report_resolve', 'report', 1, '<a href="javascript:alert(1)">违规</a>已核实')
    const action = db.prepare("SELECT reason FROM admin_actions WHERE action = 'report_resolve'").get()
    expect(action.reason).toBe('违规已核实')
  })

  it('TC-M3-03: 正常文本零误伤（价格<100 / R&D 原样保留）', () => {
    const report = complianceService.createReport({
      targetType: 'other',
      description: '价格<100 但服务低于预期 & R&D 项目',
      contact: 'R&D 群 QQ123'
    })
    expect(report.description).toBe('价格<100 但服务低于预期 & R&D 项目')
    expect(report.contact).toBe('R&D 群 QQ123')

    complianceService.writeAdminAction(1, 'report_resolve', 'report', 1, '备注：5<6 折 & 已处理')
    const action = db.prepare("SELECT reason FROM admin_actions WHERE action = 'report_resolve'").get()
    expect(action.reason).toBe('备注：5<6 折 & 已处理')
  })
})

describe('M-4 OG meta：Host 反射投毒面关闭', () => {
  beforeEach(() => {
    cleanDb()
    clearOgCache()
  })

  afterEach(() => {
    clearOgCache()
    if (PREV_DOMAIN === undefined) delete process.env.DOMAIN
    else process.env.DOMAIN = PREV_DOMAIN
  })

  it('TC-M4-01: 设 DOMAIN 时输出 canonical，且可正常缓存', () => {
    process.env.DOMAIN = 'inkglean.example'
    seedArtist({ qq_number: '815401', subdomain: 'm4-canonical', name: '墨鱼' })

    const first = buildOgMeta('m4-canonical', 'evil.example')
    expect(first.url).toBe('https://inkglean.example/artist/m4-canonical')
    expect(first.image).toBe('https://inkglean.example/assets/logo.webp')

    // DOMAIN 配置态仍走缓存（与既有缓存语义一致）
    db.prepare("UPDATE artists SET name = '新名' WHERE subdomain = 'm4-canonical'").run()
    const second = buildOgMeta('m4-canonical', 'evil.example')
    expect(second).toEqual(first)
  })

  it('TC-M4-02: 不设 DOMAIN 时回落 request.host，但回落值不缓存', () => {
    delete process.env.DOMAIN
    seedArtist({ qq_number: '815402', subdomain: 'm4-fallback', name: '回落画师' })

    const poisoned = buildOgMeta('m4-fallback', 'evil.example')
    expect(poisoned.url).toBe('https://evil.example/artist/m4-fallback')

    // 第二次用不同 Host：若回落值被缓存会复读 evil.example（投毒），正确行为是逐请求重算
    const clean = buildOgMeta('m4-fallback', 'good.example')
    expect(clean.url).toBe('https://good.example/artist/m4-fallback')
    expect(clean).not.toEqual(poisoned)
  })

  it('TC-M4-03: 不设 DOMAIN 时默认 OG 的回落值同样不缓存', () => {
    delete process.env.DOMAIN

    const poisoned = buildOgMeta('ghost', 'evil.example')
    expect(poisoned.url).toBe('https://evil.example/artist/ghost')

    const clean = buildOgMeta('ghost', 'good.example')
    expect(clean.url).toBe('https://good.example/artist/ghost')
  })
})
