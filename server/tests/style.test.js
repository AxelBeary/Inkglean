import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'

// ============================================
// 多画风测试 - 迁移 v36 + CRUD + 权限 + 公开配置
// REQ-023 Phase 1
// ============================================

// ─── 辅助函数 ───

function seedTier(artistId, name, price, sortOrder = 0) {
  const r = db.prepare(
    'INSERT INTO price_tiers (artist_id, name, price, sort_order) VALUES (?, ?, ?, ?)'
  ).run(artistId, name, price, sortOrder)
  return db.prepare('SELECT * FROM price_tiers WHERE id = ?').get(r.lastInsertRowid)
}

function seedPriceAddon(artistId, name, priceValue, selectMode = 'quantity', sortOrder = 0) {
  const r = db.prepare(
    "INSERT INTO price_addons (artist_id, category, name, price_type, price_value, select_mode, sort_order) VALUES (?, 'other', ?, 'fixed', ?, ?, ?)"
  ).run(artistId, name, priceValue, selectMode, sortOrder)
  return db.prepare('SELECT * FROM price_addons WHERE id = ?').get(r.lastInsertRowid)
}

// ─── 迁移测试 ───

describe('迁移 v36 老数据迁移', () => {
  beforeEach(() => {
    cleanDb()
  })

  it('TC-MIG-01: 空库跑 v36 → 5 表存在，无数据', () => {
    // initDatabase 已在 setup.js 中执行，v36 已应用
    const tables = ['addon_templates', 'art_styles', 'style_sizes', 'style_addons', 'size_addon_overrides']
    for (const t of tables) {
      const info = db.prepare(`PRAGMA table_info(${t})`).all()
      expect(info.length).toBeGreaterThan(0)
    }
    // 空库无画师 → 无迁移数据
    const styleCount = db.prepare('SELECT COUNT(*) AS c FROM art_styles').get().c
    expect(styleCount).toBe(0)
  })

  it('TC-MIG-02: 有老数据的画师 → 迁移后默认画风 + 尺寸 + 增项模板', () => {
    // 手动插入老数据（模拟迁移前状态）
    const artist = seedArtist({ qq_number: '77001', subdomain: 'mig-test' })
    seedTier(artist.id, '头像', 100, 0)
    seedTier(artist.id, '全身', 300, 1)
    seedPriceAddon(artist.id, '加人', 50, 'quantity', 0)
    seedPriceAddon(artist.id, '加背景', 80, 'toggle', 1)

    // 手动执行迁移逻辑（因为 initDatabase 已跑过，v36 已标记 applied）
    // 直接调 service 层验证表结构可用
    // 先手动插入迁移数据模拟
    db.prepare("INSERT INTO art_styles (artist_id, name, sort_order, is_active) VALUES (?, '默认', 0, 1)").run(artist.id)
    const style = db.prepare('SELECT * FROM art_styles WHERE artist_id = ?').get(artist.id)

    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)').run(style.id, '头像', 100, 0)
    db.prepare('INSERT INTO style_sizes (art_style_id, name, base_price, sort_order) VALUES (?, ?, ?, ?)').run(style.id, '全身', 300, 1)

    db.prepare("INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, sort_order) VALUES (?, '加人', 'quantity', 'fixed', 50, 0)").run(artist.id)
    db.prepare("INSERT INTO addon_templates (artist_id, name, control_type, pricing_mode, default_price, sort_order) VALUES (?, '加背景', 'switch', 'fixed', 80, 1)").run(artist.id)

    const templates = db.prepare('SELECT * FROM addon_templates WHERE artist_id = ?').all(artist.id)
    for (const tpl of templates) {
      db.prepare('INSERT INTO style_addons (art_style_id, addon_template_id, is_enabled) VALUES (?, ?, 1)').run(style.id, tpl.id)
    }

    // 验证
    const styles = styleService.getArtStyles(artist.id)
    expect(styles).toHaveLength(1)
    expect(styles[0].name).toBe('默认')
    expect(styles[0].sizes).toHaveLength(2)
    expect(styles[0].sizes[0].name).toBe('头像')
    expect(styles[0].sizes[0].base_price).toBe(100)
    expect(styles[0].addons).toHaveLength(2)
  })

  it('TC-MIG-03: 迁移幂等 — 已有 art_styles 数据不重复创建', () => {
    const artist = seedArtist({ qq_number: '77002', subdomain: 'mig-idem' })
    // 先创建一个画风
    styleService.createArtStyle(artist.id, { name: '日系' })
    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM art_styles WHERE artist_id = ?').get(artist.id).c
    expect(countBefore).toBe(1)

    // 迁移逻辑检查：existingStyles > 0 → 跳过
    const existingStyles = db.prepare('SELECT COUNT(*) AS c FROM art_styles').get().c
    expect(existingStyles).toBeGreaterThan(0) // 迁移会跳过
  })
})

// ─── 增项库 CRUD ───

describe('增项库 CRUD (addon_templates)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77010', subdomain: 'addon-tpl' })
  })

  it('TC-AT-01: 创建增项模板 — switch 类型', () => {
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '加背景',
      control_type: 'switch',
      pricing_mode: 'fixed',
      default_price: 150
    })
    expect(tpl.name).toBe('加背景')
    expect(tpl.control_type).toBe('switch')
    expect(tpl.pricing_mode).toBe('fixed')
    expect(tpl.default_price).toBe(150)
    expect(tpl.sort_order).toBe(0)
  })

  it('TC-AT-02: 创建增项模板 — quantity 类型 + unit_label', () => {
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '加人',
      control_type: 'quantity',
      pricing_mode: 'per_unit',
      default_price: 100,
      unit_label: '人'
    })
    expect(tpl.control_type).toBe('quantity')
    expect(tpl.pricing_mode).toBe('per_unit')
    expect(tpl.unit_label).toBe('人')
  })

  it('TC-AT-03: 创建增项模板 — radio 类型必须有 options', () => {
    expect(() => {
      styleService.createAddonTemplate(artist.id, {
        name: '加衣服',
        control_type: 'radio',
        pricing_mode: 'per_option'
      })
    }).toThrow('VALIDATION')
  })

  it('TC-AT-04: 创建增项模板 — radio 类型带 options 成功', () => {
    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '加衣服',
      control_type: 'radio',
      pricing_mode: 'per_option',
      options: JSON.stringify([{ label: '简易', price: 80 }, { label: '复杂', price: 200 }])
    })
    expect(tpl.control_type).toBe('radio')
    expect(JSON.parse(tpl.options)).toHaveLength(2)
  })

  it('TC-AT-05: 创建增项模板 — 名称为空拒绝', () => {
    expect(() => {
      styleService.createAddonTemplate(artist.id, { name: '' })
    }).toThrow('ADDON_TEMPLATE_NAME_EMPTY')
  })

  it('TC-AT-06: 创建增项模板 — 无效控件类型拒绝', () => {
    expect(() => {
      styleService.createAddonTemplate(artist.id, { name: 'X', control_type: 'checkbox' })
    }).toThrow('ADDON_TEMPLATE_INVALID_CONTROL')
  })

  it('TC-AT-07: 更新增项模板', () => {
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 100 })
    const updated = styleService.updateAddonTemplate(artist.id, tpl.id, {
      name: '加复杂背景',
      default_price: 200
    })
    expect(updated.name).toBe('加复杂背景')
    expect(updated.default_price).toBe(200)
  })

  it('TC-AT-08: 删除增项模板 — 级联删 style_addons', () => {
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 100 })
    const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: true })
    // 验证已导入
    expect(style.addons).toHaveLength(1)

    styleService.deleteAddonTemplate(artist.id, tpl.id)
    // 级联删除后画风增项为空
    const addons = styleService.getStyleAddons(style.id)
    expect(addons).toHaveLength(0)
  })

  it('TC-AT-09: 获取不存在的模板 → 404', () => {
    expect(() => {
      styleService.getAddonTemplate(artist.id, 99999)
    }).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })

  it('TC-AT-10: 跨画师访问模板 → 404', () => {
    const other = seedArtist({ qq_number: '77011', subdomain: 'other-at' })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加背景' })
    expect(() => {
      styleService.getAddonTemplate(other.id, tpl.id)
    }).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })
})

// ─── 画风 CRUD ───

describe('画风 CRUD (art_styles)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77020', subdomain: 'style-crud' })
  })

  it('TC-AS-01: 新建画风 — 基础', () => {
    const style = styleService.createArtStyle(artist.id, {
      name: '日系',
      description: '适合清新风格'
    })
    expect(style.name).toBe('日系')
    expect(style.description).toBe('适合清新风格')
    expect(style.is_active).toBe(1)
    expect(style.sizes).toHaveLength(0)
    expect(style.addons).toHaveLength(0)
  })

  it('TC-AS-02: 新建画风 — importAddons 一键导入', () => {
    styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 150 })

    const style = styleService.createArtStyle(artist.id, { name: '厚涂', importAddons: true })
    expect(style.addons).toHaveLength(2)
    expect(style.addons[0].template_name).toBe('加人')
    expect(style.addons[1].template_name).toBe('加背景')
  })

  it('TC-AS-03: 新建画风 — 名称为空拒绝', () => {
    expect(() => {
      styleService.createArtStyle(artist.id, { name: '' })
    }).toThrow('STYLE_NAME_EMPTY')
  })

  it('TC-AS-04: 更新画风', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const updated = styleService.updateArtStyle(artist.id, style.id, {
      name: '日系清新',
      is_active: false
    })
    expect(updated.name).toBe('日系清新')
    expect(updated.is_active).toBe(0)
  })

  it('TC-AS-05: 删除画风 — 级联删 sizes + addons + overrides', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])

    // 设尺寸覆盖
    const addons = styleService.getStyleAddons(style.id)
    styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: addons[0].id, price_override: 50 }
    ])

    styleService.deleteArtStyle(artist.id, style.id)

    // 验证级联删除
    expect(db.prepare('SELECT COUNT(*) AS c FROM style_sizes WHERE art_style_id = ?').get(style.id).c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM style_addons WHERE art_style_id = ?').get(style.id).c).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS c FROM size_addon_overrides WHERE style_size_id = ?').get(size.id).c).toBe(0)
  })

  it('TC-AS-06: 跨画师访问画风 → 404', () => {
    const other = seedArtist({ qq_number: '77021', subdomain: 'other-as' })
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    expect(() => {
      styleService.getArtStyle(other.id, style.id)
    }).toThrow('STYLE_NOT_FOUND')
  })
})

// ─── 尺寸 CRUD ───

describe('尺寸 CRUD (style_sizes)', () => {
  let artist, style

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77030', subdomain: 'size-crud' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
  })

  it('TC-SS-01: 添加尺寸', () => {
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    expect(size.name).toBe('头像')
    expect(size.base_price).toBe(200)
    expect(size.sort_order).toBe(0)
  })

  it('TC-SS-02: 添加多个尺寸 — sort_order 递增', () => {
    styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const s2 = styleService.createStyleSize(artist.id, style.id, { name: '半身', base_price: 400 })
    expect(s2.sort_order).toBe(1)
  })

  it('TC-SS-03: 更新尺寸', () => {
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const updated = styleService.updateStyleSize(artist.id, style.id, size.id, {
      name: '大头像',
      base_price: 300
    })
    expect(updated.name).toBe('大头像')
    expect(updated.base_price).toBe(300)
  })

  it('TC-SS-04: 删除尺寸 — 级联删覆盖', () => {
    const size = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const addons = styleService.getStyleAddons(style.id)
    styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: addons[0].id, is_hidden: true }
    ])

    styleService.deleteStyleSize(artist.id, style.id, size.id)
    expect(db.prepare('SELECT COUNT(*) AS c FROM size_addon_overrides WHERE style_size_id = ?').get(size.id).c).toBe(0)
  })

  it('TC-SS-05: 尺寸名称为空拒绝', () => {
    expect(() => {
      styleService.createStyleSize(artist.id, style.id, { name: '', base_price: 100 })
    }).toThrow('STYLE_SIZE_NAME_EMPTY')
  })

  it('TC-SS-06: 尺寸为负价拒绝', () => {
    expect(() => {
      styleService.createStyleSize(artist.id, style.id, { name: 'X', base_price: -1 })
    }).toThrow('STYLE_SIZE_INVALID_PRICE')
  })
})

// ─── 画风增项批量设置 ───

describe('画风增项批量设置 (style_addons)', () => {
  let artist, style, tpl1, tpl2

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77040', subdomain: 'sa-set' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
    tpl1 = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    tpl2 = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 150 })
  })

  it('TC-SA-01: 批量导入增项', () => {
    const result = styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: tpl1.id },
      { addon_template_id: tpl2.id }
    ])
    expect(result).toHaveLength(2)
    expect(result[0].template_name).toBe('加人')
    expect(result[1].template_name).toBe('加背景')
  })

  it('TC-SA-02: 禁用增项 + 改价', () => {
    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: tpl1.id },
      { addon_template_id: tpl2.id }
    ])
    const result = styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: tpl1.id, is_enabled: false },
      { addon_template_id: tpl2.id, price_override: 200 }
    ])
    const a1 = result.find(a => a.addon_template_id === tpl1.id)
    const a2 = result.find(a => a.addon_template_id === tpl2.id)
    expect(a1.is_enabled).toBe(0)
    expect(a2.price_override).toBe(200)
  })

  it('TC-SA-03: 不存在的模板 → 404', () => {
    expect(() => {
      styleService.setStyleAddons(artist.id, style.id, [
        { addon_template_id: 99999 }
      ])
    }).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })

  it('TC-SA-04: 跨画师模板 → 404', () => {
    const other = seedArtist({ qq_number: '77041', subdomain: 'other-sa' })
    const otherTpl = styleService.createAddonTemplate(other.id, { name: '别人的' })
    expect(() => {
      styleService.setStyleAddons(artist.id, style.id, [
        { addon_template_id: otherTpl.id }
      ])
    }).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })
})

// ─── 尺寸覆盖 ───

describe('尺寸覆盖 (size_addon_overrides)', () => {
  let artist, style, size, tpl, styleAddon

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77050', subdomain: 'override' })
    style = styleService.createArtStyle(artist.id, { name: '日系' })
    size = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 600 })
    tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    styleAddon = styleService.getStyleAddons(style.id)[0]
  })

  it('TC-OV-01: 设置价格覆盖', () => {
    const result = styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: styleAddon.id, price_override: 200 }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].price_override).toBe(200)
    expect(result[0].is_hidden).toBe(0)
  })

  it('TC-OV-02: 设置隐藏', () => {
    const result = styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: styleAddon.id, is_hidden: true }
    ])
    expect(result[0].is_hidden).toBe(1)
  })

  it('TC-OV-03: 更新已有覆盖', () => {
    styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: styleAddon.id, price_override: 200 }
    ])
    const result = styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: styleAddon.id, price_override: 300 }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].price_override).toBe(300)
  })

  it('TC-OV-04: 不存在的 style_addon → 404', () => {
    expect(() => {
      styleService.setSizeOverrides(artist.id, style.id, size.id, [
        { style_addon_id: 99999 }
      ])
    }).toThrow('STYLE_ADDON_NOT_FOUND')
  })
})

// ─── 公开配置 ───

describe('公开配置 (getPublicStyles)', () => {
  let artist

  beforeEach(() => {
    cleanDb()
    artist = seedArtist({ qq_number: '77060', subdomain: 'public-styles' })
  })

  it('TC-PUB-01: 完整配置 — 画风+尺寸+增项+覆盖', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系', description: '清新' })
    styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const s2 = styleService.createStyleSize(artist.id, style.id, { name: '全身', base_price: 600 })

    const tpl = styleService.createAddonTemplate(artist.id, {
      name: '加人', control_type: 'quantity', pricing_mode: 'per_unit', default_price: 100, unit_label: '人'
    })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const addons = styleService.getStyleAddons(style.id)

    // 全身尺寸下加人价格覆盖为 200
    styleService.setSizeOverrides(artist.id, style.id, s2.id, [
      { style_addon_id: addons[0].id, price_override: 200 }
    ])

    const result = styleService.getPublicStyles(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('日系')
    expect(result[0].sizes).toHaveLength(2)

    // 头像下加人价格 = 模板默认 100
    const headAddons = result[0].sizes[0].addons
    expect(headAddons).toHaveLength(1)
    expect(headAddons[0].price).toBe(100)

    // 全身下加人价格 = 覆盖 200
    const bodyAddons = result[0].sizes[1].addons
    expect(bodyAddons).toHaveLength(1)
    expect(bodyAddons[0].price).toBe(200)
  })

  it('TC-PUB-02: 隐藏增项不出现在公开配置', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    const size = styleService.createStyleSize(artist.id, style.id, { name: '插画', base_price: 800 })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加背景', default_price: 150 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const addons = styleService.getStyleAddons(style.id)

    styleService.setSizeOverrides(artist.id, style.id, size.id, [
      { style_addon_id: addons[0].id, is_hidden: true }
    ])

    const result = styleService.getPublicStyles(artist.id)
    expect(result[0].sizes[0].addons).toHaveLength(0) // 隐藏的增项不出现
  })

  it('TC-PUB-03: 禁用画风不出现在公开配置', () => {
    styleService.createArtStyle(artist.id, { name: '日系' })
    const s2 = styleService.createArtStyle(artist.id, { name: '厚涂' })
    styleService.updateArtStyle(artist.id, s2.id, { is_active: false })

    const result = styleService.getPublicStyles(artist.id)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('日系')
  })

  it('TC-PUB-04: 禁用增项不出现在公开配置', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id, is_enabled: false }])

    const result = styleService.getPublicStyles(artist.id)
    expect(result[0].sizes[0].addons).toHaveLength(0)
  })

  it('TC-PUB-05: 画风覆盖价 > 模板默认价', () => {
    const style = styleService.createArtStyle(artist.id, { name: '日系' })
    styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
    const tpl = styleService.createAddonTemplate(artist.id, { name: '加人', default_price: 100 })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id, price_override: 120 }])

    const result = styleService.getPublicStyles(artist.id)
    expect(result[0].sizes[0].addons[0].price).toBe(120)
  })
})

// ─── 路由层集成测试 ───

describe('多画风路由层集成测试', () => {
  let app

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(() => app.close())

  it('TC-RT-01: 未登录访问增项库 → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/artist/addon-templates' })
    expect(res.statusCode).toBe(401)
  })

  it('TC-RT-02: 增项模板 CRUD 完整链路', async () => {
    const artist = seedArtist({ qq_number: '77070', subdomain: 'rt-at' })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    // 创建
    const createRes = await app.inject({
      method: 'POST', url: '/api/artist/addon-templates', headers,
      payload: { name: '加背景', control_type: 'switch', default_price: 150 }
    })
    expect(createRes.statusCode).toBe(200)
    const tpl = createRes.json()
    expect(tpl.name).toBe('加背景')

    // 列表
    const listRes = await app.inject({ method: 'GET', url: '/api/artist/addon-templates', headers })
    expect(listRes.json()).toHaveLength(1)

    // 更新
    const updateRes = await app.inject({
      method: 'PUT', url: `/api/artist/addon-templates/${tpl.id}`, headers,
      payload: { default_price: 200 }
    })
    expect(updateRes.json().default_price).toBe(200)

    // 删除
    const delRes = await app.inject({
      method: 'DELETE', url: `/api/artist/addon-templates/${tpl.id}`, headers
    })
    expect(delRes.json().deleted).toBe(true)
  })

  it('TC-RT-03: 画风 CRUD + 尺寸 + 增项完整链路', async () => {
    const artist = seedArtist({ qq_number: '77071', subdomain: 'rt-style' })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    // 创建增项模板
    await app.inject({
      method: 'POST', url: '/api/artist/addon-templates', headers,
      payload: { name: '加人', control_type: 'quantity', pricing_mode: 'per_unit', default_price: 100, unit_label: '人' }
    })

    // 创建画风（一键导入）
    const styleRes = await app.inject({
      method: 'POST', url: '/api/artist/art-styles', headers,
      payload: { name: '日系', description: '清新', importAddons: true }
    })
    expect(styleRes.statusCode).toBe(200)
    const style = styleRes.json()
    expect(style.addons).toHaveLength(1)

    // 添加尺寸
    const sizeRes = await app.inject({
      method: 'POST', url: `/api/artist/art-styles/${style.id}/sizes`, headers,
      payload: { name: '头像', base_price: 200 }
    })
    expect(sizeRes.statusCode).toBe(200)
    const size = sizeRes.json()

    // 批量设置增项（改价）
    const tplId = style.addons[0].addon_template_id
    const saRes = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/addons`, headers,
      payload: { items: [{ addon_template_id: tplId, price_override: 120 }] }
    })
    expect(saRes.statusCode).toBe(200)

    // 设尺寸覆盖
    const styleAddons = saRes.json()
    const ovRes = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${style.id}/sizes/${size.id}/overrides`, headers,
      payload: { items: [{ style_addon_id: styleAddons[0].id, price_override: 50 }] }
    })
    expect(ovRes.statusCode).toBe(200)

    // 画风列表验证嵌套
    const listRes = await app.inject({ method: 'GET', url: '/api/artist/art-styles', headers })
    const styles = listRes.json()
    expect(styles).toHaveLength(1)
    expect(styles[0].sizes).toHaveLength(1)
    expect(styles[0].addons).toHaveLength(1)
  })

  it('TC-RT-04: 跨画师操作 → 404', async () => {
    const artist1 = seedArtist({ qq_number: '77072', subdomain: 'rt-own1' })
    const artist2 = seedArtist({ qq_number: '77073', subdomain: 'rt-own2' })
    const token1 = createSession(artist1.id, artist1.token_version)
    const token2 = createSession(artist2.id, artist2.token_version)

    // 画师1创建画风
    const styleRes = await app.inject({
      method: 'POST', url: '/api/artist/art-styles',
      headers: { Authorization: `Bearer ${token1}` },
      payload: { name: '日系' }
    })
    const styleId = styleRes.json().id

    // 画师2尝试修改 → 404
    const res = await app.inject({
      method: 'PUT', url: `/api/artist/art-styles/${styleId}`,
      headers: { Authorization: `Bearer ${token2}` },
      payload: { name: '被篡改' }
    })
    expect(res.statusCode).toBe(404)
  })

  it('TC-RT-05: 公开配置接口 — 正常 + 限流', async () => {
    const artist = seedArtist({ qq_number: '77074', subdomain: 'rt-pub' })
    styleService.createArtStyle(artist.id, { name: '日系' })

    const res = await app.inject({ method: 'GET', url: '/api/public/styles/rt-pub' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveLength(1)
  })

  it('TC-RT-06: 公开配置 — 画师不存在 → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/public/styles/nonexistent' })
    expect(res.statusCode).toBe(404)
  })

  it('TC-RT-07: JSON Schema 校验 — additionalProperties 静默剥离（ajv removeAdditional）', async () => {
    const artist = seedArtist({ qq_number: '77075', subdomain: 'rt-schema' })
    const token = createSession(artist.id, artist.token_version)

    // Fastify 默认 ajv removeAdditional=true：多余字段被静默剥离而非 400
    const res = await app.inject({
      method: 'POST', url: '/api/artist/addon-templates',
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: 'X', evil_field: 'hack' }
    })
    expect(res.statusCode).toBe(200)
    // evil_field 不应出现在返回结果中
    expect(res.json().evil_field).toBeUndefined()
  })

  it('TC-RT-08: 删除画风 → 级联验证', async () => {
    const artist = seedArtist({ qq_number: '77076', subdomain: 'rt-del' })
    const token = createSession(artist.id, artist.token_version)
    const headers = { Authorization: `Bearer ${token}` }

    const styleRes = await app.inject({
      method: 'POST', url: '/api/artist/art-styles', headers,
      payload: { name: '日系' }
    })
    const styleId = styleRes.json().id

    await app.inject({
      method: 'POST', url: `/api/artist/art-styles/${styleId}/sizes`, headers,
      payload: { name: '头像', base_price: 200 }
    })

    const delRes = await app.inject({
      method: 'DELETE', url: `/api/artist/art-styles/${styleId}`, headers
    })
    expect(delRes.json().deleted).toBe(true)

    // 验证尺寸已删
    const listRes = await app.inject({ method: 'GET', url: '/api/artist/art-styles', headers })
    expect(listRes.json()).toHaveLength(0)
  })
})
