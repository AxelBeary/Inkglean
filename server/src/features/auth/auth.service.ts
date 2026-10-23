import db from '../../db/connection.js'
import crypto from 'crypto'
import { getArtistByQq } from '../artist/artist.service.js'
import { verifyTotp, verifyTotpWithCounter, hashTotpCode } from './totp.js'
import { createBoundedTtlStore } from './webauthn.js'
import { AppError, E } from '../../shared/errors.js'
import { isWeakSessionSecret } from '../../shared/secrets.js'
import type { Artist } from '../../types/entities.js'

// ============================================
// 认证服务 - TOTP 动态口令登录（REQ-027）
// ============================================

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
// 防爆破：对齐旧登录码量级，5 次错误后临时锁定 15 分钟（具体策略 REQ-027 R4，三号定）
export const TOTP_MAX_ATTEMPTS = 5
export const TOTP_LOCK_DURATION_MS = 15 * 60 * 1000

// GHSA-6pf3-854w P1（主代理拍板口径）：匿名认证失败对外统一——
// HTTP 401 + code TOTP_INVALID + 固定文案，五态（QQ不存在/码错/未绑定/封禁/锁定）对外不可区分，
// 不给剩余次数、不给锁明细；差异只进内部日志 reason。
export const LOGIN_GENERIC_CODE = E.TOTP_INVALID
export const LOGIN_GENERIC_ERROR = 'QQ号或动态口令错误'

/**
 * 签名密钥 — 生产环境必须设置 SESSION_SECRET，否则启动即崩溃
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET 环境变量未设置，生产环境禁止使用默认密钥')
    }
    // P1-3: 开发默认值随机化——固定值可被离线爆破伪造会话，改为每次启动生成随机密钥
    const devSecret = crypto.randomBytes(32).toString('hex')
    console.warn('⚠️  SESSION_SECRET 未设置，已生成随机开发密钥（每次启动变化，仅限开发环境）')
    return devSecret
  }
  // 815 审计拍板 #12：生产弱值 fail-fast——dev- 前缀/已知默认值/过短一律拒绝启动，防忘换弱值上线
  if (process.env.NODE_ENV === 'production' && isWeakSessionSecret(secret)) {
    throw new Error('SESSION_SECRET 为弱值（dev 前缀/默认值/长度不足 32）——生产环境拒绝启动，请更换为强随机值（如 openssl rand -hex 32）')
  }
  return secret
}

// 启动时立即校验（fail-fast）
const SECRET = getSecret()

/**
 * 开发模式 — 显式 AUTH_DEV_MODE=*** 开启（不再依赖 NODE_ENV 推断）
 * REQ-027 语义变更：不再显示旧登录码，改为「绑定接口响应附带密钥明文」辅助开发/测试
 *
 * 安全加固批 F4: 生产环境 fail-fast——AUTH_DEV_MODE=true 会让 bind-init 响应附带
 * TOTP 密钥明文（2FA 可被绕过），仅靠 .env 约定「生产必须 false」不够，误配即高危。
 * 判定：显式 production + dev 模式 → 启动即抛错（参照 ADMIN_QQ fail-fast 同模式，P1-4）。
 * 开发/测试环境（NODE_ENV != production）保持原行为。
 */
if (process.env.AUTH_DEV_MODE === 'true' && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_DEV_MODE=true 不允许在生产环境启用（bind-init 响应会附带 TOTP 密钥明文，2FA 可被绕过）')
}
export const isDevAuth = process.env.AUTH_DEV_MODE === 'true'

// ============================================
// TOTP 绑定状态
// ============================================

/** 画师 TOTP 绑定状态 */
export type TotpStatus = {
  /** 是否已生成密钥（bind-init 后即有，可能未验证） */
  hasSecret: boolean
  /** 是否已绑定（bind-confirm 通过） */
  verified: boolean
}

/** 读取画师 TOTP 绑定状态 */
export function getTotpStatus(artist: Artist): TotpStatus {
  return {
    hasSecret: Boolean(artist.totp_secret),
    verified: Boolean(artist.totp_secret && artist.totp_verified)
  }
}

/**
 * 绑定第一步（bind-init）：写入待确认密钥
 * 密钥入库但未验证（verified=0），画师扫码报码后由 confirmTotpBind 完成绑定
 * 重复调用 = 覆盖旧密钥（旧 App 绑定立即失效，须重新扫码）
 */
export function bindTotpInit(artistId: number, secret: string): void {
  db.prepare(
    'UPDATE artists SET totp_secret = ?, totp_verified = 0, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?'
  ).run(secret, artistId)
}

/**
 * 绑定第二步（bind-confirm）：验证画师报的 6 位码，通过后标记已绑定
 * 绑定失败不计数不锁定（仅管理员可调用，管理员身份本身可信；防爆破在登录接口）
 */
export function confirmTotpBind(artistId: number, code: string): void {
  const artist = db.prepare('SELECT * FROM artists WHERE id = ?').get(artistId) as Artist | undefined
  if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)
  if (!artist.totp_secret) throw new AppError(E.TOTP_NOT_BOUND, 400)

  if (!verifyTotp(artist.totp_secret, code, Date.now())) {
    throw new AppError(E.TOTP_BIND_INVALID, 400)
  }

  db.prepare('UPDATE artists SET totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?')
    .run(artistId)
}

/** 重置绑定（管理员后台 / CLI 兜底）：旧密钥立即失效，画师须重新绑定 */
export function resetTotp(artistId: number): void {
  // 会话门禁批：重置 = 未绑定态，未绑定画师不允许持有任何有效会话——
  // 清密钥的同时 token_version +1（同 bumpTokenVersion 口径），瞬间踢掉该画师全部既有会话。
  // 不拆到调用方：所有重置入口（管理员路由/CLI）都必须带踢人，避免遗漏。
  db.prepare(
    'UPDATE artists SET totp_secret = NULL, totp_verified = 0, totp_failed_attempts = 0, totp_locked_until = NULL, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?'
  ).run(artistId)
}

// ============================================
// 登录校验（含防爆破）
// ============================================

/**
 * 260830 审计 M-6：totp_locked_until 单一解析口径。
 * 此前 checkTotpLocked 做 string|number 双路兼容、verifyTotpLogin 却是裸比较（> / 减法）——
 * 列若落成字符串（历史数据/异构写入），裸比较会退化为字符串比较得出错误结论。
 * 统一走本函数：number 原样（NaN/Infinity 视为 0）、string 走 Date 解析（失败视为 0）、其余 0。
 * 返回 unix 毫秒；0 = 无有效锁定。
 */
export function parseLockedUntilMs(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const ms = new Date(v).getTime()
    return Number.isFinite(ms) ? ms : 0
  }
  return 0
}

/**
 * 815 审计 P1-5：绑定/确认类 TOTP 路径共用防爆破（对齐登录路径口径）。
 * 验证前检查锁定期：锁定期内任何尝试（含正确码）都拒绝。
 */
export function checkTotpLocked(artist: { totp_locked_until: string | number | null }): void {
  if (artist.totp_locked_until == null) return
  const until = parseLockedUntilMs(artist.totp_locked_until)
  if (until > Date.now()) {
    throw new AppError(E.TOTP_LOCKED, 429, { remainingLockMs: until - Date.now() })
  }
}

/**
 * 815 审计 P1-5：验证失败原子计数 +1 后回读判定；达 TOTP_MAX_ATTEMPTS 锁定
 * TOTP_LOCK_DURATION_MS 并抛 TOTP_LOCKED；未达阈值不抛（由调用方抛具体错码）。
 */
export function registerTotpFailure(artistId: number): void {
  db.prepare('UPDATE artists SET totp_failed_attempts = totp_failed_attempts + 1 WHERE id = ?').run(artistId)
  const attempts = (db.prepare('SELECT totp_failed_attempts FROM artists WHERE id = ?').get(artistId) as { totp_failed_attempts: number }).totp_failed_attempts || 0
  if (attempts >= TOTP_MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + TOTP_LOCK_DURATION_MS
    db.prepare('UPDATE artists SET totp_failed_attempts = 0, totp_locked_until = ? WHERE id = ?').run(lockedUntil, artistId)
    throw new AppError(E.TOTP_LOCKED, 429, { remainingLockMs: TOTP_LOCK_DURATION_MS })
  }
}

/**
 * 登录防爆破（IP+账号联合键）状态条目
 */
interface LoginAttemptEntry {
  /** 该 (IP, 账号) 组合的连续失败次数（滚动窗口内） */
  failures: number
  /** 锁定截止时刻（unix ms；0 = 未锁定）。到期自然失效——合法用户「15 分钟自动解锁」路径 */
  lockUntil: number
  /** 存储层过期时刻（惰性清理判据）：锁定触发时留出解锁后的计数冷却期 */
  expiresAt: number
}

/**
 * 容量上限：与 challengeStore 同款有界（防轮换 IP 打爆内存；超限按插入序淘汰最旧，
 * 被淘汰者至多重新计数，不构成绕过）
 */
const MAX_LOGIN_ATTEMPT_ENTRIES = 10_000

/**
 * GHSA-6pf3-854w 定向锁号修复：旧实现失败计数与锁定都写账号列（artists.totp_*）——
 * 单 IP 每 15 分钟打满 5 次错误即可对任意账号（含管理员）维持永久锁定（登录 DoS）。
 * 改「IP+账号联合键」内存状态（单进程语义同 rate-limit/challengeStore）：
 * - 攻击者单 IP 只能把自己锁在门外，同账号的其他 IP 不受影响（不互锁）；
 * - 锁 15 分钟自然到期，合法用户自动恢复；
 * - 账号级 DB 锁（artists.totp_locked_until，由 verify-current/rebind 等登录态路径写入）
 *   登录时仍照常尊重（读取不移除，跨流程门禁语义不变），但登录失败路径不再写它。
 */
const loginAttemptStore = createBoundedTtlStore<string, LoginAttemptEntry>(MAX_LOGIN_ATTEMPT_ENTRIES)

/** 联合键：ip 缺省（服务层内部调用，如管理员 transfer 验码）退化为按账号在内存计数 */
function attemptKey(ip: string | undefined, qqNumber: string): string {
  return `${ip ?? 'no-ip'}|${qqNumber}`
}

/** 仅供测试：清空 IP+账号防爆破状态（同 resetRateLimitBuckets 先例；生产勿用） */
export function resetTotpLoginAttemptStore(): void {
  loginAttemptStore.clear()
}

/** 拒绝原因（内部口径）——对外永不可见，仅供日志/特权路径（step-up/transfer）分派 */
export type TotpLoginDenyReason = 'not_found' | 'banned' | 'locked' | 'unbound' | 'invalid_code' | 'replay'

/** 登录拒绝结果：code/error 恒为统一值（P1 口径五态不可区分）；reason/remainingLockMs/lockTriggered 仅内部消费 */
export interface TotpLoginDenyResult {
  valid: false
  code: string
  error: string
  reason: TotpLoginDenyReason
  /** reason='locked' 时的剩余毫秒（仅内部/特权路径；匿名响应禁止透传） */
  remainingLockMs?: number
  /** true = 本次调用触发 (IP,账号) 锁定跃迁——路由层据此为管理员账号写审计日志 */
  lockTriggered?: boolean
}

/** 登录成功结果 */
export interface TotpLoginSuccessResult {
  valid: true
  artist: Artist
}

export type TotpLoginResult = TotpLoginSuccessResult | TotpLoginDenyResult

/** 构造统一拒绝响应体（五态同码同文案；差异只进 reason） */
function denyLogin(reason: TotpLoginDenyReason, extra?: { remainingLockMs?: number; lockTriggered?: boolean }): TotpLoginDenyResult {
  return { valid: false, code: LOGIN_GENERIC_CODE, error: LOGIN_GENERIC_ERROR, reason, ...extra }
}

/**
 * QQ 号 + TOTP 动态码登录校验
 * 安全对齐旧机制：未注册 QQ 返回与「码错误」相同响应（防枚举）
 * GHSA-6pf3-854w P1：五态（QQ不存在/码错/未绑定/封禁/锁定）+重放 全部对外统一
 * TOTP_INVALID + 「QQ号或动态口令错误」，调用方（匿名路由）不再透出任何明细。
 * 防爆破：同一 (IP,账号) 连续错 TOTP_MAX_ATTEMPTS 次 → 该组合锁 TOTP_LOCK_DURATION_MS，
 * 锁定期内任何尝试（含正确码）都拒绝；单 IP 无法再锁死任意账号（见 loginAttemptStore 注释）。
 * @param ip 请求来源 IP（匿名路由必传；缺省退化为账号维度内存计数）
 */
export function verifyTotpLogin(qqNumber: string, code: string, ip?: string): TotpLoginResult {
  const artist = getArtistByQq(qqNumber) as Artist | undefined
  if (!artist) {
    // 防枚举：与码错误同响应，不暴露注册状态
    return denyLogin('not_found')
  }

  // REQ-042: 封禁独立态——封禁画师一律拒绝登录（即使动态码正确）
  // P1 口径：对外与码错不可区分，reason='banned' 仅内部日志
  if (artist.is_banned) {
    return denyLogin('banned')
  }

  // 账号级 DB 锁定检查（登录态防爆破路径 verify-current/rebind 写入）——锁定期间一律拒绝（正确码也不行）
  // M-6：统一走 parseLockedUntilMs（此前裸 > / 减法对字符串口径会错判）
  const lockedUntil = parseLockedUntilMs(artist.totp_locked_until)
  if (lockedUntil > Date.now()) {
    return denyLogin('locked', { remainingLockMs: lockedUntil - Date.now() })
  }

  // 绑定检查：未生成密钥或未验证通过 → 无法登录
  // audit-a P3-11: 与「不存在 QQ」统一返回 TOTP_INVALID + 同文案——
  // 未绑定状态不得成为平台画师枚举 oracle（bind/transfer 流程仍用 TOTP_NOT_BOUND，不受影响）
  if (!artist.totp_secret || !artist.totp_verified) {
    return denyLogin('unbound')
  }

  // IP+账号联合锁检查：必须先于码验证——锁定期内正确码也拒绝（保持旧锁定语义）
  const key = attemptKey(ip, qqNumber)
  const attempt = loginAttemptStore.get(key)
  if (attempt && attempt.lockUntil > Date.now()) {
    return denyLogin('locked', { remainingLockMs: attempt.lockUntil - Date.now() })
  }

  const hitCounter = verifyTotpWithCounter(artist.totp_secret, code, Date.now())
  if (hitCounter !== null) {
    // P1-1 重放防护：同一 (画师, 时间步, 码) 只准成功一次。
    // 先插入已用码，唯一约束冲突 = 该码已用过 = 拒绝。
    // 重放不计入防爆破失败计数（避免用户重复点登录误触发锁定）。
    // GHSA-6pf3 枚举面：「已使用」专属文案会泄露「该码对本账号有效」，匿名侧统一收编（reason 仅内部）
    const codeHash = hashTotpCode(artist.id, code, hitCounter)
    try {
      db.prepare('INSERT INTO totp_used_codes (artist_id, code_hash) VALUES (?, ?)').run(artist.id, codeHash)
    } catch {
      return denyLogin('replay')
    }
    // 顺带清理 7 天前已用记录（低频写，登录路径可接受）
    db.prepare("DELETE FROM totp_used_codes WHERE used_at < datetime('now', '-7 days')").run()
    // 成功：清本组合防爆破状态；账号级 DB 计数/锁定照旧清零
    loginAttemptStore.delete(key)
    db.prepare('UPDATE artists SET totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?').run(artist.id)
    return { valid: true, artist }
  }

  // 失败：(IP,账号) 联合键计数（P1 修复：不再写账号列——单 IP 从此锁不死任意账号）
  // 滚动窗口：距上次失败超一个锁周期（15min）重新起算；曾触发过锁定（lockUntil>0，此刻已过期）也从头起算
  // ——对齐旧 DB 语义「触发锁定即清零计数」（P2-F3 的原子性关切由单线程内存操作天然满足）
  const now = Date.now()
  const baseFailures = attempt && attempt.expiresAt > now && attempt.lockUntil === 0 ? attempt.failures : 0
  const failures = baseFailures + 1
  if (failures >= TOTP_MAX_ATTEMPTS) {
    // 触发锁定：15 分钟后自然到期（expiresAt 多留一个锁周期作计数冷却）
    loginAttemptStore.set(key, {
      failures,
      lockUntil: now + TOTP_LOCK_DURATION_MS,
      expiresAt: now + 2 * TOTP_LOCK_DURATION_MS
    })
    return denyLogin('locked', { remainingLockMs: TOTP_LOCK_DURATION_MS, lockTriggered: true })
  }
  loginAttemptStore.set(key, { failures, lockUntil: 0, expiresAt: now + TOTP_LOCK_DURATION_MS })
  return denyLogin('invalid_code')
}

// ============================================
// 会话 Token（HMAC 签名，无状态）
// ============================================

/**
 * 会话升级级别（REQ-041）
 * - basic：登录基本会话（缺省，旧 token 兼容视为 basic）
 * - admin_verified：通过管理员二次验证（TOTP/Passkey）后的升级会话
 */
export type AuthLevel = 'basic' | 'admin_verified'

/**
 * 会话客户端类型（REQ-014 安全口径一，v73）
 * - web（缺省/旧 token 兼容）：7 天 t 基 TTL，无状态
 * - desktop：记账式会话——过期由设备账本（desktop_devices）权威管理，
 *   token 自身不做 t 基 TTL（t 仅作记账时刻），签名只防伪造；踢人=撕账、过期=停止顺延（见 devices.service）
 */
export type SessionClient = 'web' | 'desktop'

/** 会话 payload */
export interface SessionPayload {
  id: number
  t: number
  v: number
  /** REQ-041：会话升级级别（旧 token 无此字段 = basic） */
  auth_level?: AuthLevel
  /** REQ-041：管理员二次验证通过时刻（ISO 时间戳，可空；与 auth_level 配套） */
  admin_verified_at?: string | null
  /** 桌面端会话标记（缺省 = web）；账本行不存在/被踢/过期即拒（见 requireAuth） */
  client?: SessionClient
  /** desktop_devices 账本行 id（仅 client='desktop' 时有值） */
  device_id?: number
}

/** 创建升级会话的附加参数（REQ-041；缺省 = basic 会话，既有调用语义不变） */
export interface CreateSessionOptions {
  authLevel?: AuthLevel
  adminVerifiedAt?: string | null
  /** REQ-014：桌面端记账式会话标记（须与 deviceId 成对出现） */
  client?: SessionClient
  /** desktop_devices 账本行 id（client='desktop' 时必填） */
  deviceId?: number
}

/**
 * 创建会话 Token（HMAC签名，无状态）
 * payload 中包含 token_version，用于服务端主动使旧 token 失效
 * REQ-041：验证通过后由 step-up 接口用 authLevel='admin_verified' + adminVerifiedAt 重签覆盖 cookie
 * REQ-014：桌面端会话带 client='desktop' + device_id，过期权威在设备账本（非 t）
 */
export function createSession(artistId: number, tokenVersion: number, options: CreateSessionOptions = {}): string {
  const isDesktop = options.client === 'desktop'
  if (isDesktop && (options.deviceId == null || !Number.isInteger(options.deviceId))) {
    // 契约护栏：桌面会话必须持有账本行 id，否则签出的 token 永远被门禁拒绝——属调用方编程错误，直接抛
    throw new Error('createSession：client=desktop 必须提供整数 deviceId（desktop_devices 账本行 id）')
  }
  const payload: SessionPayload = {
    id: artistId,
    t: Date.now(),
    v: tokenVersion || 1,
    ...(options.authLevel ? { auth_level: options.authLevel } : {}),
    ...(options.adminVerifiedAt != null ? { admin_verified_at: options.adminVerifiedAt } : {}),
    ...(isDesktop ? { client: 'desktop' as const, device_id: options.deviceId } : {})
  }
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payloadBase64).digest('base64url')
  return `${payloadBase64}.${sig}`
}

/**
 * 验证会话 Token
 * 使用 timingSafeEqual 防止时序攻击
 * 旧 token（无 auth_level/admin_verified_at）兼容：字段缺失时按 basic 处理（见中间件）
 */
export function verifySession(token: string): SessionPayload | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  const expectedBuf = Buffer.from(expectedSig)
  const actualBuf = Buffer.from(sig)
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as SessionPayload
    // GHSA-6pf3-854w P2（低-3）：t 必须为有效数值——createSession 恒写入 Date.now()，缺失/非数
    // 即伪造或损坏。旧实现 web 分支裸算 Date.now()-data.t：缺 t → NaN → 比较恒 false → 7 天 TTL 失守。
    // desktop 分支虽不做 t 基 TTL（记账式），payload 契约同样要求 t（createSession 恒带）。
    if (typeof data.t !== 'number' || !Number.isFinite(data.t)) return null
    // 桌面端（记账式会话）：不做 t 基 TTL——过期权威在设备账本（踢人=撕账/过期=停止顺延），
    // 否则活跃顺延后旧 t 到期会误杀活跃设备（网页会话写死 7 天过期的病灶不复制到桌面端）。
    // 账本不存在/过期/被踢的拒绝在 requireAuth 门禁侧完成。
    if (data.client === 'desktop') return data
    if (Date.now() - data.t > SESSION_TTL_MS) return null
    return data
  } catch (err) {
    console.warn('会话 token 解析失败（拒绝访问）', err)
    return null
  }
}
