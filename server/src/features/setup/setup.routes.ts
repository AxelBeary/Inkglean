// ============================================
// 开箱设置路由（REQ-038）
// ============================================
import { getSetupStatus, createAdminArtist, confirmTotpAndComplete, isSetupCompleted } from './setup.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// 限流守卫
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

// 815 拍板 #6（A2 物理销毁）：向导完成后写端点永久 410 Gone，不再只是 403；
// status 保留为只读探测（前端路由守卫靠它判初始化状态）
function guardSetupGone(): void {
  if (isSetupCompleted()) {
    throw new AppError('SETUP_GONE', 410, '开箱向导已销毁（系统已完成初始化）')
  }
}

export default async function setupRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/setup/status
   * 公开端点：查询系统初始化状态
   */
  fastify.get('/api/setup/status', async () => {
    return getSetupStatus()
  })

  /**
   * POST /api/setup/admin
   * 创建管理员（含可选工作室）+ 生成 TOTP 密钥
   * 未初始化时有效；已初始化返回 403
   * 限流：同 IP 5 次/5 分钟
   */
  fastify.post('/api/setup/admin', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'name'],
        properties: {
          token: { type: 'string' },
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          studio: {
            type: 'object',
            properties: {
              name: { type: 'string', maxLength: 50 },
              subdomain: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[a-z0-9]+$' }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    guardSetupGone()
    guardRateLimit(`setup-admin:${request.ip}`, 5, 5 * 60_000)

    const { token, qqNumber, name, studio } = request.body as {
      token?: string
      qqNumber: string
      name: string
      studio?: { name?: string; subdomain?: string }
    }

    try {
      const result = createAdminArtist({
        token,
        qqNumber,
        name,
        studio: studio ? {
          name: studio.name || `${name}的工作室`,
          subdomain: studio.subdomain || 'admin'
        } : undefined
      })

      return reply.code(201).send({
        artist: result.artist,
        totpSecret: result.totpSecret,
        otpauthUri: result.otpauthUri,
        studio: result.studio
      })
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ code: err.code, error: err.message, detail: err.detail || undefined })
      }
      throw err
    }
  })

  /**
   * POST /api/setup/totp-confirm
   * 验证 TOTP 绑定并完成设置
   * 限流：同 IP 10 次/5 分钟
   */
  fastify.post('/api/setup/totp-confirm', {
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    guardSetupGone()
    guardRateLimit(`setup-totp:${request.ip}`, 10, 5 * 60_000)

    const { qqNumber, code } = request.body as { qqNumber: string; code: string }

    try {
      const result = confirmTotpAndComplete({ qqNumber, code })

      // 签发会话 cookie（与 auth.routes.ts 一致）
      reply.setCookie('artist_token', result.token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 // 7 天
      })

      return reply.code(200).send({
        isAdmin: result.isAdmin,
        artist: result.artist
      })
    } catch (err) {
      if (err instanceof AppError) {
        return reply.code(err.statusCode).send({ code: err.code, error: err.message, detail: err.detail || undefined })
      }
      throw err
    }
  })
}
