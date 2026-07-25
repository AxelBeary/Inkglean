import { generateLoginCode, verifyLoginCode, createSession } from './auth.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'

// ============================================
// 认证路由 - 登录码获取与验证
// ============================================

const isDev = process.env.NODE_ENV !== 'production'

export default async function authRoutes(fastify) {

  /**
   * POST /api/auth/send-code
   * 发送登录码（限流：同IP 5次/5分钟）
   */
  fastify.post('/api/auth/send-code', async (request, reply) => {
    const ip = request.ip
    if (!rateLimit(`send-code:${ip}`, 5, 5 * 60_000)) {
      return reply.code(429).send({ error: '请求过于频繁，请稍后再试' })
    }

    const { qqNumber } = request.body || {}
    if (!qqNumber) return reply.code(400).send({ error: '请输入QQ号' })

    try {
      const { code, artist } = generateLoginCode(qqNumber)

      // 开发模式：输出登录码到控制台 + 返回给前端
      if (isDev) {
        fastify.log.info(`🔑 [DEV] 画师 ${artist.name}(${qqNumber}) 登录码: ${code}`)
      }

      return {
        message: `登录码已发送至QQ ${qqNumber}`,
        ...(isDev ? { _dev_code: code } : {}),
        artistName: artist.name
      }
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /api/auth/verify
   * 验证登录码（限流：同IP 10次/5分钟）
   */
  fastify.post('/api/auth/verify', async (request, reply) => {
    const ip = request.ip
    if (!rateLimit(`verify:${ip}`, 10, 5 * 60_000)) {
      return reply.code(429).send({ error: '尝试次数过多，请稍后再试' })
    }

    const { qqNumber, code } = request.body || {}
    if (!qqNumber || !code) return reply.code(400).send({ error: '请输入QQ号和登录码' })

    const result = verifyLoginCode(qqNumber, code)
    if (!result.valid) return reply.code(401).send({ error: result.error })

    const token = createSession(result.artist.id)

    return {
      token,
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
