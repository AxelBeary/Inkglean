import * as dashboardService from './dashboard.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'

// ============================================
// 仪表盘路由（v0.18 第二批）
// 收入统计 + 合并待办 + 活动流
// ============================================

export default async function dashboardRoutes(fastify) {

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
  }, async (request) => {
    const period = request.query?.period || 'month'
    return dashboardService.getRevenue(request.artist.id, period)
  })

  /**
   * GET /api/artist/dashboard/todo
   * "现在要干什么"合并列表（6 级排序）
   */
  fastify.get('/api/artist/dashboard/todo', {
    preHandler: requireAuth
  }, async (request) => {
    return { items: dashboardService.getTodoList(request.artist.id) }
  })

  /**
   * GET /api/artist/dashboard/activity
   * 最近活动流（order_notes 前 10 条）
   */
  fastify.get('/api/artist/dashboard/activity', {
    preHandler: requireAuth
  }, async (request) => {
    return { items: dashboardService.getActivity(request.artist.id) }
  })
}
