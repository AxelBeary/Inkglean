import { verifyTotpLogin, createSession } from './auth.service.js'
import { requireAuth, getAdminQq } from '../../shared/middleware/auth.js'
import { bumpTokenVersion } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import { publicArtistDTO } from '../../shared/dto.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 认证路由 - TOTP 动态口令登录（REQ-027）
// ============================================

/** 限流守卫：不通过则抛 429 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

export default async function authRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/auth/verify
   * QQ 号 + TOTP 动态口令登录（REQ-027 R1，替代旧登录码机制）
   * 动态码在画师手机验证器 App 上生成，全程无消息通道依赖
   * 限流：同IP 10次/5分钟
   */
  fastify.post('/api/auth/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'code'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    guardRateLimit(`verify:${request.ip}`, 10, 5 * 60_000)

    const { qqNumber, code } = request.body as { qqNumber: string; code: string }

    const result = verifyTotpLogin(qqNumber, code)
    if (!result.valid) {
      // 直接返回服务层动态消息（含剩余机会/剩余锁定分钟），与全局错误结构 { code, error, detail } 一致
      return reply.code(401).send({
        code: result.code,
        error: result.error,
        ...(result.remainingLockMs != null ? { detail: { remainingLockMs: result.remainingLockMs } } : {})
      })
    }

    const token = createSession(result.artist.id, result.artist.token_version)
    const isAdmin = result.artist.qq_number === getAdminQq()

    // 安全：token 存 httpOnly cookie（JS 不可读，防 XSS 窃取）
    reply.setCookie('artist_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 // 7 天
    })

    return {
      isAdmin,
      artist: {
        id: result.artist.id,
        name: result.artist.name,
        subdomain: result.artist.subdomain,
        qqNumber: result.artist.qq_number
      }
    }
  })

  /**
   * GET /api/auth/me
   * 返回当前画师信息 + isAdmin 标记（前端刷新时以此为准）
   */
  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const isAdmin = request.artist.qq_number === getAdminQq()
    // 安全加固批 F1: 完整行含 totp_secret，走 DTO 剔除敏感列
    return { ...publicArtistDTO(request.artist), isAdmin }
  })

  /**
   * POST /api/auth/logout
   * 真正的登出 — 递增 token_version 使当前 token 及所有旧 token 失效
   */
  fastify.post('/api/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    bumpTokenVersion(request.artist.id)
    reply.clearCookie('artist_token', { path: '/' })
    return { message: '已登出' }
  })
}
