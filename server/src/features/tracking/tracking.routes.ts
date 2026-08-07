import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { verifySession } from '../auth/auth.service.js'
import { getArtistById } from '../artist/artist.service.js'
import * as trackingService from './tracking.service.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Artist } from '../../types/entities.js'

// ============================================
// 业务埋点路由（REQ-033）
// POST /api/anon-token — 匿名凭证签发
// POST /api/events — 事件批量上报
// ============================================

/** 单请求事件上限（防刷库/超大 body） */
const MAX_EVENTS_PER_REQUEST = 50
/** 限流：同凭证（或同 IP）每分钟最多 100 条 */
const EVENTS_RATE_MAX = 100
const EVENTS_RATE_WINDOW_MS = 60_000

const WHITELIST_SET = new Set<string>(trackingService.EVENT_WHITELIST)

/**
 * 可选登录态解析：画师事件带 artist_id（REQ-033 §4.3）
 * 与 requireAuth 不同——访客上报不强制登录，解析失败静默返回 null
 * （cookie 优先，Authorization Bearer 兜底，与 shared/middleware/auth.ts 提取规则一致）
 */
function getOptionalArtist(request: FastifyRequest): Artist | null {
  const cookieToken = request.cookies?.artist_token
  const authHeader = request.headers.authorization
  const token = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)
  if (!token) return null
  const session = verifySession(token)
  if (!session) return null
  const artist = getArtistById(session.id) as Artist | undefined
  if (!artist || artist.deleted_at) return null
  if (artist.token_version && session.v !== artist.token_version) return null
  return artist
}

export default async function trackingRoutes(fastify: FastifyInstance) {

  /** POST /api/anon-token — 签发匿名凭证（无鉴权；前端首次上报前自动调用，前端自存） */
  fastify.post('/api/anon-token', async () => {
    const token = trackingService.issueAnonToken()
    return { token }
  })

  /**
   * POST /api/events — 批量上报埋点事件
   * 鉴权（REQ-033 §2.2 拍板 B）：画师已登录 → 记 artist_id（匿名凭证不强制）；
   * 未登录 → 必须携带有效匿名凭证（anon token），否则 400 INVALID_ANON_TOKEN（前端静默重取）
   */
  fastify.post('/api/events', {
    schema: {
      body: {
        type: 'object',
        required: ['events'],
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 128 },
          events: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_EVENTS_PER_REQUEST,
            items: {
              type: 'object',
              required: ['name', 'ts'],
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 64 },
                ts: { type: 'number', minimum: 0 },
                version: { anyOf: [{ type: 'string', maxLength: 64 }, { type: 'number' }] }
              },
              // payload 开放扩展（accent/palette_version/page/action 等），只约束基础字段
              additionalProperties: true
            }
          }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const body = request.body as { token?: string; events: Array<Record<string, unknown>> }

    // 限流：同凭证（或同 IP）每分钟 100 条，防刷库（REQ-033 §2.2）
    const limitKey = body.token || request.ip
    if (!rateLimit(`events:${limitKey}`, EVENTS_RATE_MAX, EVENTS_RATE_WINDOW_MS)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }

    // 白名单校验：只收白名单事件，其余 400（REQ-033 §2.2）
    for (const ev of body.events) {
      if (!WHITELIST_SET.has(String(ev.name))) {
        return reply.code(400).send({ code: 'INVALID_EVENT_NAME', error: `事件名不在白名单: ${String(ev.name)}` })
      }
    }

    // 凭证/登录态鉴权
    const artist = getOptionalArtist(request)
    let anonId: number | null = null
    if (artist) {
      // 画师事件走登录态（REQ-033 §4.3）；若同时带了 token 也顺带解析（续期）
      if (body.token) anonId = trackingService.resolveAnonToken(body.token)
    } else {
      if (!body.token) {
        return reply.code(400).send({ code: 'INVALID_ANON_TOKEN', error: '缺少有效匿名凭证' })
      }
      anonId = trackingService.resolveAnonToken(body.token)
      if (anonId == null) {
        return reply.code(400).send({ code: 'INVALID_ANON_TOKEN', error: '匿名凭证无效或已过期' })
      }
    }

    // 落库
    const received = trackingService.insertEvents(
      body.events as trackingService.TrackedEvent[],
      artist ? artist.id : null,
      anonId
    )
    return { ok: true, received }
  })
}