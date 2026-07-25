import { parseSession } from '../../features/auth/auth.service.js'
import { getArtistById } from '../../features/artist/artist.service.js'

// ============================================
// 认证中间件 - 验证画师登录状态（跨 feature 共用）
// ============================================

/**
 * 要求画师已登录
 * 从 Authorization: Bearer *** 中提取会话
 */
export function requireAuth(request, reply, done) {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: '未登录，请先获取登录码' })
  }

  const token = authHeader.slice(7)
  const session = parseSession(token)
  if (!session) {
    return reply.code(401).send({ error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.artistId)
  if (!artist) {
    return reply.code(401).send({ error: '账号不存在' })
  }

  // 挂载到请求对象上，后续路由可直接使用
  request.artist = artist
  done()
}

/**
 * 要求管理员权限
 * MVP 阶段：ADMIN_QQ 对应的画师即为管理员
 */
export function requireAdmin(request, reply, done) {
  // 先走普通认证
  requireAuth(request, reply, () => {
    const adminQq = process.env.ADMIN_QQ || '10000'
    if (request.artist.qq_number !== adminQq) {
      return reply.code(403).send({ error: '需要管理员权限' })
    }
    done()
  })
}
