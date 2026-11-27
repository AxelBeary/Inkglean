import { requireAdmin } from '../../shared/middleware/auth.js'
import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { E } from '../../shared/errors.js'
import * as activityService from './activity.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { ActorKind } from './activity.service.js'

// ============================================
// 事件流水查询路由（「事件流水幕布」步 1，2026-11-28 立项）
//
// GET /api/admin/activity-events —— 管理员事件流水（分页 + action/actor/时间范围筛选）
//
// 守卫三件套（缺一即漏洞，见 SPEC 风险 R10）：
//   ① requireAdmin：非管理员 403（管理员唯一真值 platform_config.admin_qq）；
//   ② registerAdminStepUpHooks(fastify)：**每个新路由插件必须自己调一次** —— 它是 onRoute
//      钩子，按 url 前缀 '/api/admin' 匹配，不调用则本插件的管理口拿不到 step-up 守卫
//      （只会在别处 console.warn 兜底，行为与全站不一致）；
//   ③ 限流：流水面是本批新增的读口，管理员误开多标签轮询会翻倍请求，给个宽松上限兜住。
//
// 响应面纪律：ip 是「谁干的」这类取证信息，只到 /api/admin/* 为止（对齐 admin_actions.admin_ip
// 与 reports.report_ip 的既有口径）；本端点之外的任何响应体都不得出现 ip/ua
// （tests/activity-events.test.ts 的逆泄露用例钉死）。
// ============================================

/** actor_kind 四态（库层 CHECK 同款；非法值忽略该筛选，与全站列表惯例一致） */
const ACTOR_KINDS: readonly ActorKind[] = ['admin', 'artist', 'client', 'anon']

/** 时间筛选上限保护：from/to 必须是可表示的毫秒数 */
function parseMs(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

export default async function activityRoutes(fastify: FastifyInstance) {
  // REQ-041：本插件内的 /api/admin/activity-events 必须挂 step-up 入口级守卫
  registerAdminStepUpHooks(fastify)

  /**
   * GET /api/admin/activity-events
   * 查询参数（全部可选）：
   *   action    精确筛（沿用写入侧 action，管理动作为 admin_actions.action 原名）
   *   actorKind admin | artist | client | anon
   *   actorId   正整数
   *   from / to 毫秒时间戳（闭区间）
   *   beforeId  游标（只取 id 更小的，配合 at DESC, id DESC 翻页）
   *   limit     服务端钳制 1–200（默认 50）
   * 响应：{ rows, nextBeforeId, hasMore }
   */
  fastify.get('/api/admin/activity-events', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          action: { type: 'string', maxLength: 64 },
          actorKind: { type: 'string', enum: [...ACTOR_KINDS] },
          actorId: { type: 'integer', minimum: 1 },
          from: { type: 'integer', minimum: 0 },
          to: { type: 'integer', minimum: 0 },
          beforeId: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: activityService.ACTIVITY_LIMIT_MAX }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // 限流：管理员单页轮询最常见的形态是 5 秒一次（12 次/分钟），给 120 次/分钟留足余量，
    // 只拦失控循环（前端多标签/写错轮询间隔），不影响正常使用
    if (!rateLimit(`admin-activity-events:${request.ip}`, 120, 60_000)) {
      return reply.code(429).send({ code: E.RATE_LIMITED, error: '操作过于频繁，请稍后再试' })
    }

    const q = request.query as {
      action?: string
      actorKind?: ActorKind
      actorId?: number
      from?: number
      to?: number
      beforeId?: number
      limit?: number
    }

    // from > to 时返回空页而不是报错：时间窗是可调控件，前端拖动过程中出现瞬时倒置属正常交互
    if (parseMs(q.from) != null && parseMs(q.to) != null && Number(q.from) > Number(q.to)) {
      return { rows: [], nextBeforeId: null, hasMore: false }
    }

    const page = activityService.queryEvents({
      action: q.action ?? null,
      actorKind: q.actorKind ?? null,
      actorId: q.actorId ?? null,
      from: parseMs(q.from),
      to: parseMs(q.to),
      beforeId: q.beforeId ?? null,
      limit: q.limit ?? null
    })

    return {
      rows: page.rows.map(activityService.toActivityEventDTO),
      nextBeforeId: page.nextBeforeId,
      hasMore: page.hasMore
    }
  })

  /**
   * GET /api/admin/activity-events/filters
   * 筛选器可选值（action 白名单 + actor_kind 四态）。
   * 前端幕布的「按事件类型筛选」下拉需要枚举；写死在前端会造成双事实源漂移，
   * 故由服务端下发（与 ACTIONS 常量同源）。
   */
  fastify.get('/api/admin/activity-events/filters', {
    preHandler: requireAdmin
  }, async () => {
    return {
      actorKinds: [...ACTOR_KINDS],
      actions: [
        activityService.ACTIONS.loginSuccess,
        activityService.ACTIONS.loginFail,
        activityService.ACTIONS.stepupFail,
        activityService.ACTIONS.orderCreate,
        activityService.ACTIONS.referenceUpload,
        activityService.ACTIONS.reportSubmit,
        activityService.ACTIONS.guestbookPost
      ]
    }
  })
}
