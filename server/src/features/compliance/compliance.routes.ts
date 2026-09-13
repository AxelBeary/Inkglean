import * as complianceService from './compliance.service.js'
import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { E } from '../../shared/errors.js'
import * as artistService from '../artist/artist.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 合规与内容安全路由（REQ-042）
// 公开：举报提交（限流对齐留言：同 IP 每分钟 2 条）
// 管理端：举报列表/处理、内容下架/恢复、主页下架/恢复、画师封禁/解封、留痕查看
//        （均写 admin_actions 留痕）
// v75（P4 后端批）：上述写动作一律把 request.ip 透传进 service 落 admin_ip / report_ip
//        （取 IP 口径见 docs/OPS.md §12.1 与 tests/cf-real-ip.test.ts：CF→Caddy 已在反代层
//         换算真实用户 IP，后端只信 request.ip，不读裸 CF-Connecting-IP 头）
// ============================================

export default async function complianceRoutes(fastify: FastifyInstance) {

  // REQ-041 + d2 猎杀修复（2026-08-14）：本插件内 /api/admin/reports、/api/admin/content/* 补挂 step-up 入口级守卫
  //（onRoute 按 url 前缀过滤，/api/public/reports 不受影响）；此前漏挂致 basic 会话可直操举报处理/内容下架
  // v75/v76 新增的 /api/admin/admin-actions、/api/admin/artists/:id/home-takedown、
  // /api/admin/artists/:id/home-restore、/api/admin/content/artwork/:id/restore 同样写在本插件内，
  // 因此自动继承该守卫——registerAdminStepUpHooks 是 onRoute 钩子，按 routeOptions.url.startsWith('/api/admin')
  // 匹配（shared/middleware/step-up.ts:86）；新管理口若挪出本文件或不挂 requireAdmin，就会漏 step-up（d2 同类病）
  registerAdminStepUpHooks(fastify)

  /** 举报类型白名单 */
  const REPORT_TYPES = ['artist_home', 'artwork', 'message', 'other']

  /** 留痕 action 白名单（?action= 精确筛用；非法值忽略筛选返回全量，与全站列表惯例一致） */
  const ADMIN_ACTIONS = [
    'report_resolve', 'content_remove', 'content_restore',
    'artist_ban', 'artist_unban', 'home_takedown', 'home_restore',
    'artist_status_set', 'artist_remove'
  ]

  /**
   * POST /api/public/reports
   * 页脚统一举报入口（匿名可提交；targetId 可选）
   */
  fastify.post('/api/public/reports', {
    schema: {
      body: {
        type: 'object',
        required: ['targetType', 'description'],
        properties: {
          targetType: { type: 'string', enum: REPORT_TYPES },
          targetId: { type: ['integer', 'null'], minimum: 1 },
          description: { type: 'string', minLength: 1, maxLength: 1000 },
          contact: { type: ['string', 'null'], maxLength: 100 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // 对齐留言提交限流强度（同 IP 每分钟 2 条）
    if (!rateLimit(`report:${request.ip}`, 2, 60_000)) {
      return reply.code(429).send({ code: E.RATE_LIMITED, error: '操作过于频繁，请稍后再试' })
    }
    const body = request.body as { targetType: string; targetId?: number | null; description: string; contact?: string | null }
    const report = complianceService.createReport({
      targetType: body.targetType,
      targetId: body.targetId ?? null,
      description: body.description,
      contact: body.contact ?? null,
      // v75 取证 IP：同一个值刚用于限流（限流用完即丢，落库后才谈得上事后追溯），直接复用
      reportIp: request.ip
    })
    return reply.code(201).send({ id: report?.id })
  })

  // ─── 管理端（requireAdmin） ───

  /** 统一整数路径参数 schema（对齐 admin.routes 范式） */
  const intId = { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } }

  /**
   * GET /api/admin/reports
   * 举报列表（?status=pending|resolved 筛选；不传 = 全部，时间倒序）
   */
  fastify.get('/api/admin/reports', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'resolved'] }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const { status } = (request.query as { status?: string }) || {}
    return complianceService.getReports(status)
  })

  /**
   * GET /api/admin/admin-actions
   * 管理动作留痕查看入口（v75 补 IP 后才算真正能用：账本可查来源）
   * ?limit=（默认 100，service 钳制 1~500）、?action=（白名单精确筛）、
   * ?targetType= + ?targetId=（成对才生效，走索引 idx_admin_actions_target）
   * 鉴权边界：admin_ip 只在本前缀下出现，任何非 /api/admin 响应不得带出（P4-1 §5）
   */
  fastify.get('/api/admin/admin-actions', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          // 刻意不设 maximum：超上限由 service 钳制（传 9999 得到 500 条），与全站列表惯例一致
          limit: { type: 'integer' },
          action: { type: 'string' },
          targetType: { type: 'string' },
          targetId: { type: 'integer' }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const q = (request.query as { limit?: number; action?: string; targetType?: string; targetId?: number }) || {}
    const filters: complianceService.AdminActionFilters = {}
    if (Number.isFinite(q.limit)) filters.limit = q.limit
    // 白名单外（含拼错）→ 忽略该筛选条件而非 400：管理页筛选器不该因为一个脏参数就整页报错
    if (q.action && ADMIN_ACTIONS.includes(q.action)) filters.action = q.action
    // targetType 与 targetId 成对才生效：单给 targetType 既命中不了复合索引，也容易让运维误读结果
    if (q.targetType && Number.isFinite(q.targetId)) {
      filters.targetType = q.targetType
      filters.targetId = q.targetId
    }
    return {
      rows: complianceService.getAdminActions(filters),
      total: complianceService.countAdminActions(filters)
    }
  })

  /**
   * POST /api/admin/reports/:id/resolve
   * 标记举报已处理（写 admin_actions 留痕；reason 可选）
   */
  fastify.post('/api/admin/reports/:id/resolve', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: ['string', 'null'], maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const reportId = Number((request.params as { id: string }).id)
    const { reason } = (request.body as { reason?: string | null }) || {}
    const report = complianceService.resolveReport(reportId, request.artist.id, reason, request.ip)
    if (!report) return reply.code(404).send({ error: '举报不存在' })
    return { success: true, report }
  })

  /**
   * POST /api/admin/content/:type/:id/remove
   * 内容下架（v76 起 type=artwork = 置 takedown_at，行保留可恢复；type=message = 管理员软删除）；写留痕
   */
  fastify.post('/api/admin/content/:type/:id/remove', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['artwork', 'message'] },
          id: { type: 'integer' }
        },
        required: ['type', 'id']
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: ['string', 'null'], maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { type, id } = request.params as { type: 'artwork' | 'message'; id: string }
    const { reason } = (request.body as { reason?: string | null }) || {}
    const result = complianceService.removeContent(type, Number(id), request.artist.id, reason, request.ip)
    if (!result.success) return reply.code(404).send({ error: '内容不存在或已删除' })
    // already：幂等回显（已下架再点不重复记账），前端据此提示「该作品已处于下架态」
    return { success: true, ...(result.already ? { already: true } : {}) }
  })

  /**
   * POST /api/admin/content/artwork/:id/restore
   * 解除作品下架（v76 与 remove 成对；行一直在，恢复后直接回到公开端）；写留痕 content_restore
   */
  fastify.post('/api/admin/content/artwork/:id/restore', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: ['string', 'null'], maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artworkId = Number((request.params as { id: string }).id)
    const { reason } = (request.body as { reason?: string | null }) || {}
    const result = complianceService.restoreContent(artworkId, request.artist.id, reason, request.ip)
    if (!result.success) return reply.code(404).send({ error: '作品不存在' })
    return { success: true }
  })

  /**
   * POST /api/admin/artists/:id/home-takedown | /home-restore
   * 主页内容级下架/恢复（v76）：只动 artists.home_takedown_at/_reason，
   * **不 bump token_version、不动 is_banned / status**——处置阶梯「警告 → 内容下架 → 封禁」的中间格，
   * 画师要能登进后台看原因并整改（区别于 ban：ban 连人踢出且拒登录）
   */
  for (const [path, isTakedown, actionLabel] of [
    ['home-takedown', true, '下架'],
    ['home-restore', false, '恢复']
  ] as Array<[string, boolean, string]>) {
    fastify.post(`/api/admin/artists/:id/${path}`, {
      preHandler: requireAdmin,
      schema: {
        ...intId,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: ['string', 'null'], maxLength: 500 }
          }
        }
      }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const artistId = Number((request.params as { id: string }).id)
      const artist = artistService.getArtistById(artistId)
      if (!artist) return reply.code(404).send({ error: '画师不存在' })
      const { reason } = (request.body as { reason?: string | null }) || {}
      if (isTakedown) {
        if (artist.qq_number === getAdminQq()) {
          // 与 ban 同口径（见本文件 :160 附近的封禁守卫）：管理员账号不可被主页下架，防锁死平台
          return reply.code(403).send({ error: `不能${actionLabel}管理员账号` })
        }
        const result = complianceService.takedownArtistHome(artistId, request.artist.id, reason, request.ip)
        if (!result.success) return reply.code(404).send({ error: '画师不存在' })
        // 幂等：已是下架态回 200 + already，且不重复写留痕
        return result.already ? { success: true, already: true } : { success: true }
      }
      const result = complianceService.restoreArtistHome(artistId, request.artist.id, reason, request.ip)
      if (!result.success) return reply.code(404).send({ error: '画师不存在' })
      return { success: true }
    })
  }

  /**
   * POST /api/admin/artists/:id/ban | /unban
   * 封禁/解封（is_banned 独立态；封禁即踢下线）；写留痕
   */
  for (const [path, banned, actionLabel] of [
    ['ban', true, '封禁'],
    ['unban', false, '解封']
  ] as Array<[string, boolean, string]>) {
    fastify.post(`/api/admin/artists/:id/${path}`, {
      preHandler: requireAdmin,
      schema: {
        ...intId,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: ['string', 'null'], maxLength: 500 }
          }
        }
      }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      const artistId = Number((request.params as { id: string }).id)
      const artist = artistService.getArtistById(artistId)
      if (!artist) return reply.code(404).send({ error: '画师不存在' })
      if (artist.qq_number === getAdminQq()) {
        // 与「不能删除管理员账号」同口径：管理员账号不可封禁，防锁死平台
        return reply.code(403).send({ error: `不能${actionLabel}管理员账号` })
      }
      const { reason } = (request.body as { reason?: string | null }) || {}
      complianceService.setArtistBanned(artistId, banned, request.artist.id, reason, request.ip)
      return { success: true, isBanned: banned ? 1 : 0 }
    })
  }
}
