import db from '../../db/connection.js'
import crypto from 'crypto'
import { getArtistByQq } from '../artist/artist.service.js'

// ============================================
// 认证服务 - 登录码生成与验证
// ============================================

/**
 * P0-1: 签名密钥 — 生产环境必须设置 SESSION_SECRET，否则启动即崩溃
 */
function getSecret() {
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
 * P0-5: 开发模式 — 显式 AUTH_DEV_MODE=*** 开启（不再依赖 NODE_ENV 推断）
 */
export const isDevAuth = process.env.AUTH_DEV_MODE === 'true'

/**
 * 生成6位登录码，有效期5分钟
 * 开发模式：输出到控制台（不依赖QQ Bot）
 */
export function generateLoginCode(qqNumber) {
  const artist = getArtistByQq(qqNumber)
  if (!artist) throw new Error('该QQ号未注册为画师')

  // 清除旧码
  db.prepare('DELETE FROM login_codes WHERE artist_id = ?').run(artist.id)

  // P0-4d: randomInt 上界开区间修正（100000-999999）
  const code = String(crypto.randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  db.prepare('INSERT INTO login_codes (artist_id, code, expires_at) VALUES (?, ?, ?)')
    .run(artist.id, code, expiresAt)

  if (isDevAuth) {
    console.log(`\n🔑 [DEV] 画师「${artist.name}」(QQ: ${qqNumber}) 的登录码: ${code}\n`)
  }

  // TODO Phase 2: 接入 QQ Bot (NapCat/OneBot) 发送登录码
  return { code, artist }
}

/**
 * 验证登录码（最多5次尝试）
 */
export function verifyLoginCode(qqNumber, code) {
  const artist = getArtistByQq(qqNumber)
  if (!artist) return { valid: false, error: '该QQ号未注册为画师' }

  const record = db.prepare(
    'SELECT * FROM login_codes WHERE artist_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(artist.id)

  if (!record) return { valid: false, error: '请先获取登录码' }

  // 过期检查
  if (new Date(record.expires_at) < new Date()) {
    db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
    return { valid: false, error: '登录码已过期，请重新获取' }
  }

  // 尝试次数检查
  if (record.attempts >= 5) {
    db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
    return { valid: false, error: '尝试次数过多，请重新获取登录码' }
  }

  // P0-4c: 时间安全比较，防止计时攻击
    // R1-2: 先检查字符长度（6位数字），避免全角/多字节字符触发 timingSafeEqual 崩溃
    if (code.length !== 6 || record.code.length !== 6) {
      db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id)
      return { valid: false, error: `登录码错误（剩余 ${4 - record.attempts} 次机会）` }
    }
    let codeMatch = false
    try {
      codeMatch = crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(code))
    } catch {
      // R1-2: 字节长度不匹配时 fallback 到普通比较
      codeMatch = record.code === code
    }
    if (!codeMatch) {
      db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id)
      return { valid: false, error: `登录码错误（剩余 ${4 - record.attempts} 次机会）` }
    }

  // 验证成功，删除码
  db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
  return { valid: true, artist }
}

/**
 * 创建会话 Token（HMAC签名，无状态）
 */
export function createSession(artistId) {
  const payload = Buffer.from(JSON.stringify({ id: artistId, t: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/**
 * 验证会话 Token
 */
export function verifySession(token) {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  if (sig !== expected) return null

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString())
    // 7天过期
    if (Date.now() - data.t > 7 * 24 * 60 * 60 * 1000) return null
    return data
  } catch {
    return null
  }
}
