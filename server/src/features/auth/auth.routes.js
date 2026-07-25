import { generateLoginCode, verifyLoginCode, createSession } from './auth.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'

// ============================================
// 认证路由 - 登录码获取与验证
// ============================================

// 简易内存速率限制（per-IP，MVP 够用）
const rateBuckets = new Map()
function rateLimit(key, maxHits, windowMs) {
  const now = Date.now()
  const bucket = rateBuckets.get(key) || { hits: 0, resetAt: now + windowMs }
  if (now > bucket.resetAt) { bucket.hits = 0; bucket.resetAt = now + windowMs }
  bucket.hits++
  rateBuckets.set(key, bucket)
  return bucket.hits <= maxHits
}

// 定期清理过期桶（unref 避免阻止进程退出 / 测试挂起）
const _cleanup = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of rateBuckets) if (now > v.resetAt) rateBuckets.delete(k)
}, 60_000)
_cleanup.unref()

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

      // TODO Phase 2: 通过 QQ Bot 发送登录码，删除 _dev_code
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
