// ============================================
// 开箱设置服务 - 初始化判定与管理（REQ-038）
// ============================================
import crypto from 'crypto'
import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { RESERVED_SUBDOMAINS } from '../../shared/validate.js'
import { generateSecret, buildOtpAuthUri, verifyTotpWithCounter, hashTotpCode } from '../auth/totp.js'
import { bindTotpInit, createSession, checkTotpLocked, registerTotpFailure } from '../auth/auth.service.js'
import { seedArtistStages } from '../artist/workflow.service.js'
import type { Artist } from '../../types/entities.js'

// ─── 初始化判定 ───

// ─── 812-B B7: 开箱预置基础增项 ───

interface DefaultAddonSpec {
  name: string
  category: 'usage' | 'rush'
  /** percent 计价：倍率 = (100 + percent) / 100（引擎口径，见 style-pricing.service.ts） */
  default_price: number
  sort_order: number
}

/** 默认增项（数值保守，管理员可在增项库修改）：
 *  用途：个人 ×1.0（0%）、商业 ×1.5（+50%）；加急：标准 ×1.0（0%）、加急 ×1.3（+30%） */
const DEFAULT_ADDON_TEMPLATES: DefaultAddonSpec[] = [
  { name: '个人用途', category: 'usage', default_price: 0, sort_order: 0 },
  { name: '商业用途', category: 'usage', default_price: 50, sort_order: 1 },
  { name: '标准', category: 'rush', default_price: 0, sort_order: 2 },
  { name: '加急', category: 'rush', default_price: 30, sort_order: 3 }
]

/**
 * 幂等预置默认增项（仅当增项表为空时写入，写入后回读校验行数与字段）
 * 系统预置模板（artist_id NULL）全画师共用，管理员可在增项库维护。
 * 历史教训：INSERT OR IGNORE 会静默吞 CHECK 违约——插入后必须回读确认。
 */
export function seedDefaultAddonTemplates(): number {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM addon_templates').get() as { c: number }).c
  if (count > 0) return count

  const insert = db.prepare(`
    INSERT INTO addon_templates (artist_id, name, control_type, price_mode, default_price, unit_label, sort_order, category, max_quantity)
    VALUES (NULL, ?, 'switch', 'percent', ?, NULL, ?, ?, NULL)
  `)
  for (const tpl of DEFAULT_ADDON_TEMPLATES) {
    insert.run(tpl.name, tpl.default_price, tpl.sort_order, tpl.category)
  }

  // 回读验证：行数与每条字段必须与预置完全一致，否则整体抛错（事务回滚）
  const rows = db.prepare(
    'SELECT name, category, control_type, price_mode, default_price, sort_order FROM addon_templates ORDER BY sort_order ASC, id ASC'
  ).all() as Array<{ name: string; category: string; control_type: string; price_mode: string; default_price: number; sort_order: number }>
  if (rows.length !== DEFAULT_ADDON_TEMPLATES.length) {
    throw new AppError('DEFAULT_ADDONS_SEED_FAILED', 500, `默认增项预置失败：回读行数 ${rows.length}，应为 ${DEFAULT_ADDON_TEMPLATES.length}`)
  }
  for (let i = 0; i < DEFAULT_ADDON_TEMPLATES.length; i++) {
    const expected = DEFAULT_ADDON_TEMPLATES[i]
    const row = rows[i]
    const ok = row.name === expected.name
      && row.category === expected.category
      && row.control_type === 'switch'
      && row.price_mode === 'percent'
      && row.default_price === expected.default_price
      && row.sort_order === expected.sort_order
    if (!ok) {
      throw new AppError('DEFAULT_ADDONS_SEED_FAILED', 500, `默认增项预置失败：第 ${i + 1} 条字段不符（${row.name}）`)
    }
  }
  return rows.length
}

/**
 * 是否已完成初始化
 * 判据：platform_config.admin_qq 非空 且 对应管理员画师存在 且 已绑定 TOTP（能登录）。
 * 用 totp_verified 而非 setup_completed 作为信号：
 *   - 存量部署（seed/迁移自举/手动建管理员）管理员已绑 TOTP → 判已初始化，升级不会被误导到 /setup；
 *   - 开箱向导在绑码（totp-confirm）前 totp_verified=0 → /setup 保持可达，向导中途刷新不被踢去登录页。
 */
export function isSetupCompleted(): boolean {
  const adminQqRow = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as { value: string } | undefined
  const adminQq = adminQqRow?.value || ''
  if (!adminQq) return false

  // 确认管理员画师存在（防止配置残留但画师被删）且已绑 TOTP（能登录）
  const admin = db.prepare('SELECT id, totp_verified FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(adminQq) as { id: number; totp_verified: number } | undefined
  if (!admin) return false
  if (!admin.totp_verified) return false

  return true
}

/**
 * 获取设置状态（公开端点）
 */
export function getSetupStatus(): { initialized: boolean; tokenRequired: boolean } {
  const initialized = isSetupCompleted()
  const tokenRequired = !initialized && !!process.env.SETUP_TOKEN
  return { initialized, tokenRequired }
}

/**
 * 检查是否处于 setup 模式（未初始化）
 * 供守卫中间件使用
 */
export function isSetupMode(): boolean {
  return !isSetupCompleted()
}

/**
 * 校验安装口令
 * SETUP_TOKEN 未设置时不需要口令；已设置时恒时比较
 */
export function validateSetupToken(token: string | undefined): boolean {
  const setupToken = process.env.SETUP_TOKEN
  if (!setupToken) return true // 未设置口令，不需要校验
  if (!token) return false
  // 恒时比较防时序攻击
  try {
    const a = Buffer.from(token)
    const b = Buffer.from(setupToken)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return token === setupToken
  }
}

// ─── 管理员创建 ───

export interface CreateAdminParams {
  token?: string
  qqNumber: string
  name: string
  studio?: {
    name: string
    subdomain: string
  }
}

export interface CreateAdminResult {
  artist: {
    id: number
    qqNumber: string
    name: string
    subdomain: string
    artistCode: string
  }
  totpSecret: string
  otpauthUri: string
  studio?: { id: number; name: string; subdomain: string }
}

/**
 * 创建管理员（事务内：创建管理员画师 + 写入 admin_qq + 可选创建工作室 + 生成 TOTP 密钥）
 * 未初始化时有效，已初始化返回 403
 */
export function createAdminArtist(params: CreateAdminParams): CreateAdminResult {
  if (isSetupCompleted()) {
    throw new AppError('SETUP_ALREADY_DONE', 403, '系统已完成初始化，开箱设置已禁用')
  }

  // d2 猎杀修复（2026-08-13）：admin_qq 已写入即拒重建——堵住「已建管理员但 TOTP 未确认」窗口的劫持重试；
  // 此前仅靠下游 subdomain='admin' 占用偶然拦截，脆弱；丢失密钥的恢复走 DB 级重置（见维护说明书）
  const existingAdminQq = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as { value: string } | undefined
  if (existingAdminQq?.value) {
    throw new AppError('SETUP_ALREADY_DONE', 403, '')
  }

  // 校验口令
  if (!validateSetupToken(params.token)) {
    throw new AppError('SETUP_TOKEN_INVALID', 403, '安装口令错误')
  }

  const { qqNumber, name, studio } = params

  // 校验 QQ 号格式
  if (!/^\d{5,15}$/.test(qqNumber)) {
    throw new AppError(E.QQ_FORMAT, 400)
  }

  return db.transaction((): CreateAdminResult => {
    // 1. 检查 QQ 是否已存在
    const existingQq = db.prepare('SELECT id FROM artists WHERE qq_number = ?').get(qqNumber) as { id: number } | undefined
    if (existingQq) {
      throw new AppError(E.QQ_TAKEN, 400, { qqNumber })
    }

    // 创建管理员画师（status='hidden'，首次绑定后需手动开启）
    const subdomain = 'admin'
    const artistCode = 'ADMIN'
    
    // 检查子域名冲突
    const existingSub = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get(subdomain) as { id: number } | undefined
    if (existingSub) {
      throw new AppError(E.SUBDOMAIN_TAKEN, 400, { subdomain })
    }
    // 检查身份码冲突
    const existingCode = db.prepare('SELECT id FROM artists WHERE artist_code = ?').get(artistCode) as { id: number } | undefined
    if (existingCode) {
      throw new AppError(E.CODE_TAKEN, 400, { code: artistCode })
    }

    const result = db.prepare(`
      INSERT INTO artists (qq_number, name, subdomain, artist_code, bio, status, contact_qq)
      VALUES (?, ?, ?, ?, ?, 'hidden', ?)
    `).run(qqNumber, name, subdomain, artistCode, '平台管理员', qqNumber)
    const artistId = Number(result.lastInsertRowid)

    // 初始化须知
    db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)').run(artistId, '')

    // 初始化默认工作流节点模板（与邀请建号/管理端建号同口径，817-B #1：开箱后管理员小店缺节点模板）
    seedArtistStages(artistId)

    // 2. 写入 platform_config.admin_qq
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(qqNumber)

    // 3. 可选：创建工作室
    let studioResult: { id: number; name: string; subdomain: string } | undefined
    if (studio) {
      const studioName = studio.name || `${name}的工作室`
      let studioSubdomain = studio.subdomain || 'admin'

      // 校验子域名格式（823 规则对齐批：去连字符，与建号/邀请同口径）
      if (!/^[a-z0-9]{2,20}$/.test(studioSubdomain)) {
        throw new AppError(E.SUBDOMAIN_FORMAT, 400)
      }
      // 保留词黑名单
      if (RESERVED_SUBDOMAINS.includes(studioSubdomain)) {
        throw new AppError(E.SUBDOMAIN_FORMAT, 400, { hint: `主页标识「${studioSubdomain}」为系统保留词，请换一个` })
      }
      // 检查子域名唯一性
      const existingStudioSub = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get(studioSubdomain) as { id: number } | undefined
      if (existingStudioSub) {
        throw new AppError(E.SUBDOMAIN_TAKEN, 400, { subdomain: studioSubdomain })
      }

      const studioCode = studioSubdomain.toUpperCase()
      const existingStudioCode = db.prepare('SELECT id FROM artists WHERE artist_code = ?').get(studioCode) as { id: number } | undefined
      if (existingStudioCode) {
        throw new AppError(E.CODE_TAKEN, 400, { code: studioCode })
      }

      // 更新管理员画师为工作室信息（管理员本人即为工作室）
      db.prepare('UPDATE artists SET name = ?, subdomain = ?, artist_code = ? WHERE id = ?').run(studioName, studioSubdomain, studioCode, artistId)

      studioResult = { id: artistId, name: studioName, subdomain: studioSubdomain }

    }
    // 4. 生成 TOTP 密钥并写入（未验证）
    const totpSecret = generateSecret()
    bindTotpInit(artistId, totpSecret)
    const otpauthUri = buildOtpAuthUri(totpSecret, qqNumber)

    return {
      artist: { id: artistId, qqNumber, name, subdomain, artistCode },
      totpSecret,
      otpauthUri,
      studio: studioResult
    }
  })()
}

// ─── TOTP 确认与完成 ───

export interface TotpConfirmParams {
  qqNumber: string
  code: string
}

export interface TotpConfirmResult {
  token: string
  artist: { id: number; name: string; subdomain: string; qqNumber: string }
  isAdmin: boolean
}

/**
 * 确认 TOTP 绑定并完成设置
 * 验证 6 位码 → 置 totp_verified=1 → 写 setup_completed=1 → 签发会话 cookie
 */
export function confirmTotpAndComplete(params: TotpConfirmParams): TotpConfirmResult {
  if (isSetupCompleted()) {
    throw new AppError('SETUP_ALREADY_DONE', 403, '系统已完成初始化')
  }

  const { qqNumber, code } = params

  // 查找管理员画师
  const artist = db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber) as Artist | undefined
  if (!artist) {
    throw new AppError(E.ARTIST_NOT_FOUND, 404)
  }

  // 必须已有 TOTP 密钥
  if (!artist.totp_secret) {
    throw new AppError(E.TOTP_NOT_BOUND, 400)
  }

  // 815 审计 P1-5：防爆破对齐登录路径——锁定期内任何尝试都拒绝；失败计数达阈值锁定
  checkTotpLocked(artist)

  // 验证 TOTP 码
  const hitCounter = verifyTotpWithCounter(artist.totp_secret, code, Date.now())
  if (hitCounter === null) {
    registerTotpFailure(artist.id) // 计数 +1，达阈值抛 TOTP_LOCKED
    throw new AppError(E.TOTP_BIND_INVALID, 400)
  }

  // 重放防护
  const codeHash = hashTotpCode(artist.id, code, hitCounter)
  try {
    db.prepare('INSERT INTO totp_used_codes (artist_id, code_hash) VALUES (?, ?)').run(artist.id, codeHash)
  } catch {
    throw new AppError(E.TOTP_BIND_INVALID, 400, '该动态口令已使用，请使用最新动态口令')
  }

  // 事务：标记已验证 + 完成设置 + 预置默认增项（812-B B7：仅空表时写入，失败整体回滚）
  db.transaction(() => {
    db.prepare('UPDATE artists SET totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?').run(artist.id)
    db.prepare("UPDATE platform_config SET value = '1' WHERE key = 'setup_completed'").run()
    seedDefaultAddonTemplates()
  })()

  // 签发会话
  const token = createSession(artist.id, artist.token_version)

  return {
    token,
    artist: {
      id: artist.id,
      name: artist.name,
      subdomain: artist.subdomain,
      qqNumber: artist.qq_number
    },
    isAdmin: true // 创建者一定是管理员
  }
}
