import db from '../../db/connection.js'
import crypto from 'crypto'
import { getArtistByQq } from '../artist/artist.service.js'
import { verifyTotp } from './totp.js'
import { AppError, E } from '../../shared/errors.js'
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
    console.warn('⚠️  SESSION_SECRET 未设置，使用开发默认值（仅限开发环境）')
    return 'dev-secret-change-in-production'
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
  db.prepare(
    'UPDATE artists SET totp_secret = NULL, totp_verified = 0, totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?'
  ).run(artistId)
}

/** 读取已绑定画师的密钥（transfer 双码验证用；未绑定抛错） */
export function getBoundTotpSecret(artist: Artist): string {
  if (!artist.totp_secret || !artist.totp_verified) {
    throw new AppError(E.TOTP_NOT_BOUND, 400)
  }
  return artist.totp_secret
}

// ============================================
// 登录校验（含防爆破）
// ============================================

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

  // 锁定检查：锁定期间一律拒绝（正确码也不行）
  if (artist.totp_locked_until && artist.totp_locked_until > Date.now()) {
    const remainingMin = Math.ceil((artist.totp_locked_until - Date.now()) / 60000)
    return {
      valid: false,
      code: E.TOTP_LOCKED,
      error: `尝试次数过多，账号已临时锁定，请约 ${remainingMin} 分钟后再试`,
      remainingLockMs: artist.totp_locked_until - Date.now()
    }
  }

  // 绑定检查：未生成密钥或未验证通过 → 无法登录
  if (!artist.totp_secret || !artist.totp_verified) {
    return { valid: false, code: E.TOTP_NOT_BOUND, error: '该画师尚未绑定动态口令，请联系管理员绑定' }
  }

  if (verifyTotp(artist.totp_secret, code, Date.now())) {
    // 成功：清零防爆破计数
    db.prepare('UPDATE artists SET totp_failed_attempts = 0, totp_locked_until = NULL WHERE id = ?').run(artist.id)
    return { valid: true, artist }
  }

  // 失败：计数 +1，达到阈值触发锁定
  const attempts = (artist.totp_failed_attempts || 0) + 1
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
  db.prepare('UPDATE artists SET totp_failed_attempts = ? WHERE id = ?').run(attempts, artist.id)
  return {
    valid: false,
    code: E.TOTP_INVALID,
    error: `动态口令错误（剩余 ${TOTP_MAX_ATTEMPTS - attempts} 次机会）`
  }
}

// ============================================
// 会话 Token（HMAC 签名，无状态）— 原样保留
// ============================================

/**
 * 创建会话 Token（HMAC签名，无状态）
 * payload 中包含 token_version，用于服务端主动使旧 token 失效
 */
export function createSession(artistId: number, tokenVersion: number): string {
  const payload = Buffer.from(JSON.stringify({ id: artistId, t: Date.now(), v: tokenVersion || 1 })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** 会话 payload */
interface SessionPayload {
  id: number
  t: number
  v: number
}

/**
 * 验证会话 Token
 * 使用 timingSafeEqual 防止时序攻击
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
    if (Date.now() - data.t > SESSION_TTL_MS) return null
    return data
  } catch {
    return null
  }
}
