import { requireAuth, requireAdmin } from '../../shared/middleware/auth.js'
import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
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
/** d2 猎杀修复（2026-08-14）：IP 总量封顶——token:IP 双因子配额可被「跨分钟囤积 anon-token」绕过
 *（签发 10 个/分钟，囤一天后每个 token 各持 100 条/分钟配额，单 IP 写入量无总上限），
 * 叠加纯 IP 维总量 300 条/分钟：正常单客/小店远低于此，刷量者无论囤多少 token 都被此闸按住 */
const EVENTS_IP_RATE_MAX = 300

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
  // d2 P2: 与 requireAuth 语义对齐——封禁画师的旧 token 不得携带 artist_id 上报
  if (!artist || artist.deleted_at || artist.is_banned) return null
  if (artist.token_version && session.v !== artist.token_version) return null
  return artist
}

export default async function trackingRoutes(fastify: FastifyInstance) {

  // REQ-041：/api/admin/tracking* 同为管理后台路由，受 step-up 入口级守卫保护
  // （onRoute 按 url 前缀过滤，/api/events、/api/artist/tracking/* 不受影响）
  registerAdminStepUpHooks(fastify)

  /** POST /api/anon-token — 签发匿名凭证（无鉴权；前端首次上报前自动调用，前端自存） */
  fastify.post('/api/anon-token', async (request, reply) => {
    // R1 修复（巡检 04-to-01）：防刷——同 IP 每分钟最多 10 次（正常前端首次上报 1 次/会话）
    if (!rateLimit(`anon-token:${request.ip}`, 10, 60_000)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }
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

    // stats_mode='off'：管理员关闭埋点 → 事件静默丢弃（返回 ok 不落库，对前端无感知）
    if (trackingService.getStatsMode() === 'off') {
      return { ok: true, received: 0 }
    }

    // 限流：同凭证 + 同 IP 双因子每分钟 100 条，防刷库（REQ-033 §2.2 + 巡检 R1 修复）
    // 双因子 key 保留 token 维度（正常用户独立配额），并绑定 IP——配合 anon-token 签发限流堵住轮换 token 刷量
    // d2 猎杀修复：叠加纯 IP 总量闸（囤积 token 绕不过），双层先 IP 后凭证
    if (!rateLimit(`events-ip:${request.ip}`, EVENTS_IP_RATE_MAX, EVENTS_RATE_WINDOW_MS)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }
    const limitKey = body.token ? `${body.token}:${request.ip}` : request.ip
    if (!rateLimit(`events:${limitKey}`, EVENTS_RATE_MAX, EVENTS_RATE_WINDOW_MS)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }

    // 白名单校验：只收白名单事件，其余 400（REQ-033 §2.2）
    for (const ev of body.events) {
      if (!WHITELIST_SET.has(String(ev.name))) {
        // d2 P2: 不回显用户输入（name 可含换行/控制字符，防污染响应体与日志）
        return reply.code(400).send({ code: 'INVALID_EVENT_NAME', error: '事件名不在白名单，请检查后重试' })
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

  // ============================================
  // 统计读接口（REQ-033 收尾）
  // ============================================

  /** GET /api/admin/tracking/summary — 管理员全局事件统计（近 N 天，默认 30，范围 1..90） */
  fastify.get('/api/admin/tracking/summary', { preHandler: requireAdmin }, async (request, reply) => {
    // 防刷：同管理员每分钟最多 30 次（管理员正常看页不会超过）
    if (!rateLimit(`admin-tracking:${request.artist.id}`, 30, 60_000)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }
    const { days } = request.query as { days?: string }
    const d = Math.min(Math.max(parseInt(days ?? '30', 10) || 30, 1), 90)
    return trackingService.getTrackingSummary(d)
  })

  /** GET /api/artist/tracking/summary — 画师自己的事件统计（门面区块；enabled=管理员开关） */
  fastify.get('/api/artist/tracking/summary', { preHandler: requireAuth }, async (request, reply) => {
    // 防刷：同画师每分钟最多 30 次（画师正常看页不会超过）
    if (!rateLimit(`artist-tracking:${request.artist.id}`, 30, 60_000)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }
    const { days } = request.query as { days?: string }
    const d = Math.min(Math.max(parseInt(days ?? '14', 10) || 14, 1), 90)
    const mode = trackingService.getStatsMode()
    // mode=hidden/off：画师端统计不可见（enabled 兼容旧字段）；mode=on 才返回统计数据
    if (mode !== 'on') {
      return { mode, enabled: false }
    }
    const summary = trackingService.getArtistTrackingSummary(request.artist.id, d)
    return { mode, enabled: true, ...summary }
  })

  /** GET /api/admin/tracking-config — 读管理员开关（画师门面统计显隐） */
  fastify.get('/api/admin/tracking-config', { preHandler: requireAdmin }, async () => {
    const mode = trackingService.getStatsMode()
    return {
      statsMode: mode,
      artistStatsVisible: trackingService.getArtistStatsVisible(),
      // 820-L（v68）: 统计功能总开关（默认关闭；关闭时画师后台隐藏整个统计导航）
      statsEnabled: trackingService.getStatsEnabled()
    }
  })

  /** PUT /api/admin/tracking-config — 写管理员三态开关
   * 新 body { statsMode: 'off'|'hidden'|'on' }；旧 body { artistStatsVisible: boolean } 兼容（true→on / false→hidden）；
   * 820-L 追加 { statsEnabled: boolean }（统计功能总开关，与三态独立）
   */
  fastify.put('/api/admin/tracking-config', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        properties: {
          statsMode: { type: 'string', enum: ['off', 'hidden', 'on'] },
          artistStatsVisible: { type: 'boolean' },
          statsEnabled: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const body = request.body as {
      statsMode?: trackingService.StatsMode
      artistStatsVisible?: boolean
      statsEnabled?: boolean
    }
    if (body.statsEnabled !== undefined) {
      trackingService.setStatsEnabled(body.statsEnabled)
    } else if (body.statsMode !== undefined) {
      trackingService.setStatsMode(body.statsMode)
    } else if (body.artistStatsVisible !== undefined) {
      // 兼容旧前端：true→on（可见+收集）；false→hidden（仅隐藏显示）
      trackingService.setArtistStatsVisible(body.artistStatsVisible)
    } else {
      return reply.code(400).send({ code: 'INVALID_PARAM', error: '缺少 statsMode、artistStatsVisible 或 statsEnabled' })
    }
    const mode = trackingService.getStatsMode()
    return {
      statsMode: mode,
      artistStatsVisible: trackingService.getArtistStatsVisible(),
      statsEnabled: trackingService.getStatsEnabled()
    }
  })
}
