import { verifySession } from '../../features/auth/auth.service.js'
import { getArtistById } from '../../features/artist/artist.service.js'
import db from '../../db/connection.js'

// ============================================
// 认证中间件
// ============================================

/**
 * 管理员 QQ 号（环境变量仅用于首次引导，运行时从 platform_config 读取）
 * 不再 export，仅内部使用
 */
const ADMIN_QQ = process.env.ADMIN_QQ || ''

/**
 * 获取当前管理员 QQ（优先读数据库，支持运行时更换）
 */
export function getAdminQq() {
  const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get()
  return row?.value || ADMIN_QQ
}

/**
 * requireAuth - 画师登录校验
 * 从 Authorization: Bearer *** 提取并验证会话
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

  // 安全：软删除画师的 token 立即失效
  if (artist.deleted_at) {
    return reply.code(401).send({ error: '账号已被停用' })
  }

  // token_version 校验：服务端可主动使旧 token 失效（权限变更、登出等）
  if (artist.token_version && session.v !== artist.token_version) {
    return reply.code(401).send({ error: '登录状态已失效，请重新登录' })
  }

  request.artist = artist
}

/**
 * requireAdmin - 管理员权限校验
 * 管理员通过 QQ 号识别（从数据库读取，支持运行时更换）
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

  // 安全：软删除画师的 token 立即失效
  if (artist.deleted_at) {
    return reply.code(401).send({ error: '账号已被停用' })
  }

  // token_version 校验
  if (artist.token_version && session.v !== artist.token_version) {
    return reply.code(401).send({ error: '登录状态已失效，请重新登录' })
  }

  // 管理员判定：QQ 号匹配（从数据库读取，支持运行时更换）
  if (artist.qq_number !== getAdminQq()) {
    return reply.code(403).send({ error: '需要管理员权限' })
  }

  request.artist = artist
  request.isAdmin = true
}
