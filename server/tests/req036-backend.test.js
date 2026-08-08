import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import { buildApp } from '../src/app.js'
import * as styleService from '../src/features/pricing/style.service.js'
import * as stylePricingService from '../src/features/pricing/style-pricing.service.js'
import * as orderService from '../src/features/order/order.service.js'

// ============================================
// REQ-036 批B 后端核心测试
// 删除策略 C' / 尺寸三态 / kind 乘法项 / 内置模板种子 / locked 字段
// ============================================

function seedWorkflowStages(artistId) {
  const ins = db.prepare(
    'INSERT INTO artist_workflow_stages (artist_id, name, sort_order, takes_payment, basis_points) VALUES (?, ?, ?, 1, ?)'
  )
  ins.run(artistId, '定金', 1, 3000)
  ins.run(artistId, '尾款', 2, 7000)
}

/** 搭建标准场景：画师 + 画风 + 2尺寸 + 模板（含乘法项） */
function setupScene() {
  const artist = seedArtist({ qq_number: '99001', subdomain: 'req036' })
  seedWorkflowStages(artist.id)

  const tplSwitch = styleService.createAddonTemplate(artist.id, {
    name: '加背景', control_type: 'switch', pricing_mode: 'fixed', default_price: 150
  })
  const tplQty = styleService.createAddonTemplate(artist.id, {
    name: '加人', control_type: 'quantity', pricing_mode: 'per_unit', default_price: 100, unit_label: '人', max_quantity: 5
  })
  const tplMult = styleService.createAddonTemplate(artist.id, {
    name: '商用', control_type: 'switch', pricing_mode: 'fixed', default_price: 50, kind: 'multiply'
  })

  const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: true })
  const sizeHead = styleService.createStyleSize(artist.id, style.id, { name: '头像', base_price: 200 })
  const sizeShowcase = styleService.createStyleSize(artist.id, style.id, { name: '展示中', base_price: 300, display_status: 'showcase' })
  const sizeClosed = styleService.createStyleSize(artist.id, style.id, { name: '关闭中', base_price: 400, display_status: 'closed' })

  styleService.setStyleAddons(artist.id, style.id, [
    { addon_template_id: tplSwitch.id },
    { addon_template_id: tplQty.id },
    { addon_template_id: tplMult.id }
  ])
  const styleAddons = styleService.getStyleAddons(style.id)
  const saSwitch = styleAddons.find(a => a.addon_template_id === tplSwitch.id)
  const saQty = styleAddons.find(a => a.addon_template_id === tplQty.id)
  const saMult = styleAddons.find(a => a.addon_template_id === tplMult.id)

  return { artist, style, sizeHead, sizeShowcase, sizeClosed, tplSwitch, tplQty, tplMult, saSwitch, saQty, saMult }
}

// ─── 任务 1：删除策略 C'（保留独立增项 + 解除引用） ───

describe("REQ-036 C' 删除策略", () => {
  beforeEach(() => { cleanDb() })

  it('TC-R36-01: 删除被引用模板 → 返回 referenced N，画风内增项保留为独立增项', () => {
    const { artist, style, tplSwitch, saSwitch } = setupScene()
    const result = styleService.deleteAddonTemplate(artist.id, tplSwitch.id)
    expect(result.deleted).toBe(true)
    expect(result.referenced).toBe(1)

    const addons = styleService.getStyleAddons(style.id)
    const kept = addons.find(a => a.id === saSwitch.id)
    expect(kept).toBeTruthy()
    expect(kept.detached).toBeTruthy()
    expect(kept.addon_template_id).toBeNull()
    // 快照保留展示数据
    expect(kept.template_name).toBe('加背景')
    expect(kept.template_default_price).toBe(150)
    // 模板已删
    expect(() => styleService.getAddonTemplate(artist.id, tplSwitch.id)).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })

  it('TC-R36-02: 删除未引用模板 → referenced 0，直接删除', () => {
    const { artist } = setupScene()
    const tpl = styleService.createAddonTemplate(artist.id, { name: '孤儿' })
    const result = styleService.deleteAddonTemplate(artist.id, tpl.id)
    expect(result.referenced).toBe(0)
    expect(() => styleService.getAddonTemplate(artist.id, tpl.id)).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })

  it('TC-R36-03: 系统预置模板画师不可删/改（404）', () => {
    const { artist } = setupScene()
    const sys = styleService.getAddonTemplates(artist.id).find(t => t.artist_id === null)
    expect(sys).toBeTruthy()
    expect(() => styleService.deleteAddonTemplate(artist.id, sys.id)).toThrow('ADDON_TEMPLATE_NOT_FOUND')
    expect(() => styleService.updateAddonTemplate(artist.id, sys.id, { name: '篡改' })).toThrow('ADDON_TEMPLATE_NOT_FOUND')
  })

  it('TC-R36-04: 解绑后独立增项仍可计价（快照兜底）', () => {
    const { artist, sizeHead, tplSwitch, saSwitch } = setupScene()
    styleService.deleteAddonTemplate(artist.id, tplSwitch.id)
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saSwitch.id }]
    })
    expect(result.addonItems).toHaveLength(1)
    expect(result.addonItems[0].name).toBe('加背景')
    expect(result.addonItems[0].amount).toBe(150)
  })
})

// ─── 任务 2：尺寸三态后端校验 ───

describe('REQ-036 尺寸三态', () => {
  beforeEach(() => { cleanDb() })

  it('TC-R36-10: showcase 尺寸算价 → 400', () => {
    const { artist, sizeShowcase } = setupScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeShowcase.id })
    }).toThrow('STYLE_SIZE_NOT_AVAILABLE')
  })

  it('TC-R36-11: closed 尺寸算价 → 400', () => {
    const { artist, sizeClosed } = setupScene()
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeClosed.id })
    }).toThrow('STYLE_SIZE_NOT_AVAILABLE')
  })

  it('TC-R36-12: available 尺寸算价正常', () => {
    const { artist, sizeHead } = setupScene()
    const result = stylePricingService.calculateStylePrice(artist.id, { styleSizeId: sizeHead.id })
    expect(result.totalPrice).toBe(200)
  })

  it('TC-R36-13: showcase 尺寸下单 → 400（路由层）', async () => {
    const { sizeShowcase } = setupScene()
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/orders',
        payload: { subdomain: 'req036', clientQq: '99101', agreeRules: true, styleSizeId: sizeShowcase.id }
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('STYLE_SIZE_NOT_AVAILABLE')
    } finally { await app.close() }
  })

  it('TC-R36-14: closed 尺寸下单 → 400', async () => {
    const { sizeClosed } = setupScene()
    const app = await buildApp({ logger: false })
    await app.ready()
    try {
      const res = await app.inject({
        method: 'POST', url: '/api/orders',
        payload: { subdomain: 'req036', clientQq: '99102', agreeRules: true, styleSizeId: sizeClosed.id }
      })
      expect(res.statusCode).toBe(400)
    } finally { await app.close() }
  })

  it('TC-R36-15: 公开样式接口隐藏 closed 尺寸、透出 display_status', async () => {
    const { artist } = setupScene()
    const styles = styleService.getPublicStyles(artist.id)
    const sizeNames = styles[0].sizes.map(s => s.name)
    expect(sizeNames).toContain('头像')
    expect(sizeNames).toContain('展示中')
    expect(sizeNames).not.toContain('关闭中')
    const showcase = styles[0].sizes.find(s => s.name === '展示中')
    expect(showcase.display_status).toBe('showcase')
    const head = styles[0].sizes.find(s => s.name === '头像')
    expect(head.display_status).toBe('available')
  })
})

// ─── 任务 3：kind 维度（乘法项） ───

describe('REQ-036 kind 乘法项', () => {
  beforeEach(() => { cleanDb() })

  it('TC-R36-20: 乘法项 +50% → factor 1.5，总价 = 基础 × 1.5', () => {
    const { artist, sizeHead, saMult } = setupScene()
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saMult.id }]
    })
    expect(result.multiplyItems).toHaveLength(1)
    expect(result.multiplyItems[0].percent).toBe(50)
    expect(result.multiplyItems[0].factor).toBe(1.5)
    // 200 × 1.5 = 300（乘法项不进加法小计）
    expect(result.subtotal).toBe(200)
    expect(result.multiplierTotal).toBe(300)
    expect(result.totalPrice).toBe(300)
  })

  it('TC-R36-21: 加法项 + 乘法项组合 =（基础+加法）× 乘法因子', () => {
    const { artist, sizeHead, saSwitch, saMult } = setupScene()
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saSwitch.id }, { styleAddonId: saMult.id }]
    })
    // (200 + 150) × 1.5 = 525
    expect(result.subtotal).toBe(350)
    expect(result.multiplierTotal).toBe(525)
    expect(result.totalPrice).toBe(525)
  })

  it('TC-R36-22: 乘法项 + 用途倍率叠加', () => {
    const { artist, sizeHead, saMult } = setupScene()
    db.prepare('INSERT INTO price_multipliers (artist_id, type, name, multiplier, sort_order, enabled) VALUES (?, ?, ?, ?, 0, 1)')
      .run(artist.id, 'usage', '商用用途', 2.0)
    const um = db.prepare("SELECT id FROM price_multipliers WHERE artist_id = ? AND type = 'usage'").get(artist.id)
    const result = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saMult.id }],
      usageMultiplierId: um.id
    })
    // 200 × 1.5 × 2.0 = 600
    expect(result.multiplierTotal).toBe(600)
  })

  it('TC-R36-23: 乘法项下单 → quote_snapshot 含百分比 + breakdown 写增量', () => {
    const { artist, sizeHead, saMult } = setupScene()
    const order = orderService.createOrder({
      artistId: artist.id,
      styleSizeId: sizeHead.id,
      styleAddons: [{ styleAddonId: saMult.id }],
      clientQq: '99103'
    })
    expect(order.total_price_cents).toBe(30000)
    expect(order.quote_snapshot).toContain('商用+50%')
    const bd = db.prepare('SELECT * FROM order_price_breakdown WHERE order_id = ? ORDER BY sort_order ASC').all(order.id)
    const multRow = bd.find(r => r.item_name.includes('商用'))
    expect(multRow).toBeTruthy()
    expect(multRow.multiplier).toBe(1.5)
    expect(multRow.amount_cents).toBe(10000) // 200 × 0.5
  })
})

// ─── 任务 4：内置模板种子 + max_quantity ───

describe('REQ-036 内置模板种子', () => {
  beforeEach(() => { cleanDb() })

  it('TC-R36-30: 迁移后系统预置 5 个模板，全画师可见', () => {
    const artist = seedArtist({ qq_number: '99002', subdomain: 'seed1' })
    const sys = styleService.getAddonTemplates(artist.id).filter(t => t.artist_id === null)
    expect(sys).toHaveLength(5)
    const names = sys.map(t => t.name)
    expect(names).toContain('加人物')
    expect(names).toContain('背景')
    expect(names).toContain('机甲')
    expect(names).toContain('商用')
    expect(names).toContain('加急')
    // 乘法项语义：商用 +50% / 加急 +100%
    const comm = sys.find(t => t.name === '商用')
    expect(comm.kind).toBe('multiply')
    expect(comm.default_price).toBe(50)
    const rush = sys.find(t => t.name === '加急')
    expect(rush.kind).toBe('multiply')
    expect(rush.default_price).toBe(100)
  })

  it('TC-R36-31: 数量型模板 max_quantity 生效（超出上限拒绝）', () => {
    const { artist, sizeHead, saQty } = setupScene()
    // saQty max_quantity=5
    expect(() => {
      stylePricingService.calculateStylePrice(artist.id, {
        styleSizeId: sizeHead.id,
        addons: [{ styleAddonId: saQty.id, quantity: 6 }]
      })
    }).toThrow('VALIDATION')
    const ok = stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId: sizeHead.id,
      addons: [{ styleAddonId: saQty.id, quantity: 5 }]
    })
    expect(ok.addonItems[0].quantity).toBe(5)
  })

  it('TC-R36-32: 系统模板可被画师导入画风（setStyleAddons 允许）', () => {
    const { artist, style } = setupScene()
    const sys = styleService.getAddonTemplates(artist.id).find(t => t.name === '机甲')
    const result = styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: sys.id }])
    const added = result.find(a => a.addon_template_id === sys.id)
    expect(added.template_name).toBe('机甲')
  })
})

// ─── 任务 5：locked 字段 ───

describe('REQ-036 locked 字段（02F 遗留）', () => {
  beforeEach(() => { cleanDb() })

  it('TC-R36-40: getOrderInstallments 返回 locked/lockedReason', () => {
    const { artist, sizeHead } = setupScene()
    const order = orderService.createOrder({
      artistId: artist.id, styleSizeId: sizeHead.id, clientQq: '99104'
    })
    const insts = orderService.getOrderInstallments(order.id)
    expect(insts.length).toBeGreaterThan(0)
    for (const inst of insts) {
      expect(typeof inst.locked).toBe('boolean')
      expect('lockedReason' in inst).toBe(true)
    }
  })

  it('TC-R36-41: 已锁定节点透出 locked=true + reason', () => {
    const { artist, sizeHead } = setupScene()
    const order = orderService.createOrder({
      artistId: artist.id, styleSizeId: sizeHead.id, clientQq: '99105'
    })
    db.prepare("UPDATE order_payment_installments SET locked = 1, locked_reason = 'completed' WHERE order_id = ? LIMIT 1").run(order.id)
    const insts = orderService.getOrderInstallments(order.id)
    const lockedOne = insts.find(i => i.locked)
    expect(lockedOne).toBeTruthy()
    expect(lockedOne.lockedReason).toBe('completed')
  })
})
