import * as dashboardService from './dashboard.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 仪表盘路由（v0.18 第二批）
// 收入统计 + 合并待办 + 活动流
// ============================================

export default async function dashboardRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/artist/dashboard/revenue?period=month|quarter|year
   * 收入统计（柱状图数据 + 汇总 + 环比）
   */
  fastify.get('/api/artist/dashboard/revenue', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['month', 'quarter', 'year'], default: 'month' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const period = (request.query as { period?: string })?.period || 'month'
    return dashboardService.getRevenue(request.artist.id, period)
  })

  /**
   * GET /api/artist/dashboard/todo
   * "现在要干什么"合并列表（6 级排序）
   */
  fastify.get('/api/artist/dashboard/todo', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return { items: dashboardService.getTodoList(request.artist.id) }
  })

  /**
   * GET /api/artist/dashboard/activity
   * 最近活动流（order_notes 前 10 条）
   */
  fastify.get('/api/artist/dashboard/activity', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return { items: dashboardService.getActivity(request.artist.id) }
  })

  /**
   * GET /api/artist/onboarding
   * REQ-043 I2: 开张任务卡状态（dismissed + 三项任务 done）
   */
  fastify.get('/api/artist/onboarding', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return dashboardService.getOnboarding(request.artist.id)
  })

  /**
   * POST /api/artist/onboarding/dismiss
   * REQ-043 I2: 「不再提示」——写 onboarding_dismissed_at（前端不靠 localStorage）
   * body 必须为空对象（schema 拒绝任何附加字段）
   */
  fastify.post('/api/artist/onboarding/dismiss', {
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // 安全纪律（REQ-043）：本接口无任何输入，显式拒绝携带 body 字段的请求
    // （Fastify 默认 AJV removeAdditional 会静默剥离空 properties 之外的字段，这里由处理器兜底）
    if (request.body && typeof request.body === 'object' && Object.keys(request.body as object).length > 0) {
      return reply.code(400).send({ code: 'VALIDATION', error: '请求参数格式不正确（body）' })
    }
    return dashboardService.dismissOnboarding(request.artist.id)
  })
}
