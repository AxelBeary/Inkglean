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
// 管理端：举报列表/处理、内容下架、画师封禁/解封（均写 admin_actions 留痕）
// ============================================

export default async function complianceRoutes(fastify: FastifyInstance) {

  // REQ-041 + d2 猎杀修复（2026-08-14）：本插件内 /api/admin/reports、/api/admin/content/* 补挂 step-up 入口级守卫
  //（onRoute 按 url 前缀过滤，/api/public/reports 不受影响）；此前漏挂致 basic 会话可直操举报处理/内容下架
  registerAdminStepUpHooks(fastify)

  /** 举报类型白名单 */
  const REPORT_TYPES = ['artist_home', 'artwork', 'message', 'other']

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
      contact: body.contact ?? null
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
    const report = complianceService.resolveReport(reportId, request.artist.id, reason)
    if (!report) return reply.code(404).send({ error: '举报不存在' })
    return { success: true, report }
  })

  /**
   * POST /api/admin/content/:type/:id/remove
   * 内容下架（type=artwork → 现有删除语义；type=message → 现有管理员软删除）；写留痕
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
    const result = complianceService.removeContent(type, Number(id), request.artist.id, reason)
    if (!result.success) return reply.code(404).send({ error: '内容不存在或已删除' })
    return { success: true }
  })

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
      complianceService.setArtistBanned(artistId, banned, request.artist.id, reason)
      return { success: true, isBanned: banned ? 1 : 0 }
    })
  }
}
