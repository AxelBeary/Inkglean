import { createHash } from 'crypto'
import { requireAuth } from '../../shared/middleware/auth.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import * as feedService from './calendar-feed.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 日历订阅（ICS）路由 — oimimo 吸纳批一
// 画师端：开关 / 查状态 / 旋转令牌（Bearer 会话鉴权）
// 公开端：GET calendar.ics?token=（令牌即凭证，无会话）
// ============================================

/** 公开订阅限流守卫：令牌 192bit 爆破不可行，限流只防刷（对齐公开读接口范式） */
function guardFeedRateLimit(request: FastifyRequest): void {
  if (!rateLimit(`calendar-feed:${request.ip}`, 30, 60_000)) throw new AppError(E.RATE_LIMITED, 429)
}

export default async function calendarFeedRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/artist/calendar-feed
   * 查询订阅状态（enabled + 含令牌的订阅路径；未启用 url=null）
   */
  fastify.get('/api/artist/calendar-feed', { preHandler: [requireAuth] }, async (request: FastifyRequest) => {
    return feedService.getFeedInfo(request.artist.id)
  })

  /**
   * PUT /api/artist/calendar-feed
   * 开关订阅：首次开启生成令牌；关闭只落开关（重开沿用原链接）
   */
  fastify.put('/api/artist/calendar-feed', {
    preHandler: [requireAuth],
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        properties: { enabled: { type: 'boolean' } },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { enabled } = request.body as { enabled: boolean }
    return feedService.setFeedEnabled(request.artist.id, enabled)
  })

  /**
   * POST /api/artist/calendar-feed/rotate
   * 旋转令牌：旧订阅链接立即失效（链接泄露时的止损手段）
   */
  fastify.post('/api/artist/calendar-feed/rotate', { preHandler: [requireAuth] }, async (request: FastifyRequest) => {
    return feedService.rotateFeedToken(request.artist.id)
  })

  /**
   * GET /api/public/artist/:subdomain/calendar.ics?token=
   * 公开订阅端点——手机日历（iOS/Android）按此 URL 定期拉取。
   * 安全口径：画师不存在/已删除/封禁/未启用/令牌不符一律 404（不泄露订阅是否存在的差异）。
   */
  fastify.get('/api/public/artist/:subdomain/calendar.ics', async (request: FastifyRequest, reply: FastifyReply) => {
    guardFeedRateLimit(request)
    const { subdomain } = request.params as { subdomain: string }
    const provided = (request.query as { token?: string }).token ?? ''

    const artist = feedService.getFeedArtist(subdomain)
    if (!artist || !feedService.verifyFeedToken(artist.calendar_feed_token as string, provided)) {
      return reply.code(404).send({ error: 'Not found' })
    }

    const ics = feedService.buildIcs(artist)
    const etag = `"${createHash('sha256').update(ics).digest('hex').slice(0, 32)}"`
    // 手机日历定期拉取：ETag 命中返回 304 省流量；不命中不缓存（排期随时变）
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).header('ETag', etag).send()
    }
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .header('ETag', etag)
      .send(ics)
  })
}
