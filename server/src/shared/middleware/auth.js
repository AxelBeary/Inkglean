import { verifySession } from '../../features/auth/auth.service.js'
import { getArtistById } from '../../features/artist/artist.service.js'
import db from '../../db/connection.js'

// ============================================
// 认证中间件
// ============================================

const ADMIN_QQ = process.env.ADMIN_QQ || ''

export function getAdminQq() {
  const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get()
  return row?.value || ADMIN_QQ
}

/**
 * 提取 token：httpOnly cookie 优先，Authorization: Bearer *** 兜底
 * cookie 是主路径（防 XSS），Bearer 保留给 API 测试和向后兼容
 */
function extractToken(request) {
  // 优先从 httpOnly cookie 读取（JS 不可访问，防 XSS 窃取）
  const cookieToken = request.cookies?.artist_token
  if (cookieToken) return cookieToken
  // 兜底：Authorization header（测试 / 旧客户端兼容）
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return null
}

/**
 * requireAuth - 画师登录校验
 */
export async function requireAuth(request, reply) {
  const token = extractToken(request)
  if (!token) {
    return reply.code(401).send({ code: 'NOT_LOGGED_IN', error: '未登录' })
  }

  const session = verifySession(token)
  if (!session) {
    return reply.code(401).send({ code: 'SESSION_EXPIRED', error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.id)
  if (!artist) {
    return reply.code(401).send({ code: 'ACCOUNT_NOT_FOUND', error: '画师账号不存在' })
  }

  if (artist.deleted_at) {
    return reply.code(401).send({ code: 'ACCOUNT_DISABLED', error: '账号已被停用' })
  }

  if (artist.token_version && session.v !== artist.token_version) {
    return reply.code(401).send({ code: 'TOKEN_REVOKED', error: '登录状态已失效，请重新登录' })
  }

  request.artist = artist
}

/**
 * requireAdmin - 管理员权限校验
 */
export async function requireAdmin(request, reply) {
  const token = extractToken(request)
  if (!token) {
    return reply.code(401).send({ code: 'NOT_LOGGED_IN', error: '未登录' })
  }

  const session = verifySession(token)
  if (!session) {
    return reply.code(401).send({ code: 'SESSION_EXPIRED', error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.id)
  if (!artist) {
    return reply.code(401).send({ code: 'ACCOUNT_NOT_FOUND', error: '账号不存在' })
  }

  if (artist.deleted_at) {
    return reply.code(401).send({ code: 'ACCOUNT_DISABLED', error: '账号已被停用' })
  }

  if (artist.token_version && session.v !== artist.token_version) {
    return reply.code(401).send({ code: 'TOKEN_REVOKED', error: '登录状态已失效，请重新登录' })
  }

  if (artist.qq_number !== getAdminQq()) {
    return reply.code(403).send({ code: 'ADMIN_REQUIRED', error: '需要管理员权限' })
  }

  request.artist = artist
  request.isAdmin = true
}
