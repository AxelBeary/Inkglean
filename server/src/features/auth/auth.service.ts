import db from '../../db/connection.js'
import crypto from 'crypto'
import { getArtistByQq } from '../artist/artist.service.js'
import type { Artist } from '../../types/entities.js'

// ============================================
// 认证服务 - 登录码生成与验证
// ============================================

const CODE_MIN = 100000
const CODE_MAX = 1000000
const CODE_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
 */
export const isDevAuth = process.env.AUTH_DEV_MODE === 'true'

/**
 * 生成6位登录码，有效期5分钟
 * 无论 QQ 是否注册，统一返回相同响应，防止用户枚举
 */
export function generateLoginCode(qqNumber: string) {
  const artist = getArtistByQq(qqNumber) as Artist | undefined
  if (!artist) {
    // 不抛错，静默返回 — 调用方统一响应"若已注册则码已发送"
    return { code: null, artist: null }
  }

  db.prepare('DELETE FROM login_codes WHERE artist_id = ?').run(artist.id)

  const code = String(crypto.randomInt(CODE_MIN, CODE_MAX))
  // P0-4 修复：expires_at 统一为 Unix 毫秒整数，消除字符串字典序比较歧义
  const expiresAt = Date.now() + CODE_TTL_MS

  db.prepare('INSERT INTO login_codes (artist_id, code, expires_at) VALUES (?, ?, ?)')
    .run(artist.id, code, expiresAt)

  if (isDevAuth) {
    console.log(`\n🔑 [DEV] 画师「${artist.name}」(QQ: ${qqNumber}) 的登录码: ${code}\n`)
  }

  // TODO Phase 2: 接入 QQ Bot (NapCat/OneBot) 发送登录码
  return { code, artist }
}

/** 登录码记录行 */
interface LoginCodeRecord {
  id: number
  artist_id: number
  code: string
  expires_at: number
  attempts: number
}

/**
 * 验证登录码（最多5次尝试）
 * 未注册 QQ 返回通用错误，不暴露注册状态
 */
export function verifyLoginCode(qqNumber: string, code: string) {
  const artist = getArtistByQq(qqNumber) as Artist | undefined
  if (!artist) return { valid: false, code: 'CODE_INVALID', error: '登录码错误或已过期' }

  const record = db.prepare(
    'SELECT * FROM login_codes WHERE artist_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(artist.id) as LoginCodeRecord | undefined

  if (!record) return { valid: false, code: 'CODE_INVALID', error: '请先获取登录码' }

  // P0-4 修复：整数比较，与存储格式一致
  if (record.expires_at < Date.now()) {
    db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
    return { valid: false, code: 'CODE_EXPIRED', error: '登录码已过期，请重新获取' }
  }

  // 尝试次数检查
  if (record.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
    return { valid: false, code: 'CODE_TOO_MANY_ATTEMPTS', error: '尝试次数过多，请重新获取登录码' }
  }

  // 安全：时间安全比较，防止计时攻击
    // R1-2: 先检查字符长度（6位数字），避免全角/多字节字符触发 timingSafeEqual 崩溃
    if (code.length !== 6 || record.code.length !== 6) {
      db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id)
      return { valid: false, code: 'CODE_INVALID', error: `登录码错误（剩余 ${4 - record.attempts} 次机会）` }
    }
    let codeMatch: boolean
    try {
      codeMatch = crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(code))
    } catch {
      // R1-2: 字节长度不匹配时 fallback 到普通比较
      codeMatch = record.code === code
    }
    if (!codeMatch) {
      db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id)
      return { valid: false, code: 'CODE_INVALID', error: `登录码错误（剩余 ${4 - record.attempts} 次机会）` }
    }

  // 验证成功，删除码
  db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
  return { valid: true, artist }
}

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
