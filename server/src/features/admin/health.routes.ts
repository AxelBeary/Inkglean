import { requireAdmin } from '../../shared/middleware/auth.js'
import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
import { runHealthChecks, buildDiagnosticReport } from './health.service.js'
import { MIGRATIONS } from '../../db/init.js'
import type { FastifyInstance } from 'fastify'

// ============================================
// 系统自检路由（HC）
// ============================================

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

export default async function healthRoutes(fastify: FastifyInstance) {

  // REQ-041：/api/admin/health* 同为管理后台读路由，受 step-up 入口级守卫保护
  registerAdminStepUpHooks(fastify)

  /** GET /api/admin/health — 执行 8 项系统检查 */
  fastify.get('/api/admin/health', { preHandler: requireAdmin }, async () => {
    const checks = await runHealthChecks(LATEST_VERSION)
    return { checks, timestamp: new Date().toISOString() }
  })

  /** GET /api/admin/health/download — 诊断包下载（JSON 文件） */
  fastify.get('/api/admin/health/download', { preHandler: requireAdmin }, async (_request, reply) => {
    const report = await buildDiagnosticReport(LATEST_VERSION)
    const json = JSON.stringify(report, null, 2)
    const filename = `health-report-${new Date().toISOString().slice(0, 10)}.json`
    reply.header('Content-Type', 'application/json; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return reply.send(json)
  })
}
