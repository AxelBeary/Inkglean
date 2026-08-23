import crypto from 'crypto'
import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { isValidArtistCode } from '../../shared/validate.js'
import { RESERVED_SUBDOMAINS } from '../../shared/validate.js'
import { seedArtistStages } from '../artist/workflow.service.js'
import { bindTotpInit, createSession, checkTotpLocked, registerTotpFailure, TOTP_MAX_ATTEMPTS } from '../auth/auth.service.js'
import { generateSecret, buildOtpAuthUri, verifyTotpWithCounter, hashTotpCode } from '../auth/totp.js'
import type { Artist } from '../../types/entities.js'

// ============================================
// 邀请码注册服务（REQ-039）
// ============================================

/** 码字符表：8 位大写字母数字，去易混淆 0/O/1/I（用户拍板） */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/** 批量生成上限（技术契约 1≤N≤50） */
export const INVITE_BATCH_MAX = 50
/** 默认有效期天数（用户拍板：默认 3 天） */
export const INVITE_DEFAULT_VALID_DAYS = 3
/** 有效期范围（1-30 天） */
export const INVITE_VALID_DAYS_MAX = 30
/** 每码可用次数上限（用户拍板：封顶 100，不设无限次） */
export const INVITE_MAX_USES_MAX = 100
/** 管理端列表分页默认/上限 */
export const INVITE_PAGE_SIZE_DEFAULT = 20
export const INVITE_PAGE_SIZE_MAX = 100

/** invite_codes 行（SQLite 实体列） */
export interface InviteCodeRow {
  id: number
  code: string
  status: 'unused' | 'used' | 'revoked'
  expires_at: string
  created_by: number | null
  used_by_artist_id: number | null
  used_at: string | null
  created_at: string
  max_uses: number
  use_count: number
}

/** 管理端列表行（LEFT JOIN 最近使用人） */
export interface InviteCodeListItem extends InviteCodeRow {
  used_by_name: string | null
  used_by_subdomain: string | null
  used_by_qq: string | null
}

/** 管理端列表筛选口径：expired = status 仍 unused 但已过期（派生态，不入库） */
export type InviteCodeStatusFilter = 'unused' | 'used' | 'revoked' | 'expired'

export interface InviteCodeListQuery {
  status?: InviteCodeStatusFilter
  q?: string
  page?: number
  pageSize?: number
}

/** invite_code_uses 明细行（JOIN 使用人） */
export interface InviteCodeUseRow {
  artist_id: number
  name: string | null
  qq_number: string | null
  subdomain: string | null
  used_at: string
}

// ─── 入驻模式 ───

/** 入驻模式是否开启（platform_config.onboarding_mode == 'invite'，REQ-038 写值） */
export function isInviteOnboardingEnabled(): boolean {
  const row = db.prepare("SELECT value FROM platform_config WHERE key = 'onboarding_mode'").get() as { value: string } | undefined
  return row?.value === 'invite'
}

/** GET /api/invite/status 响应 */
export function getInviteStatus(): { enabled: boolean } {
  return { enabled: isInviteOnboardingEnabled() }
}

// ─── 码生成 ───

/** crypto 随机生成单个 8 位码（拒绝 0/O/1/I） */
function generateOneCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]
  }
  return code
}

/**
 * 批量生成邀请码（事务内插入，码唯一冲突时重试；UNIQUE 约束为最终兜底）
 * @param count 1-50
 * @param validDays 1-30，默认 3
 * @param maxUses 每码可用次数 1-100，默认 1（一次性，旧语义不变）
 * @param createdBy 管理员画师 id
 */
export function generateInviteCodes(count: number, validDays: number = INVITE_DEFAULT_VALID_DAYS, maxUses: number = 1, createdBy: number | null = null): InviteCodeRow[] {
  if (!Number.isInteger(count) || count < 1 || count > INVITE_BATCH_MAX) {
    throw new AppError(E.VALIDATION, 400, { field: 'count', hint: `count 须为 1-${INVITE_BATCH_MAX} 的整数` })
  }
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > INVITE_VALID_DAYS_MAX) {
    throw new AppError(E.VALIDATION, 400, { field: 'validDays', hint: `validDays 须为 1-${INVITE_VALID_DAYS_MAX} 的整数` })
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > INVITE_MAX_USES_MAX) {
    throw new AppError(E.VALIDATION, 400, { field: 'maxUses', hint: `maxUses 须为 1-${INVITE_MAX_USES_MAX} 的整数` })
  }

  // 过期时间统一 ISO 8601（UTC），service 层用 JS Date 比较
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()

  return db.transaction((): InviteCodeRow[] => {
    const insert = db.prepare(
      'INSERT INTO invite_codes (code, status, expires_at, created_by, max_uses) VALUES (?, ?, ?, ?, ?)'
    )
    const rows: InviteCodeRow[] = []
    // 去重集合：一次请求内不允许出现重复码（crypto 冲突概率极低，仍防御）
    const seen = new Set<string>()
    for (let i = 0; i < count; i++) {
      let code = generateOneCode()
      let guard = 0
      while (seen.has(code) || db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(code)) {
        code = generateOneCode()
        if (++guard > 20) throw new AppError('INTERNAL', 500)
      }
      seen.add(code)
      const result = insert.run(code, 'unused', expiresAt, createdBy, maxUses)
      rows.push({
        id: Number(result.lastInsertRowid),
        code,
        status: 'unused',
        expires_at: expiresAt,
        created_by: createdBy,
        used_by_artist_id: null,
        used_at: null,
        created_at: '',
        max_uses: maxUses,
        use_count: 0
      })
    }
    return rows
  })()
}

// ─── 列表 / 吊销 ───

/** 状态筛选 → SQL WHERE 片段（expired 为派生态：unused 且已到期） */
function statusFilterClause(status: InviteCodeStatusFilter | undefined, nowIso: string): { clause: string; params: string[] } {
  switch (status) {
    case 'unused':
      return { clause: "AND c.status = 'unused' AND c.expires_at > ?", params: [nowIso] }
    case 'expired':
      return { clause: "AND c.status = 'unused' AND c.expires_at <= ?", params: [nowIso] }
    case 'used':
      return { clause: "AND c.status = 'used'", params: [] }
    case 'revoked':
      return { clause: "AND c.status = 'revoked'", params: [] }
    default:
      return { clause: '', params: [] }
  }
}

/**
 * 管理端列表：码 + 状态 + 过期 + 最近使用人（LEFT JOIN artists）
 * 支持状态筛选（含派生态 expired）、码模糊搜索、服务端分页；total 同口径计数供前端分页器
 */
export function listInviteCodes(query: InviteCodeListQuery = {}): { rows: InviteCodeListItem[]; total: number } {
  const nowIso = new Date().toISOString()
  const { clause, params } = statusFilterClause(query.status, nowIso)

  // 码模糊搜索：统一大写匹配（存储恒大写）；转义 LIKE 元字符防注入歧义
  let qClause = ''
  const qParams: string[] = []
  if (query.q && query.q.trim()) {
    const escaped = query.q.trim().toUpperCase().replace(/[\\%_]/g, m => `\\${m}`)
    qClause = 'AND c.code LIKE ? ESCAPE \'\\\''
    qParams.push(`%${escaped}%`)
  }

  const page = Math.max(1, Math.trunc(query.page ?? 1))
  const pageSize = Math.min(INVITE_PAGE_SIZE_MAX, Math.max(1, Math.trunc(query.pageSize ?? INVITE_PAGE_SIZE_DEFAULT)))

  const where = `WHERE 1 = 1 ${clause} ${qClause}`
  const allParams = [...params, ...qParams]

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM invite_codes c ${where}`).get(...allParams) as { c: number }).c
  const rows = db.prepare(`
    SELECT c.*, a.name AS used_by_name, a.subdomain AS used_by_subdomain, a.qq_number AS used_by_qq
    FROM invite_codes c
    LEFT JOIN artists a ON a.id = c.used_by_artist_id
    ${where}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ? OFFSET ?
  `).all(...allParams, pageSize, (page - 1) * pageSize) as InviteCodeListItem[]

  return { rows, total }
}

/** 单张码的使用明细（invite_code_uses JOIN 使用人，按使用时间倒序）；码不存在 → NOT_FOUND */
export function listInviteCodeUses(id: number): InviteCodeUseRow[] {
  const row = db.prepare('SELECT id FROM invite_codes WHERE id = ?').get(id) as { id: number } | undefined
  if (!row) throw new AppError(E.NOT_FOUND, 404, { id })
  return db.prepare(`
    SELECT u.artist_id, a.name, a.qq_number, a.subdomain, u.used_at
    FROM invite_code_uses u
    LEFT JOIN artists a ON a.id = u.artist_id
    WHERE u.invite_code_id = ?
    ORDER BY u.used_at DESC, u.id DESC
  `).all(id) as InviteCodeUseRow[]
}

/** 吊销：仅 unused 可吊销；不存在/已用/已吊销统一走错误码 */
export function revokeInviteCode(id: number): InviteCodeRow {
  const row = db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id) as InviteCodeRow | undefined
  if (!row) throw new AppError(E.NOT_FOUND, 404, { id })
  if (row.status !== 'unused') {
    throw new AppError(E.INVITE_CANNOT_REVOKE, 400, { id, status: row.status })
  }
  db.prepare("UPDATE invite_codes SET status = 'revoked' WHERE id = ? AND status = 'unused'").run(id)
  return db.prepare('SELECT * FROM invite_codes WHERE id = ?').get(id) as InviteCodeRow
}

// ─── 注册（公开） ───

/**
 * 校验邀请码：不存在 / 非 unused / 已过期 → 同一错误码 INVITE_INVALID（防枚举，技术契约）
 * 返回行供注册事务内二次消费
 */
export function validateInviteCode(code: string): InviteCodeRow {
  // 大小写不敏感（存储恒为大写；注册入口已 normalize，此处双保险）
  const row = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code.trim().toUpperCase()) as InviteCodeRow | undefined
  if (!row || row.status !== 'unused' || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AppError(E.INVITE_INVALID, 400)
  }
  return row
}

export interface InviteRegisterParams {
  code: string
  qqNumber: string
  name: string
  subdomain: string
}

export interface InviteRegisterResult {
  otpauthUri: string
  qqNumber: string
}

/**
 * 邀请码注册（同步事务，对齐 REQ-038 createAdminArtist 同款模式——better-sqlite3 不支持
 * async 事务函数，createArtist 内部有 await 不可入事务，故在此按 createArtist 校验口径逐条
 * 复刻：子域名格式/身份码格式与唯一性/QQ 唯一性/子域名唯一性，三步写入同事务）：
 * 校验码 → 建号（hidden，不上客户端目录）→ bindTotpInit 生成未验证密钥
 * → 条件消费码（并发双花防护，改动 0 行即回滚）。
 */
export function registerWithInvite(params: InviteRegisterParams): InviteRegisterResult {
  if (!isInviteOnboardingEnabled()) {
    throw new AppError(E.ONBOARDING_DISABLED, 400)
  }

  const code = params.code.trim().toUpperCase()
  const subdomain = params.subdomain.trim().toLowerCase()
  const name = params.name.trim()
  const qqNumber = params.qqNumber.trim()

  // 子域名保留词黑名单（与管理员手动建号同口径；错误码沿用 SUBDOMAIN_FORMAT 语义）
  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    throw new AppError(E.SUBDOMAIN_FORMAT, 400, { hint: `主页标识「${subdomain}」为系统保留词，请换一个` })
  }

  return db.transaction((): InviteRegisterResult => {
    // 1. 校验邀请码（失败与码不存在同响应 INVITE_INVALID，防枚举）
    const codeRow = validateInviteCode(code)

    // 2. 子域名格式 + 身份码（= 子域名大写，与 artistService.createArtist 同口径；823 规则对齐批：去连字符）
    if (!/^[a-z0-9]{2,20}$/.test(subdomain)) {
      throw new AppError(E.SUBDOMAIN_FORMAT)
    }
    const artistCode = subdomain.toUpperCase()
    if (!isValidArtistCode(artistCode)) {
      throw new AppError(E.CODE_FORMAT)
    }
    const existingCode = db.prepare('SELECT id FROM artists WHERE artist_code = ?').get(artistCode) as { id: number } | undefined
    if (existingCode) {
      throw new AppError(E.CODE_TAKEN, 400, { code: artistCode })
    }

    // 3. QQ / 子域名唯一性预检（与 artistService.createArtist 同口径，避免 UNIQUE 约束 500）
    const existingQq = db.prepare('SELECT id FROM artists WHERE qq_number = ?').get(qqNumber) as { id: number } | undefined
    if (existingQq) {
      throw new AppError(E.QQ_TAKEN, 400, { qqNumber })
    }
    const existingSub = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get(subdomain) as { id: number } | undefined
    if (existingSub) {
      throw new AppError(E.SUBDOMAIN_TAKEN, 400, { subdomain })
    }

    // 4. 建号（status='hidden'：CHECK 约束无 'closed' 值，与 REQ-038 管理员建号同口径，
    //    hidden = 不上客户端目录；画师登录后自己开启）
    const result = db.prepare(`
      INSERT INTO artists (qq_number, name, subdomain, artist_code, bio, status)
      VALUES (?, ?, ?, ?, ?, 'hidden')
    `).run(qqNumber, name, subdomain, artistCode, null)
    const artistId = Number(result.lastInsertRowid)

    // 初始化空的约稿须知 + 默认工作流（与 artistService.createArtist 三步写入对齐）
    db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)').run(artistId, '')
    seedArtistStages(artistId)

    // 5. 生成 TOTP 密钥并写入（未验证；totp-confirm 后置 verified=1 并签发会话）
    const totpSecret = generateSecret()
    bindTotpInit(artistId, totpSecret)

    // 6. 消费码额度（条件 UPDATE 防并发超卖：额度未满才 +1，用满置 used；改动 0 行 → 抛 INVITE_INVALID 回滚建号）
    const nowIso = new Date().toISOString()
    const consume = db.prepare(`
      UPDATE invite_codes
      SET use_count = use_count + 1,
          used_by_artist_id = ?,
          used_at = ?,
          status = CASE WHEN use_count + 1 >= max_uses THEN 'used' ELSE status END
      WHERE id = ? AND status = 'unused' AND use_count < max_uses
    `).run(artistId, nowIso, codeRow.id)
    if (consume.changes !== 1) {
      throw new AppError(E.INVITE_INVALID, 400)
    }
    // 明细留痕：谁在何时用了这张码（管理端使用记录名单）
    db.prepare('INSERT INTO invite_code_uses (invite_code_id, artist_id, used_at) VALUES (?, ?, ?)').run(codeRow.id, artistId, nowIso)

    const otpauthUri = buildOtpAuthUri(totpSecret, qqNumber)
    return { otpauthUri, qqNumber }
  })()
}

// ─── TOTP 首绑确认（公开，签发会话） ───

export interface InviteTotpConfirmParams {
  qqNumber: string
  code: string
}

export interface InviteTotpConfirmResult {
  token: string
  artist: { id: number; name: string; subdomain: string; qqNumber: string }
  isAdmin: boolean
}

/**
 * TOTP 首绑确认（对齐 REQ-038 confirmTotpAndComplete 同款模式）：
 * 校验 6 位码 + 重放防护 → totp_verified=1 → 签发会话 token。
 * 仅允许已生成密钥但未验证的画师（invite 注册 / 管理员预绑未确认均可完成首绑）。
 */
export function confirmInviteTotp(params: InviteTotpConfirmParams): InviteTotpConfirmResult {
  const { qqNumber, code } = params
  const artist = db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber) as Artist | undefined
  if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)
  if (!artist.totp_secret || artist.totp_verified) {
    throw new AppError(E.TOTP_NOT_BOUND, 400)
  }

  // 815 审计 P1-5：防爆破对齐登录路径——锁定期内任何尝试都拒绝；失败计数达阈值锁定
  checkTotpLocked(artist)

  const hitCounter = verifyTotpWithCounter(artist.totp_secret, code, Date.now())
  if (hitCounter === null) {
    registerTotpFailure(artist.id) // 计数 +1，达阈值抛 TOTP_LOCKED
    // v126②：区分「码刚轮换」（落在 ±3 但不在有效窗 ±1）与「码输错」——只影响提示文案，不放宽校验；
    // 新手常见因不熟 30 秒轮换机制报旧码，明示「等它转完再试」降低恐慌
    const stale = verifyTotpWithCounter(artist.totp_secret, code, Date.now(), 3) !== null
    // v126③：锁定前失败提示携带剩余次数（registerTotpFailure 未达阈值不抛，此处回读计数）
    const attempts = (db.prepare('SELECT totp_failed_attempts FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number }).totp_failed_attempts || 0
    const remainingAttempts = Math.max(0, TOTP_MAX_ATTEMPTS - attempts)
    throw new AppError(E.TOTP_BIND_INVALID, 400, { stale, remainingAttempts })
  }

  // 重放防护：同一 (画师, 时间步, 码) 只准成功一次（v48 totp_used_codes 唯一索引）
  const codeHash = hashTotpCode(artist.id, code, hitCounter)
  try {
    db.prepare('INSERT INTO totp_used_codes (artist_id, code_hash) VALUES (?, ?)').run(artist.id, codeHash)
  } catch {
    throw new AppError(E.TOTP_BIND_INVALID, 400, '该动态口令已使用，请使用最新动态口令')
  }

  db.prepare('UPDATE artists SET totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?').run(artist.id)

  const token = createSession(artist.id, artist.token_version)
  return {
    token,
    artist: {
      id: artist.id,
      name: artist.name,
      subdomain: artist.subdomain,
      qqNumber: artist.qq_number
    },
    // 邀请入驻者恒非管理员（admin 由 qq_number == admin_qq 判定，注册时不可能命中）
    isAdmin: false
  }
}
