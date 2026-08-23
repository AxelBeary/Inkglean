import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, cleanDb, seedArtist, type ArtistRow } from './setup.js'
import { initDatabase } from '../src/db/init.js'
import { isSetupCompleted, getSetupStatus, validateSetupToken, createAdminArtist, confirmTotpAndComplete, seedDefaultAddonTemplates } from '../src/features/setup/setup.service.js'
import { computeTotp } from '../src/features/auth/totp.js'

const ORIGINAL_SETUP_TOKEN = process.env.SETUP_TOKEN

// 本文件用到的数据库行局部类型
interface ConfigRow { value: string }
interface CountRow { c: number }
interface StageTemplateRow { name: string; sort_order: number; takes_payment: number; basis_points: number }
interface AddonTemplateSeedRow { name: string; category: string; control_type: string; price_mode: string; default_price: number; sort_order: number; artist_id: number | null }

describe('REQ-038 开箱设置 (Setup)', () => {

  beforeEach(() => {
    cleanDb()
    // 每次测试前重新初始化数据库（确保 platform_config 有默认值）
    initDatabase(db)
    // 确保 setup_completed 为空
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'setup_completed'").run()
    db.prepare("UPDATE platform_config SET value = '' WHERE key = 'admin_qq'").run()
  })

  afterEach(() => {
    // 恢复环境变量
    if (ORIGINAL_SETUP_TOKEN === undefined) {
      delete process.env.SETUP_TOKEN
    } else {
      process.env.SETUP_TOKEN = ORIGINAL_SETUP_TOKEN
    }
  })

  // ─── 初始化判定 ───

  it('TC-SETUP-01: 全新系统 isSetupCompleted 返回 false', () => {
    expect(isSetupCompleted()).toBe(false)
  })

  it('TC-SETUP-02: 有 admin_qq 但管理员画师不存在 返回 false', () => {
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    expect(isSetupCompleted()).toBe(false)
  })

  it('TC-SETUP-03: 有 admin_qq 且管理员存在但未绑 TOTP 返回 false（向导中途保护）', () => {
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    // 会话门禁批：显式造未绑定态（seedArtist 默认已绑定）
    seedArtist({ qq_number: '10001', subdomain: 'admin', totp_secret: null, totp_verified: 0 })
    expect(isSetupCompleted()).toBe(false)
  })

  it('TC-SETUP-03b: 有 admin_qq 且管理员存在且已绑 TOTP 返回 true', () => {
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    seedArtist({ qq_number: '10001', subdomain: 'admin' })
    db.prepare("UPDATE artists SET totp_verified = 1 WHERE qq_number = '10001'").run()
    expect(isSetupCompleted()).toBe(true)
  })

  it('TC-SETUP-04: getSetupStatus 返回初始化状态和口令要求', () => {
    // 无 SETUP_TOKEN 时 tokenRequired=false
    delete process.env.SETUP_TOKEN
    let status = getSetupStatus()
    expect(status).toEqual({ initialized: false, tokenRequired: false })

    // 有 SETUP_TOKEN 时 tokenRequired=true
    process.env.SETUP_TOKEN = 'testtoken123'
    status = getSetupStatus()
    expect(status).toEqual({ initialized: false, tokenRequired: true })
  })

  // ─── 口令校验 ───

  it('TC-SETUP-05: 未设置 SETUP_TOKEN 时任何口令都通过', () => {
    delete process.env.SETUP_TOKEN
    expect(validateSetupToken(undefined)).toBe(true)
    expect(validateSetupToken('')).toBe(true)
    expect(validateSetupToken('anything')).toBe(true)
  })

  it('TC-SETUP-06: 设置 SETUP_TOKEN 后必须正确口令', () => {
    process.env.SETUP_TOKEN = 'mytoken123'
    expect(validateSetupToken(undefined)).toBe(false)
    expect(validateSetupToken('')).toBe(false)
    expect(validateSetupToken('wrong')).toBe(false)
    expect(validateSetupToken('mytoken123')).toBe(true)
  })

  // ─── 创建管理员 ───

  it('TC-SETUP-07: 创建管理员画师并写入 admin_qq', () => {
    const result = createAdminArtist({
      qqNumber: '10001',
      name: '测试管理员'
    })
    expect(result.artist).toBeDefined()
    expect(result.artist.qqNumber).toBe('10001')
    expect(result.artist.name).toBe('测试管理员')
    expect(result.totpSecret).toBeTruthy()
    expect(result.otpauthUri).toContain('10001')

    // 验证数据库
    const adminQq = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as ConfigRow
    expect(adminQq.value).toBe('10001')

    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '10001'").get() as ArtistRow
    expect(artist).toBeDefined()
    expect(artist.name).toBe('测试管理员')
    expect(artist.status).toBe('hidden')
    expect(artist.totp_secret).toBeTruthy()
    expect(artist.totp_verified).toBe(0)
  })

  it('TC-SETUP-08: 创建管理员时同时创建工作室', () => {
    const result = createAdminArtist({
      qqNumber: '10002',
      name: '管理员兼画师',
      studio: { name: '我的画室', subdomain: 'myart' }
    })
    expect(result.studio).toBeDefined()
    expect(result.studio!.name).toBe('我的画室')
    expect(result.studio!.subdomain).toBe('myart')

    // 验证管理员画师存在（工作室即为管理员本人）
    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '10002'").get() as ArtistRow
    expect(artist).toBeDefined()
    expect(artist.name).toBe('我的画室')
    expect(artist.subdomain).toBe('myart')
  })

  // ─── 817-B #1: 开箱后管理员小店需载入默认工作流节点模板 ───

  it('TC-SETUP-08b: 创建管理员后默认工作流节点模板已载入（与邀请/管理端建号同口径）', () => {
    const result = createAdminArtist({
      qqNumber: '10002',
      name: '测试管理员'
    })

    const stages = db.prepare(
      'SELECT name, sort_order, takes_payment, basis_points FROM artist_workflow_stages WHERE artist_id = ? ORDER BY sort_order ASC'
    ).all(result.artist.id) as StageTemplateRow[]

    expect(stages).toHaveLength(7)
    expect(stages.map(s => s.name)).toEqual(['定稿', '排期确认', '草稿确认', '线稿确认', '上色确认', '完稿确认', '交付'])
    expect(stages.map(s => s.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(stages.filter(s => s.takes_payment === 1).map(s => s.basis_points)).toEqual([3000, 7000])
  })

  it('TC-SETUP-08c: 开箱完成后节点模板保持 7 条不重复（seedArtistStages 幂等）', () => {
    const result = createAdminArtist({
      qqNumber: '10002',
      name: '测试管理员'
    })
    const code = computeTotp(result.totpSecret, Date.now())
    confirmTotpAndComplete({ qqNumber: '10002', code })

    const count = db.prepare('SELECT COUNT(*) AS c FROM artist_workflow_stages WHERE artist_id = ?')
      .get(result.artist.id) as CountRow
    expect(count.c).toBe(7)
  })

  it('TC-SETUP-09: 已初始化后创建管理员返回 403', () => {
    // 模拟已完成初始化（管理员存在且已绑 TOTP）
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    seedArtist({ qq_number: '10001', subdomain: 'admin' })
    db.prepare("UPDATE artists SET totp_verified = 1 WHERE qq_number = '10001'").run()

    expect(() => createAdminArtist({
      qqNumber: '10002',
      name: '另一个管理员'
    })).toThrow('SETUP_ALREADY_DONE')
  })

  it('TC-SETUP-09b: d2 猎杀——admin_qq 已写入但未确认 TOTP 时重建管理员拒绝 403（防劫持窗口）', () => {
    // 模拟合法方已调 setup/admin（admin_qq 已写、管理员存在但 TOTP 未确认）
    db.prepare("UPDATE platform_config SET value = '10001' WHERE key = 'admin_qq'").run()
    seedArtist({ qq_number: '10001', subdomain: 'admin' })
    db.prepare("UPDATE artists SET totp_verified = 0 WHERE qq_number = '10001'").run()

    // 攻击方换 QQ 重试必须被拒（此前窗口内仅靠 subdomain 占用偶然拦截）
    expect(() => createAdminArtist({
      qqNumber: '20002',
      name: '劫持尝试'
    })).toThrow('SETUP_ALREADY_DONE')
  })

  it('TC-SETUP-10: 口令错误时创建管理员拒绝', () => {
    process.env.SETUP_TOKEN = 'validtoken'
    expect(() => createAdminArtist({
      token: 'wrongtoken',
      qqNumber: '10001',
      name: '测试管理员'
    })).toThrow('SETUP_TOKEN_INVALID')
  })

  // ─── TOTP 确认流程 ───

  it('TC-SETUP-11: TOTP 确认流程完成设置', () => {
    const result = createAdminArtist({
      qqNumber: '10003',
      name: '测试管理员'
    })

    // 用密钥生成有效动态码
    const code = computeTotp(result.totpSecret, Date.now())

    const confirmResult = confirmTotpAndComplete({
      qqNumber: '10003',
      code
    })

    expect(confirmResult.token).toBeTruthy()
    expect(confirmResult.artist.qqNumber).toBe('10003')
    expect(confirmResult.isAdmin).toBe(true)

    // 验证数据库
    const artist = db.prepare("SELECT * FROM artists WHERE qq_number = '10003'").get() as ArtistRow
    expect(artist.totp_verified).toBe(1)
    const setupDone = db.prepare("SELECT value FROM platform_config WHERE key = 'setup_completed'").get() as ConfigRow
    expect(setupDone.value).toBe('1')
  })

  it('TC-SETUP-12: 无效动态码拒绝', () => {
    createAdminArtist({
      qqNumber: '10004',
      name: '测试管理员'
    })

    expect(() => confirmTotpAndComplete({
      qqNumber: '10004',
      code: '000000'
    })).toThrow('TOTP_BIND_INVALID')
  })

  it('TC-SETUP-13: 完成后再次确认返回 403', () => {
    const result = createAdminArtist({
      qqNumber: '10005',
      name: '测试管理员'
    })

    const code = computeTotp(result.totpSecret, Date.now())
    confirmTotpAndComplete({ qqNumber: '10005', code })

    // 再次确认应失败
    expect(() => confirmTotpAndComplete({
      qqNumber: '10005',
      code: computeTotp(result.totpSecret, Date.now() + 60000)
    })).toThrow('SETUP_ALREADY_DONE')
  })

  // ─── 812-B B7: 开箱预置基础增项 ───

  it('TC-SETUP-B7-01: setup 完成后增项表含 4 条默认档', () => {
    const result = createAdminArtist({
      qqNumber: '10006',
      name: '测试管理员'
    })
    const code = computeTotp(result.totpSecret, Date.now())
    confirmTotpAndComplete({ qqNumber: '10006', code })

    const rows = db.prepare(
      'SELECT name, category, control_type, price_mode, default_price, sort_order, artist_id FROM addon_templates ORDER BY sort_order ASC, id ASC'
    ).all() as AddonTemplateSeedRow[]
    expect(rows).toHaveLength(4)
    expect(rows.map(r => r.name)).toEqual(['个人用途', '商业用途', '标准', '加急'])
    expect(rows.map(r => r.category)).toEqual(['usage', 'usage', 'rush', 'rush'])
    expect(rows.map(r => r.default_price)).toEqual([0, 50, 0, 30])
    expect(rows.map(r => r.sort_order)).toEqual([0, 1, 2, 3])
    expect(rows.every(r => r.control_type === 'switch' && r.price_mode === 'percent' && r.artist_id === null)).toBe(true)
  })

  it('TC-SETUP-B7-02: 二次补种不重复插入（幂等断言）', () => {
    expect(seedDefaultAddonTemplates()).toBe(4)
    // 表已非空 → 直接返回现有行数，不追加
    expect(seedDefaultAddonTemplates()).toBe(4)
    expect((db.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as CountRow).c).toBe(4)

    // 存在画师自定义增项时同样不再插入
    const artist = seedArtist()
    db.prepare(
      "INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity) VALUES (?, '自定义增项', 'switch', 'fixed', 10, NULL, 99, 'add', NULL)"
    ).run(artist.id)
    expect(seedDefaultAddonTemplates()).toBe(5)
    expect((db.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as CountRow).c).toBe(5)
  })
})
