import * as dashboardService from './dashboard.service.js'
import * as dashboardPrefsService from './dashboard-prefs.service.js'
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
   * GET /api/artist/dashboard/schedule
   * 近 7 日排期条（窗口 = 本地今日-1 天 ~ 本地今日+6 天）
   */
  fastify.get('/api/artist/dashboard/schedule', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return { bars: dashboardService.getSchedule(request.artist.id) }
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
   * GET /api/artist/dashboard/income-overview
   * 自定义首页批二：本月收入概览板块数据源（到账与导出 CSV 同源同口径；待收尾款=进行中订单未收部分）
   */
  fastify.get('/api/artist/dashboard/income-overview', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return dashboardService.getIncomeOverview(request.artist.id)
  })

  /**
   * GET /api/artist/dashboard/deadline-soon?days=&limit=
   * 自定义首页批二：截稿倒计时板块数据源（含已逾期，按截稿日升序；参数钳制防滥用）
   */
  fastify.get('/api/artist/dashboard/deadline-soon', {
    preHandler: requireAuth,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 1, maximum: 60, default: 14 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const q = request.query as { days?: number; limit?: number }
    return { items: dashboardService.getDeadlineSoon(request.artist.id, q.days ?? 14, q.limit ?? 8) }
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

  /**
   * GET /api/artist/dashboard/prefs
   * 自定义首页批一（v70）：读仪表盘布局偏好（归一化后返回；坏数据落默认永不报错；
   * 无 prefs 时读路径吞并旧 dashboard_modules：false→hidden）
   */
  fastify.get('/api/artist/dashboard/prefs', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return dashboardPrefsService.getDashboardPrefs(request.artist.id)
  })

  /**
   * PUT /api/artist/dashboard/prefs
   * 自定义首页批一（v70）：保存布局偏好——归一化入库（非法字段逐字段落默认），
   * 保存成功即完成对旧 dashboard_modules 的吞并（旧列置 NULL，单一事实源）；
   * 多设备冲突口径：后写覆盖先写
   */
  fastify.put('/api/artist/dashboard/prefs', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          order: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 40 },
          hidden: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 40 },
          width: { type: 'object' },
          density: { type: 'object' },
          scheduleStyle: { type: 'string', maxLength: 20 },
          greetStyle: { type: 'string', maxLength: 20 },
          pageAlign: { type: 'string', maxLength: 20 },
          pageMax: { type: 'number' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ code: 'VALIDATION', error: '请求参数格式不正确（body）' })
    }
    return dashboardPrefsService.saveDashboardPrefs(request.artist.id, body)
  })
}
