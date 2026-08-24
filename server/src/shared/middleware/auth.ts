import { verifySession } from '../../features/auth/auth.service.js'
import { getDesktopDevice, touchDesktopDevice } from '../../features/auth/devices.service.js'
import { getArtistById } from '../../features/artist/artist.service.js'
import db from '../../db/connection.js'
import { E, ERROR_MESSAGES } from '../errors.js'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Artist } from '../../types/entities.js'

// ============================================
// 认证中间件
// ============================================

const ADMIN_QQ = process.env.ADMIN_QQ || ''

export function getAdminQq(): string {
  const row = db.prepare("SELECT value FROM platform_config WHERE key = 'admin_qq'").get() as { value: string } | undefined
  return row?.value || ADMIN_QQ
}

/**
 * 提取 token：httpOnly cookie 优先，Authorization: Bearer *** 兜底
 * cookie 是主路径（防 XSS），Bearer 保留给 API 测试和向后兼容
 */
function extractToken(request: FastifyRequest): string | null {
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
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request)
  if (!token) {
    return reply.code(401).send({ code: 'NOT_LOGGED_IN', error: '未登录' })
  }

  const session = verifySession(token)
  if (!session) {
    return reply.code(401).send({ code: 'SESSION_EXPIRED', error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.id) as Artist | undefined
  if (!artist) {
    return reply.code(401).send({ code: 'ACCOUNT_NOT_FOUND', error: '画师账号不存在' })
  }

  if (artist.deleted_at) {
    return reply.code(401).send({ code: 'ACCOUNT_DISABLED', error: '账号已被停用' })
  }

  // REQ-042: 封禁画师 token 立即失效（含已登录会话）
  if (artist.is_banned) {
    return reply.code(401).send({ code: 'ARTIST_BANNED', error: '账号已被封禁，如有疑问请联系管理员' })
  }

  // 会话门禁批：动态口令未绑定（被重置/未完成绑定）的画师不允许持有任何有效会话。
  // 置于 token_version 检查之前：管理员重置/重绑会同时 bump token_version，
  // 前端需要拿到 TOTP_BIND_REQUIRED（而非 TOKEN_REVOKED）才能引导重新绑定。
  if (!artist.totp_verified) {
    return reply.code(401).send({ code: E.TOTP_BIND_REQUIRED, error: ERROR_MESSAGES[E.TOTP_BIND_REQUIRED] })
  }

  if (artist.token_version && session.v !== artist.token_version) {
    return reply.code(401).send({ code: 'TOKEN_REVOKED', error: '登录状态已失效，请重新登录' })
  }

  // 桌面端记账式会话（REQ-014 安全口径一/方案 A，v73）：账本是存活权威——
  // 撕账（管理员踢出/全端踢人）或账目过期（停止活跃超 90 天）都在这一步拒绝；
  // 活账放行后记活跃并按周自动顺延（登录一次管三个月，网页 7 天病灶不复制）。
  // 过期时间解析失败（账目脏数据）也拒——安全方向一律从严。
  if (session.client === 'desktop') {
    if (session.device_id == null) {
      return reply.code(401).send({ code: 'SESSION_EXPIRED', error: '登录已过期，请重新登录' })
    }
    const device = getDesktopDevice(session.id, session.device_id)
    if (!device) {
      return reply.code(401).send({ code: E.DEVICE_REVOKED, error: ERROR_MESSAGES[E.DEVICE_REVOKED] })
    }
    const expiresMs = new Date(device.expires_at).getTime()
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      return reply.code(401).send({ code: 'SESSION_EXPIRED', error: '登录已过期，请重新登录' })
    }
    touchDesktopDevice(session.id, session.device_id)
  }

  request.artist = artist
}

/**
 * requireAdmin - 管理员权限校验
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request)
  if (!token) {
    return reply.code(401).send({ code: 'NOT_LOGGED_IN', error: '未登录' })
  }

  const session = verifySession(token)
  if (!session) {
    return reply.code(401).send({ code: 'SESSION_EXPIRED', error: '登录已过期，请重新登录' })
  }

  const artist = getArtistById(session.id) as Artist | undefined
  if (!artist) {
    return reply.code(401).send({ code: 'ACCOUNT_NOT_FOUND', error: '账号不存在' })
  }

  if (artist.deleted_at) {
    return reply.code(401).send({ code: 'ACCOUNT_DISABLED', error: '账号已被停用' })
  }

  // REQ-042: 防御性兜底（管理端封禁接口已禁止封管理员；此处双保险）
  if (artist.is_banned) {
    return reply.code(401).send({ code: 'ARTIST_BANNED', error: '账号已被封禁，如有疑问请联系管理员' })
  }

  // 会话门禁批：同 requireAuth——未绑定动态口令（被重置/未完成绑定）一律拦截，
  // 管理员账号同样适用（开箱设置已保证管理员必经绑定）
  if (!artist.totp_verified) {
    return reply.code(401).send({ code: E.TOTP_BIND_REQUIRED, error: ERROR_MESSAGES[E.TOTP_BIND_REQUIRED] })
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
