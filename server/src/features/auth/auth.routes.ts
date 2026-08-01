import { generateLoginCode, verifyLoginCode, createSession, isDevAuth } from './auth.service.js'
import { requireAuth, getAdminQq } from '../../shared/middleware/auth.js'
import { bumpTokenVersion } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 认证路由 - 登录码获取与验证
// ============================================

/** 限流守卫：不通过则抛 429 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

export default async function authRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/auth/send-code
   * 发送登录码（限流：同IP 5次/5分钟）
   * R2-6: 加 JSON Schema 验证
   */
  fastify.post('/api/auth/send-code', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    guardRateLimit(`send-code:${request.ip}`, 5, 5 * 60_000)

    const { qqNumber } = request.body as { qqNumber: string }

    const { code, artist } = generateLoginCode(qqNumber)

    // 安全：无论是否注册，统一响应（防枚举）
    if (isDevAuth && artist) {
      fastify.log.info(`🔑 [DEV] 画师 ${artist.name}(${qqNumber}) 登录码: ${code}`)
    }

    return {
          message: `若该QQ已注册，登录码已发送`,
          ...(isDevAuth && code ? { _dev_code: code } : {})
        }
  })

  /**
   * POST /api/auth/verify
   * 验证登录码（限流：同IP 10次/5分钟）
   * R1-2: 加 JSON Schema 验证，防止非6位数字字符触发 timingSafeEqual 崩溃
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

    const result = verifyLoginCode(qqNumber, code)
    if (!result.valid) {
      // 保留服务层的具体错误区分（过期/次数过多/不正确）
      throw new AppError(result.code || E.CODE_INVALID, 401, result.error)
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
    return { ...request.artist, isAdmin }
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
