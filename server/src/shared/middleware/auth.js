import { verifySession } from '../../features/auth/auth.service.js'
import { getArtistById } from '../../features/artist/artist.service.js'

// ============================================
// 认证中间件
// ============================================

/**
 * 管理员 QQ 号（环境变量配置，默认 10000）
 */
const ADMIN_QQ = process.env.ADMIN_QQ || '10000'

/**
 * requireAuth - 画师登录校验
 * 从 Authorization: Bearer <token> 提取并验证会话
 */
export async function requireAuth(request, reply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未登录' })
  }

  const token = authHeader.slice(7)
  const session = verifySession(token)
  if (!session) {
    return reply.code(401).send({ error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.id)
  if (!artist) {
    return reply.code(401).send({ error: '画师账号不存在' })
  }

  request.artist = artist
}

/**
 * requireAdmin - 管理员权限校验
 * 管理员通过 QQ 号识别（默认 10000）
 */
export async function requireAdmin(request, reply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未登录' })
  }

  const token = authHeader.slice(7)
  const session = verifySession(token)
  if (!session) {
    return reply.code(401).send({ error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.id)
  if (!artist) {
    return reply.code(401).send({ error: '账号不存在' })
  }

  // 管理员判定：QQ 号匹配
  if (artist.qq_number !== ADMIN_QQ) {
    return reply.code(403).send({ error: '需要管理员权限' })
  }

  request.artist = artist
  request.isAdmin = true
}
