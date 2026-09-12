import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as adminService from './admin.service.js'
import * as versionService from './version.service.js'
import { verifyTotpLogin } from '../auth/auth.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import db from '../../db/connection.js'
import { savePlatformAnnouncement } from '../announcement/announcement.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 管理员路由 - 系统与会话升级、运维（step-up 探测 / 版本 / 统计 / 回收站 / 更换管理员 / 平台公告）
// （从 admin.routes.ts 拆出，F-09 巨型文件清偿；纯搬移，端点与行为零变更）
// ============================================

export async function adminSystemRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/admin/stepup-status
   * REQ-041：前端入口级轻量探测——已升级且在 30 分钟窗口内返回 200 { verified: true }；
   * 未升级/超时由 requireAdminStepUp 返回 401 STEP_UP_REQUIRED（前端据此弹 StepUpDialog）
   */
  fastify.get('/api/admin/stepup-status', { preHandler: requireAdmin }, async () => ({ verified: true }))

  /**
   * GET /api/admin/system/version
   * 0818 拍板方案 A：更新检查只读面板——当前版本 vs GitHub 最新 commit；
   * upToDate=null 表示无法对比（本地 commit 未知或 GitHub 拉取失败），前端据此显示「无法对比」
   */
  fastify.get('/api/admin/system/version', { preHandler: requireAdmin }, async (request: FastifyRequest) => {
    const force = (request.query as { force?: string }).force === '1'
    const current = versionService.getCurrentVersion()
    const latest = await versionService.getLatestCommit(force)
    return {
      current,
      latest,
      upToDate: latest.ok && current.commit !== 'unknown' && latest.sha ? latest.sha === current.commit : null,
      repoUrl: versionService.REPO_URL
    }
  })

  /**
   * GET /api/admin/stats
   */
  fastify.get('/api/admin/stats', { preHandler: requireAdmin }, async () => {
    return adminService.getGlobalStats()
  })

  // ─── 回收站管理（事故修复：孤儿文件可恢复） ───

  /** GET /api/admin/recycle-bin — 列出回收站内容（REQ-022 F4：分页，movedAt 倒序） */
  fastify.get('/api/admin/recycle-bin', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    const { page, pageSize } = (request.query as { page?: number; pageSize?: number }) || {}
    return adminService.listRecycleBinPaged(
      page ?? 1,
      pageSize ?? 20
    )
  })

  /** DELETE /api/admin/recycle-bin — 清空回收站（不可恢复） */
  fastify.delete('/api/admin/recycle-bin', { preHandler: requireAdmin }, async () => {
    const count = adminService.emptyRecycleBin()
    return { success: true, deleted: count }
  })

  /**
   * POST /api/admin/recycle-bin/restore — 恢复单个回收站文件到原始路径（R-21，审计批E）
   * 误清空不可逆之外的第二缺口：回收站只读/清空，无恢复接口（注释曾宣称「可恢复」）。
   * fileName 按回收站内文件名精确匹配；目标已存在 → 409（不覆盖），找不到 → 404。
   */
  fastify.post('/api/admin/recycle-bin/restore', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['fileName'],
        additionalProperties: false,
        properties: {
          // maxLength 255 + 路径分隔符拒绝：fileName 只允许是文件名，防路径穿越/目录猜测
          fileName: { type: 'string', minLength: 1, maxLength: 255 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { fileName } = request.body as { fileName: string }
    if (fileName.includes('/') || fileName.includes('\\')) {
      return reply.code(400).send({ code: 'INVALID_PARAM', error: 'fileName 不能包含路径分隔符' })
    }
    const result = adminService.restoreRecycleBinFile(fileName)
    if (result.status === 'not_found') {
      return reply.code(404).send({ error: '回收站中未找到该文件' })
    }
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: '目标路径已存在同名文件，恢复被拒绝（不覆盖现有文件）' })
    }
    return { success: true, restoredPath: result.restoredPath }
  })

  /**
   * POST /api/admin/transfer
   * 更换管理员账号（需要连续两次 TOTP 动态口令验证，REQ-027 替代旧登录码机制）
   * 1. 验证当前管理员的动态口令（证明你是管理员）
   * 2. 验证新管理员的动态口令（证明对方接受）
   * 双方均须已绑定 TOTP（未绑定 → 401 提示先绑定）
   * P1-F: 前置检查 + 整体事务化，任意一步失败全部回滚
   */
  fastify.post('/api/admin/transfer', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['newQq', 'currentCode', 'newCode'],
        additionalProperties: false,
        properties: {
          newQq: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          currentCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          newCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { newQq, currentCode, newCode } = (request.body as { newQq: string; currentCode: string; newCode: string })

    const currentAdminQq = getAdminQq()
    if (String(newQq) === currentAdminQq) {
      return reply.code(400).send({ error: '新管理员不能与当前管理员相同' })
    }

    // audit-a P3-13: 先做目标存在性校验再耗限流配额——无效目标反复请求不消耗配额；
    // 有效目标的爆破仍被 IP + 目标 QQ 双维度限流拦住
    const newArtist = artistService.getArtistByQq(String(newQq))
    if (!newArtist) {
      return reply.code(404).send({ error: '该QQ号未注册为画师，请先添加画师' })
    }
    // P1-F: 限流 + 不等于自己 —— 无副作用，放在验码前
    // P0-3 修复：增加 IP 维度限流，防止攻击者轮换 newQq 绕过单目标限流
    if (!rateLimit(`transfer-ip:${request.ip}`, 5, 15 * 60_000)) {
      return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
    }
    if (!rateLimit(`transfer:${newQq}`, 3, 15 * 60_000)) {
      return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
    }

    // 验码走 verifyTotpLogin（含防爆破计数，失败计数不被事务回滚）
    const currentResult = verifyTotpLogin(currentAdminQq, String(currentCode))
    if (!currentResult.valid) {
      return reply.code(401).send({ error: '验证失败，请确认当前管理员的动态口令' })
    }
    const newResult = verifyTotpLogin(String(newQq), String(newCode))
    if (!newResult.valid) {
      return reply.code(401).send({ error: '验证失败，请确认新管理员的动态口令（须先完成绑定）' })
    }
    // 两次验码均通过，原子更新配置
    db.transaction(() => {
      db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(String(newQq))
    })()

    return { success: true, newAdminName: newArtist.name, newAdminQq: String(newQq) }
  })

  /**
   * PUT /api/admin/announcement
   * REQ-043 I4: 平台公告编辑（发布/清空）——step-up 由 registerAdminStepUpHooks 自动挂载
   * 内容消毒入库（sanitizeStoredText：去脚本/事件属性/javascript: 协议）
   */
  fastify.put('/api/admin/announcement', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: ['string', 'null'], maxLength: 100 },
          content: { type: ['string', 'null'], maxLength: 10000 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    return savePlatformAnnouncement((request.body || {}) as { title?: string | null; content?: string | null })
  })
}
