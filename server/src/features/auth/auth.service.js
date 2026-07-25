import db from '../../db/connection.js'
import crypto from 'crypto'
import { getArtistByQq } from '../artist/artist.service.js'

// ============================================
// 认证服务 - 登录码生成与验证
// ============================================

const isDev = process.env.NODE_ENV !== 'production'

/**
 * 生成6位登录码，有效期5分钟
 * 开发模式：输出到控制台（不依赖QQ Bot）
 */
export function generateLoginCode(qqNumber) {
  const artist = getArtistByQq(qqNumber)
  if (!artist) throw new Error('该QQ号未注册为画师')

  // 清除旧码
  db.prepare('DELETE FROM login_codes WHERE artist_id = ?').run(artist.id)

  const code = String(crypto.randomInt(100000, 999999))
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  db.prepare('INSERT INTO login_codes (artist_id, code, expires_at) VALUES (?, ?, ?)')
    .run(artist.id, code, expiresAt)

  // 开发模式：直接输出到控制台
  if (isDev) {
    console.log(`\n🔑 [DEV] 画师「${artist.name}」(QQ: ${qqNumber}) 的登录码: ${code}\n`)
  }

  // TODO Phase 2: 接入 QQ Bot (NapCat/OneBot) 发送登录码
  // await sendQqMessage(qqNumber, `你的登录码是: ${code}，5分钟内有效。`)

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

  // 验证
  if (record.code !== code) {
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
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-in-production'
  const payload = Buffer.from(JSON.stringify({ id: artistId, t: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/**
 * 验证会话 Token
 */
export function verifySession(token) {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null

  const secret = process.env.SESSION_SECRET || 'dev-secret-change-in-production'
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
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
