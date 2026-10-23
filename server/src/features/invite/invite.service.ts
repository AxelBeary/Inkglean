import crypto from 'crypto'
import db from '../../db/connection.js'
import { AppError, E } from '../../shared/errors.js'
import { isValidArtistCode } from '../../shared/validate.js'
import { RESERVED_SUBDOMAINS } from '../../shared/validate.js'
import { seedArtistStages } from '../artist/workflow.service.js'
import { bindTotpInit, createSession, checkTotpLocked, registerTotpFailure } from '../auth/auth.service.js'
import { getAdminQq } from '../../shared/middleware/auth.js'
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

    // 3. QQ 唯一性 + 空壳账号判定：该 QQ 名下若为「从未完成 TOTP 绑定」的空壳账号
    //    （totp_verified=0 且 totp_secret IS NULL 且未删除未封禁），允许用新邀请码推倒重来；
    //    P0-1 修复（2026-09-17）：加 totp_secret IS NULL 条件——已生成过密钥的号不再是空壳，
    //    防止攻击者持他人 QQ + 新邀请码覆盖已注册但未确认的账号。
    //    其余情况（已验证/已删除/已封禁）维持 QQ_TAKEN。
    const existingQq = db.prepare('SELECT * FROM artists WHERE qq_number = ?').get(qqNumber) as Artist | undefined

    // GHSA-6pf3 修复①（最高优先·管理员全面接管窗口）：管理员 QQ 一律禁止走邀请注册。
    //   风险：管理员若曾自助 reset（resetTotp → totp_secret=NULL/verified=0），其行会落入上面的
    //   「空壳」判定被邀请码原地覆盖（保 artist_id）；覆盖后攻击者完成首绑即持有 qq_number==admin_qq
    //   的账号，经 requireAdmin 动态判定（shared/middleware/auth.ts）拿下全平台管理接口。
    //   即便 admin_qq 已配置但库中暂无对应行，也应拒绝（否则会 INSERT 出一个 admin QQ 的新画师，同样接管）。
    //   对外响应复用 QQ_TAKEN（同码同文案同 detail），与「QQ 已被注册」不可区分，不新增枚举 oracle。
    //   位置在 validateInviteCode 之后：无效码无论配何 QQ 都先命中 INVITE_INVALID，不泄露管理员 QQ。
    if (qqNumber === getAdminQq()) {
      throw new AppError(E.QQ_TAKEN, 400, { qqNumber })
    }

    // GHSA-6pf3 修复②（高·预建画师号接管）：收紧空壳覆盖语义——只允许覆盖「邀请流程自产」的行。
    //   artistService.createArtist 不写 totp_secret（artist-account.service.ts），管理员预建号天然满足
    //   「空壳」三条件，旧逻辑下攻击者持该号 QQ + 任一新邀请码即可原地覆盖（保 artist_id）接管预建画师号。
    //   判据：invite_code_uses 有该 artist 记录 = 确由 registerWithInvite 事务入库（含「受邀入驻后被 reset
    //   需重推倒重来」的合法场景，该记录永不删）；无记录 → 属管理员预建/他源，拒绝覆盖，按 QQ_TAKEN
    //   回（与「QQ 已被注册」不可区分）。合法首次邀请入驻走 INSERT 分支，不受本约束影响。
    const shellCandidate = existingQq && !existingQq.totp_verified && !existingQq.totp_secret && !existingQq.deleted_at && !existingQq.is_banned
      ? existingQq
      : undefined
    const shell = shellCandidate && db.prepare('SELECT id FROM invite_code_uses WHERE artist_id = ?').get(shellCandidate.id)
      ? shellCandidate
      : undefined
    if (existingQq && !shell) {
      throw new AppError(E.QQ_TAKEN, 400, { qqNumber })
    }

    // 身份码/子域名碰撞：与空壳自身相同合法（覆盖复用），与其他账号冲突照旧报错（避免 UNIQUE 约束 500）
    const existingCode = db.prepare('SELECT id FROM artists WHERE artist_code = ?').get(artistCode) as { id: number } | undefined
    if (existingCode && existingCode.id !== shell?.id) {
      throw new AppError(E.CODE_TAKEN, 400, { code: artistCode })
    }
    const existingSub = db.prepare('SELECT id FROM artists WHERE subdomain = ?').get(subdomain) as { id: number } | undefined
    if (existingSub && existingSub.id !== shell?.id) {
      throw new AppError(E.SUBDOMAIN_TAKEN, 400, { subdomain })
    }

    // 4. 建号 / 覆盖空壳（status='hidden'：CHECK 约束无 'closed' 值，与 REQ-038 管理员建号同口径，
    //    hidden = 不上客户端目录；画师登录后自己开启）
    let artistId: number
    if (shell) {
      // 空壳覆盖：不删行重建（保留 id），bio 置空、状态回 hidden；
      // commission_rules/默认工作流在空壳建号时已写入，不重复初始化。
      db.prepare(`
        UPDATE artists SET name = ?, subdomain = ?, artist_code = ?, bio = NULL, status = 'hidden' WHERE id = ?
      `).run(name, subdomain, artistCode, shell.id)
      artistId = shell.id
    } else {
      const result = db.prepare(`
        INSERT INTO artists (qq_number, name, subdomain, artist_code, bio, status)
        VALUES (?, ?, ?, ?, ?, 'hidden')
      `).run(qqNumber, name, subdomain, artistCode, null)
      artistId = Number(result.lastInsertRowid)

      // 初始化空的约稿须知 + 默认工作流（与 artistService.createArtist 三步写入对齐）
      db.prepare('INSERT INTO commission_rules (artist_id, content) VALUES (?, ?)').run(artistId, '')
      seedArtistStages(artistId)
    }

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
 * GHSA-6pf3 修复④（中·首绑枚举口口径对齐）：统一首绑失败对外响应。
 * 未注册 / 未绑定（无密钥或已验证）/ 动态口令错 / 重放 / 封禁 / 锁定——对外一律返回
 * 同一 status(400) + 同一 code(TOTP_INVALID) + 同一句文案「QQ号或动态口令错误」，不给剩余次数、
 * 不泄露账号存在性/绑定态/锁定态。此口径与 S1 登录侧共用（auth.service.verifyTotpLogin 的 TOTP_INVALID 分支）。
 * 仅内部日志区分 reason，便于运维排障；不进入对外响应体。
 */
function rejectInviteTotp(reason: string, artistId: number | null): never {
  console.warn(`[invite/totp-confirm] 首绑拒绝 reason=${reason} artistId=${artistId ?? 'null'}`)
  throw new AppError(E.TOTP_INVALID, 400)
}

/**
 * TOTP 首绑确认（对齐 REQ-038 confirmTotpAndComplete 同款模式）：
 * 校验 6 位码 + 重放防护 → totp_verified=1 → 签发会话 token。
 * 仅允许经由邀请码注册流程入库且已生成密钥但未验证的画师（P0-1 纵深：非邀请流程产物拒绝）。
 * GHSA-6pf3：所有失败态对外统一 TOTP_INVALID（见 rejectInviteTotp），并补 is_banned 拒绝（不签发会话、不改 verified）。
 */
export function confirmInviteTotp(params: InviteTotpConfirmParams): InviteTotpConfirmResult {
  const { qqNumber, code } = params
  const artist = db.prepare('SELECT * FROM artists WHERE qq_number = ? AND deleted_at IS NULL').get(qqNumber) as Artist | undefined
  if (!artist) rejectInviteTotp('artist_not_found', null)
  // GHSA-6pf3 修复③（低·首绑不查封禁）：封禁画师拒绝首绑——不签发会话、不改 totp_verified；
  // 对外走同一统一响应（封禁态不得成为枚举 oracle）。
  if (artist.is_banned) rejectInviteTotp('banned', artist.id)
  if (!artist.totp_secret || artist.totp_verified) rejectInviteTotp('not_bound', artist.id)

  // P0-1 纵深修复（2026-09-17）：确认该画师确实经由邀请码注册流程入库——
  // invite_code_uses 有记录 = registerWithInvite 事务成功提交了该画师；
  // 无记录说明该账号非邀请流程产物（如管理员预绑），拒绝通过此公开端点确认。
  const inviteUse = db.prepare('SELECT id FROM invite_code_uses WHERE artist_id = ?').get(artist.id)
  if (!inviteUse) rejectInviteTotp('non_invite_flow', artist.id)

  // 815 审计 P1-5：防爆破对齐登录路径——锁定期内任何尝试（含正确码）都拒绝；
  // checkTotpLocked/registerTotpFailure 内部仍写库维持锁定，对外统一 TOTP_INVALID 不泄露锁定态。
  try {
    checkTotpLocked(artist)
  } catch (err) {
    if (err instanceof AppError && err.code === E.TOTP_LOCKED) rejectInviteTotp('locked', artist.id)
    throw err
  }

  const hitCounter = verifyTotpWithCounter(artist.totp_secret, code, Date.now())
  if (hitCounter === null) {
    // 失败计数 +1（达阈值时 registerTotpFailure 落库锁定并抛 TOTP_LOCKED，此处吞掉其对外语义、统一响应）
    try {
      registerTotpFailure(artist.id)
    } catch (err) {
      if (err instanceof AppError && err.code === E.TOTP_LOCKED) rejectInviteTotp('locked_after_failure', artist.id)
      throw err
    }
    rejectInviteTotp('wrong_code', artist.id)
  }

  // 重放防护：同一 (画师, 时间步, 码) 只准成功一次（v48 totp_used_codes 唯一索引）
  const codeHash = hashTotpCode(artist.id, code, hitCounter)
  try {
    db.prepare('INSERT INTO totp_used_codes (artist_id, code_hash) VALUES (?, ?)').run(artist.id, codeHash)
  } catch {
    rejectInviteTotp('replay', artist.id)
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
