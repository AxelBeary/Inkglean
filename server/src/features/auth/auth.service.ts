import db from '../../db/connection.js'
import crypto from 'crypto'
import { getArtistByQq } from '../artist/artist.service.js'
import { verifyTotp, verifyTotpWithCounter, hashTotpCode } from './totp.js'
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
 * QQ 号 + TOTP 动态码登录校验
 * 安全对齐旧机制：未注册 QQ 返回与「码错误」相同响应（防枚举）
 * 防爆破：连续错 TOTP_MAX_ATTEMPTS 次 → 锁定 TOTP_LOCK_DURATION_MS，锁定期间任何尝试（含正确码）都拒绝
 */
export function verifyTotpLogin(qqNumber: string, code: string) {
  const artist = getArtistByQq(qqNumber) as Artist | undefined
  if (!artist) {
    // 防枚举：与码错误同响应，不暴露注册状态
    return { valid: false, code: E.TOTP_INVALID, error: 'QQ号或动态口令错误' }
  }

  // REQ-042: 封禁独立态——封禁画师一律拒绝登录（即使动态码正确）
  if (artist.is_banned) {
    return { valid: false, code: E.ARTIST_BANNED, error: '账号已被封禁，如有疑问请联系管理员' }
  }

  // 锁定检查：锁定期间一律拒绝（正确码也不行）
  // M-6：统一走 parseLockedUntilMs（此前裸 > / 减法对字符串口径会错判）
  const lockedUntil = parseLockedUntilMs(artist.totp_locked_until)
  if (lockedUntil > Date.now()) {
    const remainingMs = lockedUntil - Date.now()
    const remainingMin = Math.ceil(remainingMs / 60000)
    return {
      valid: false,
      code: E.TOTP_LOCKED,
      error: `尝试次数过多，账号已临时锁定，请约 ${remainingMin} 分钟后再试`,
      remainingLockMs: remainingMs
    }
  }

  // 绑定检查：未生成密钥或未验证通过 → 无法登录
  if (!artist.totp_secret || !artist.totp_verified) {
    // audit-a P3-11: 与「不存在 QQ」统一返回 TOTP_INVALID + 同文案——
    // 未绑定状态不得成为平台画师枚举 oracle（bind/transfer 流程仍用 TOTP_NOT_BOUND，不受影响）
    return { valid: false, code: E.TOTP_INVALID, error: 'QQ号或动态口令错误' }
  }

  const hitCounter = verifyTotpWithCounter(artist.totp_secret, code, Date.now())
  if (hitCounter !== null) {
    // P1-1 重放防护：同一 (画师, 时间步, 码) 只准成功一次。
    // 先插入已用码，唯一约束冲突 = 该码已用过 = 拒绝。
    // 重放不计入防爆破失败计数（避免用户重复点登录误触发锁定）。
    const codeHash = hashTotpCode(artist.id, code, hitCounter)
    try {
      db.prepare('INSERT INTO totp_used_codes (artist_id, code_hash) VALUES (?, ?)').run(artist.id, codeHash)
    } catch {
      return { valid: false, code: E.TOTP_INVALID, error: '该动态口令已使用，请使用最新动态口令' }
    }
    // 顺带清理 7 天前已用记录（低频写，登录路径可接受）
    db.prepare("DELETE FROM totp_used_codes WHERE used_at < datetime('now', '-7 days')").run()
    // 成功：清零防爆破计数
    db.prepare('UPDATE artists SET totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?').run(artist.id)
    return { valid: true, artist }
  }

  // 失败：原子计数 +1 后回读判定（P2-F3：消除 read-modify-write 并发丢失更新）
  db.prepare('UPDATE artists SET totp_failed_attempts = totp_failed_attempts + 1 WHERE id = ?').run(artist.id)
  const attempts = (db.prepare('SELECT totp_failed_attempts FROM artists WHERE id = ?').get(artist.id) as { totp_failed_attempts: number }).totp_failed_attempts || 0
  if (attempts >= TOTP_MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + TOTP_LOCK_DURATION_MS
    db.prepare('UPDATE artists SET totp_failed_attempts = 0, totp_locked_until = ? WHERE id = ?').run(lockedUntil, artist.id)
    return {
      valid: false,
      code: E.TOTP_LOCKED,
      error: `动态口令连续错误 ${TOTP_MAX_ATTEMPTS} 次，账号已临时锁定，请约 ${TOTP_LOCK_DURATION_MS / 60000} 分钟后再试`,
      remainingLockMs: TOTP_LOCK_DURATION_MS
    }
  }
  return {
    valid: false,
    code: E.TOTP_INVALID,
    error: `动态口令错误（剩余 ${TOTP_MAX_ATTEMPTS - attempts} 次机会）`
  }
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
