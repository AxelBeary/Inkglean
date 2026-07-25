import db from '../../db/connection.js'
import { getArtistByQq } from '../artist/artist.service.js'
import { randomInt, createHmac, timingSafeEqual } from 'crypto'

// ============================================
// 认证服务 - QQ 6位登录码 + HMAC 签名会话
// ============================================

const CODE_TTL = parseInt(process.env.LOGIN_CODE_TTL || '300', 10)
const MAX_ATTEMPTS = parseInt(process.env.LOGIN_CODE_MAX_ATTEMPTS || '3', 10)
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000 // 7天

// 会话签名密钥（生产环境必须通过环境变量设置）
const SECRET = process.env.SESSION_SECRET || 'change-me-in-production-' + Date.now()

/**
 * 生成登录码（密码学安全随机数）
 */
export function generateLoginCode(qqNumber) {
  const artist = getArtistByQq(qqNumber)
  if (!artist) throw new Error('该QQ号未绑定画师账号，请联系管理员')

  db.prepare('DELETE FROM login_codes WHERE artist_id = ?').run(artist.id)

  const code = String(randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + CODE_TTL * 1000).toISOString()

  db.prepare('INSERT INTO login_codes (artist_id, code, expires_at) VALUES (?, ?, ?)')
    .run(artist.id, code, expiresAt)

  return { code, artist }
}

/**
 * 验证登录码
 */
export function verifyLoginCode(qqNumber, inputCode) {
  const artist = getArtistByQq(qqNumber)
  if (!artist) return { valid: false, error: '该QQ号未绑定画师账号' }

  const record = db.prepare(
    'SELECT * FROM login_codes WHERE artist_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(artist.id)

  if (!record) return { valid: false, error: '请先获取登录码' }

  if (new Date(record.expires_at) < new Date()) {
    db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
    return { valid: false, error: '登录码已过期，请重新获取' }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
    return { valid: false, error: '尝试次数过多，请15分钟后重新获取' }
  }

  if (record.code !== inputCode) {
    db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id)
    const remaining = MAX_ATTEMPTS - record.attempts - 1
    return { valid: false, error: `登录码错误，还剩 ${remaining} 次机会` }
  }

  db.prepare('DELETE FROM login_codes WHERE id = ?').run(record.id)
  return { valid: true, artist }
}

/**
 * 生成 HMAC 签名的会话 Token
 * 格式: base64url(artistId:timestamp:hmac)
 * 无法伪造——不知道 SECRET 就算不出有效签名
 */
export function createSession(artistId) {
  const payload = `${artistId}:${Date.now()}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

/**
 * 验证并解析会话 Token（timing-safe 比较防时序攻击）
 */
export function parseSession(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length !== 3) return null

    const [artistId, timestamp, sig] = parts
    const payload = `${artistId}:${timestamp}`
    const expected = createHmac('sha256', SECRET).update(payload).digest('base64url')

    // timing-safe 比较
    const sigBuf = Buffer.from(sig)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null

    if (Date.now() - parseInt(timestamp) > SESSION_TTL) return null

    return { artistId: parseInt(artistId) }
  } catch {
    return null
  }
}
