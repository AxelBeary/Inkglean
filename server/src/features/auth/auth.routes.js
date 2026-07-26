import { generateLoginCode, verifyLoginCode, createSession, isDevAuth } from './auth.service.js'
import { requireAuth, getAdminQq } from '../../shared/middleware/auth.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'

// ============================================
// 认证路由 - 登录码获取与验证
// ============================================

export default async function authRoutes(fastify) {

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
  }, async (request, reply) => {
    const ip = request.ip
    if (!rateLimit(`send-code:${ip}`, 5, 5 * 60_000)) {
      return reply.code(429).send({ error: '请求过于频繁，请稍后再试' })
    }

    const { qqNumber } = request.body || {}
    if (!qqNumber) return reply.code(400).send({ error: '请输入QQ号' })

    try {
      const { code, artist } = generateLoginCode(qqNumber)

      // P0-5: 仅 AUTH_DEV_MODE=*** 返回登录码
      if (isDevAuth) {
        fastify.log.info(`🔑 [DEV] 画师 ${artist.name}(${qqNumber}) 登录码: ${code}`)
      }

      return {
        message: `登录码已发送至QQ ${qqNumber}`,
        ...(isDevAuth ? { _dev_code: code } : {}),
        artistName: artist.name
      }
    } catch (err) {
      return reply.code(400).send({ error: err.message })
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
    const ip = request.ip
    if (!rateLimit(`verify:${ip}`, 10, 5 * 60_000)) {
      return reply.code(429).send({ error: '尝试次数过多，请稍后再试' })
    }

    const { qqNumber, code } = request.body || {}
    if (!qqNumber || !code) return reply.code(400).send({ error: '请输入QQ号和登录码' })

    const result = verifyLoginCode(qqNumber, code)
    if (!result.valid) return reply.code(401).send({ error: result.error })

    const token = createSession(result.artist.id)
    const isAdmin = result.artist.qq_number === getAdminQq()

    return {
      token,
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
   */
  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return request.artist
  })
}
