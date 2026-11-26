import { describe, it, expect, beforeEach } from 'vitest'
import { db, cleanDb, seedArtist } from './setup.js'
import type { ArtistRow } from './setup.js'
import { createSession } from '../src/features/auth/auth.service.js'
import * as styleService from '../src/features/pricing/style.service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 815 第三批 I 路：系统增项模板管理端点
// 语义：冻结（默认，旧价写入 NULL override 引用行）/ 同步（NULL 行跟随，已覆盖行不动）/
//       删除守卫（只删 artist_id IS NULL；FK SET NULL + 快照保留）
// ============================================

/** 设置管理员：写 platform_config + 返回管理员画师行 */
function setAdmin(qqNumber: string) {
  db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)
  return seedArtist({ qq_number: qqNumber, subdomain: `admin-${qqNumber.slice(-4)}` })
}

/** 管理员 token（step-up 已升级，30 分钟窗口内） */
function adminToken(artist: ArtistRow) {
  return createSession(artist.id, artist.token_version, {
    authLevel: 'admin_verified',
    adminVerifiedAt: Date.now() as unknown as string
  })
}

describe('系统增项模板管理 (Admin Addon Templates)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  /** 建一个管理员 + 一个画师画风（测试各自再建模板/引用） */
  function setupScene() {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '20002', subdomain: 'artist-a' })
    const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: false })
    return { admin, artist, style }
  }

  async function createSystemTpl(payload: Record<string, unknown>, admin: ArtistRow) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/addon-templates',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload
    })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  it('TC-AT-01: 冻结语义 — 旧价写入 NULL override 引用行，已覆盖行不动，模板价更新', async () => {
    const { admin, artist, style } = setupScene()
    const tpl = await createSystemTpl({
      name: '商用(系统)', control_type: 'switch', price_mode: 'percent', default_price: 50, category: 'usage'
    }, admin)
    const styleB = styleService.createArtStyle(artist.id, { name: '厚涂', importAddons: false })

    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: tpl.id }
    ])
    styleService.setStyleAddons(artist.id, styleB.id, [
      { addon_template_id: tpl.id, price_override: 30 }
    ])
    // 断言按模板 id 精确定位（不依赖总行数——v49 seed 的内置模板可能共存）
    const rows = styleService.getStyleAddons(style.id)
    const nullRow = rows.find(r => r.addon_template_id === tpl.id && r.price_override === null)!
    expect(nullRow).toBeTruthy()
    const overriddenRow = styleService.getStyleAddons(styleB.id).find(r => r.price_override === 30)!
    expect(overriddenRow).toBeTruthy()

    // sync 缺省 → 冻结
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { default_price: 60 }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().default_price).toBe(60)

    const after = styleService.getStyleAddons(style.id)
    const afterNull = after.find(r => r.id === nullRow.id)!
    const afterOverride = styleService.getStyleAddons(styleB.id).find(r => r.id === overriddenRow.id)!
    expect(afterNull.price_override).toBe(50) // 旧模板价入 override
    expect(afterOverride.price_override).toBe(30) // 已覆盖行不碰
  })

  it('TC-AT-02: 同步语义 — NULL 引用行跟随新价，已覆盖行不动', async () => {
    const { admin, artist, style } = setupScene()
    const tpl = await createSystemTpl({
      name: '加急(系统)', control_type: 'switch', price_mode: 'percent', default_price: 100, category: 'rush'
    }, admin)
    const styleB = styleService.createArtStyle(artist.id, { name: '厚涂', importAddons: false })

    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: tpl.id }
    ])
    styleService.setStyleAddons(artist.id, styleB.id, [
      { addon_template_id: tpl.id, price_override: 80 }
    ])
    const rows = styleService.getStyleAddons(style.id)
    const nullRow = rows.find(r => r.price_override === null)!
    const overriddenRow = styleService.getStyleAddons(styleB.id).find(r => r.price_override === 80)!

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { default_price: 130, sync: true }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().default_price).toBe(130)

    const after = styleService.getStyleAddons(style.id)
    expect(after.find(r => r.id === nullRow.id)!.price_override).toBeNull() // 跟随模板
    expect(styleService.getStyleAddons(styleB.id).find(r => r.id === overriddenRow.id)!.price_override).toBe(80) // 已覆盖行不碰
  })

  it('TC-AT-03: 删除守卫 — 画师私有模板/不存在模板 404，系统模板删除后引用行快照保留并解绑', async () => {
    const { admin, artist, style } = setupScene()
    const sysTpl = await createSystemTpl({
      name: '背景(系统)', control_type: 'switch', price_mode: 'fixed', default_price: 150, category: 'add'
    }, admin)
    const artistTpl = styleService.createAddonTemplate(artist.id, {
      name: '画师私有', control_type: 'switch', price_mode: 'fixed', default_price: 10, category: 'add'
    })
    styleService.setStyleAddons(artist.id, style.id, [
      { addon_template_id: sysTpl.id },
      { addon_template_id: artistTpl.id }
    ])

    // 画师私有模板不可经系统端点删（404，防误删）
    const forbidden = await app.inject({
      method: 'DELETE',
      url: `/api/admin/addon-templates/${artistTpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(forbidden.statusCode).toBe(404)
    expect(db.prepare('SELECT id FROM addon_templates WHERE id = ?').get(artistTpl.id)).toBeTruthy()

    // 不存在的模板 404
    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/admin/addon-templates/999999',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(missing.statusCode).toBe(404)

    // 系统模板删除成功：FK SET NULL + 快照保留（独立增项不丢）
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/addon-templates/${sysTpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(del.statusCode).toBe(200)
    expect(del.json()).toMatchObject({ deleted: true, referenced: 1 })
    const detached = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === null)!
    expect(detached).toBeTruthy()
    expect(detached.template_name).toBe('背景(系统)')
    expect(detached.template_default_price).toBe(150)
    expect(detached.template_price_mode).toBe('fixed')
  })

  it('TC-AT-04: 列表只含系统模板且带引用计数；非管理员 403', async () => {
    const { admin, artist, style } = setupScene()
    const sysTpl = await createSystemTpl({
      name: '商用(系统)', control_type: 'switch', price_mode: 'percent', default_price: 50, category: 'usage'
    }, admin)
    styleService.createAddonTemplate(artist.id, {
      name: '画师私有', control_type: 'switch', price_mode: 'fixed', default_price: 10, category: 'add'
    })
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: sysTpl.id }])

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/addon-templates',
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(res.statusCode).toBe(200)
    const list = res.json()
    expect(list.every((t: Record<string, unknown>) => t.artist_id === null)).toBe(true)
    expect(list.some((t: Record<string, unknown>) => t.name === '画师私有')).toBe(false)
    expect(list.find((t: Record<string, unknown>) => t.id === sysTpl.id).referenced).toBe(1)

    // 非管理员访问系统模板端点 403
    const pleb = seedArtist({ qq_number: '30003', subdomain: 'pleb' })
    const denied = await app.inject({
      method: 'GET',
      url: '/api/admin/addon-templates',
      headers: { Authorization: `Bearer ${adminToken(pleb)}` }
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().code).toBe('ADMIN_REQUIRED')
  })
})

// ═══ B7 批次（F0103/F0104/F0105）：冻结补计价模式守卫 / 删除三步事务 / 写入口消毒 ═══

describe('B7 系统增项模板三缺口', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    cleanDb()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  function setupScene() {
    const admin = setAdmin('10001')
    const artist = seedArtist({ qq_number: '20002', subdomain: 'artist-a' })
    const style = styleService.createArtStyle(artist.id, { name: '日系', importAddons: false })
    return { admin, artist, style }
  }

  async function createSystemTpl(payload: Record<string, unknown>, admin: ArtistRow) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/addon-templates',
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload
    })
    expect(res.statusCode).toBe(200)
    return res.json()
  }

  it('TC-B7-AT-01: F0103 冻结模式下改 price_mode 被拒（有引用行）', async () => {
    const { admin, artist, style } = setupScene()
    // fixed ¥50 → 想单独改成 percent +50：所有绑定行会从 50 元变成 +50%
    const tpl = await createSystemTpl({
      name: '加购(系统)', control_type: 'switch', price_mode: 'fixed', default_price: 50, category: 'add'
    }, admin)
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const beforeRow = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { price_mode: 'percent' }
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('ADDON_TEMPLATE_MODE_LOCKED')
    expect(res.json().detail.referenced).toBe(1)

    // 模板与引用行原样未动（无半态）
    const tplAfter = db.prepare('SELECT price_mode FROM addon_templates WHERE id = ?').get(tpl.id) as { price_mode: string }
    expect(tplAfter.price_mode).toBe('fixed')
    const rowAfter = styleService.getStyleAddons(style.id).find(r => r.id === beforeRow.id)!
    expect(rowAfter.price_override).toBeNull() // 冻结快照未写（模式本来冻结不了，直接拒绝）
  })

  it('TC-B7-AT-02: F0103 sync=true 显式同步下改 price_mode 放行（引用行跟随）', async () => {
    const { admin, artist, style } = setupScene()
    const tpl = await createSystemTpl({
      name: '加购(系统)', control_type: 'switch', price_mode: 'fixed', default_price: 50, category: 'add'
    }, admin)
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const beforeRow = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { price_mode: 'percent', sync: true }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().price_mode).toBe('percent')
    // 同步语义：NULL 行不写 override，跟随模板
    const rowAfter = styleService.getStyleAddons(style.id).find(r => r.id === beforeRow.id)!
    expect(rowAfter.price_override).toBeNull()
  })

  it('TC-B7-AT-03: F0103 无引用行的模板自由改 price_mode', async () => {
    const { admin } = setupScene()
    const tpl = await createSystemTpl({
      name: '孤板(系统)', control_type: 'switch', price_mode: 'fixed', default_price: 20, category: 'add'
    }, admin)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { price_mode: 'percent', default_price: 15 }
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().price_mode).toBe('percent')
  })

  it('TC-B7-AT-04: F0104 删除三步同事务——DELETE 中途抛错整体回滚，无半态', async () => {
    const { admin, artist, style } = setupScene()
    const tpl = await createSystemTpl({
      name: '背景(系统)', control_type: 'switch', price_mode: 'fixed', default_price: 150, category: 'add'
    }, admin)
    styleService.setStyleAddons(artist.id, style.id, [{ addon_template_id: tpl.id }])
    const beforeRow = styleService.getStyleAddons(style.id).find(r => r.addon_template_id === tpl.id)!

    // 注入失败：让最后一步 DELETE 抛错（快照/解绑已先行执行）
    db.exec(`
      CREATE TRIGGER b7_fake_delete_fail BEFORE DELETE ON addon_templates
      BEGIN SELECT RAISE(ABORT, 'B7_SIMULATED_DELETE_FAILURE'); END
    `)
    const failed = await app.inject({
      method: 'DELETE',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(failed.statusCode).toBe(500) // ABORT 经全局错误处理回落 500
    db.exec('DROP TRIGGER b7_fake_delete_fail')

    // 事务回滚：模板仍在、引用行仍绑定、快照列未写入（不是「已解绑但模板还在」的半态）
    expect(db.prepare('SELECT id FROM addon_templates WHERE id = ?').get(tpl.id)).toBeTruthy()
    const rowAfter = styleService.getStyleAddons(style.id).find(r => r.id === beforeRow.id)!
    expect(rowAfter.addon_template_id).toBe(tpl.id)
    // tpl_name 是原始快照列（template_name 是 join 展示列，绑定行恒有值，不能作判据）
    const rawSnap = db.prepare('SELECT tpl_name FROM style_addons WHERE id = ?').get(beforeRow.id) as { tpl_name: string | null }
    expect(rawSnap.tpl_name).toBeNull()

    // 撤除障碍后同一请求路径正常删除
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` }
    })
    expect(del.statusCode).toBe(200)
    expect(del.json()).toMatchObject({ deleted: true, referenced: 1 })
  })

  it('TC-B7-AT-05: F0105 系统模板 name/unit_label 写入消毒（对齐画师侧）', async () => {
    const { admin } = setupScene()
    const tpl = await createSystemTpl({
      name: '<b>加粗</b>模板<img src=x>', control_type: 'quantity', price_mode: 'fixed',
      default_price: 10, category: 'add', unit_label: '<i>张</i>'
    }, admin)
    // create 路径：name/unit_label 均消毒入库
    expect(tpl.name).toBe('加粗模板')
    expect(tpl.unit_label).toBe('张')

    // update 路径：换上带标记的值同样消毒
    const upd = await app.inject({
      method: 'PUT',
      url: `/api/admin/addon-templates/${tpl.id}`,
      headers: { Authorization: `Bearer ${adminToken(admin)}` },
      payload: { name: '<script>x</script>新名', unit_label: '<u>件</u>' }
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().name).toBe('新名')
    expect(upd.json().unit_label).toBe('件')
  })
})
