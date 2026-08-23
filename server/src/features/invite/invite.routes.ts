import { requireAdmin } from '../../shared/middleware/auth.js'
import { recordLastLogin } from '../artist/artist.service.js'
import { registerAdminStepUpHooks } from '../../shared/middleware/step-up.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import {
  getInviteStatus,
  generateInviteCodes,
  listInviteCodes,
  listInviteCodeUses,
  revokeInviteCode,
  registerWithInvite,
  confirmInviteTotp,
  INVITE_PAGE_SIZE_MAX,
  type InviteCodeStatusFilter
} from './invite.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 邀请码注册路由（REQ-039）
// 管理端：批量生成 / 列表 / 吊销；公开：状态 / 注册 / TOTP 首绑确认
// ============================================

/** 限流守卫：不通过则抛 429（对齐 auth.routes / setup.routes 同款实现） */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

export default async function inviteRoutes(fastify: FastifyInstance) {

  // REQ-041 + d2 猎杀修复（2026-08-14）：本插件内 /api/admin/invite-codes* 补挂 step-up 入口级守卫
  //（onRoute 按 url 前缀过滤，/api/invite/* 公开端点不受影响）；此前漏挂致 basic 会话可直操邀请码
  registerAdminStepUpHooks(fastify)

  /**
   * GET /api/invite/status
   * 公开：入驻模式开关（platform_config.onboarding_mode == 'invite'）
   */
  fastify.get('/api/invite/status', async () => {
    return getInviteStatus()
  })

  /**
   * POST /api/invite/register
   * 公开：邀请码注册（校验码 + 建号 + TOTP 首绑密钥），限流对齐 auth verify 强度
   * 防枚举：码不存在/已用/已吊销/已过期统一返回 INVITE_INVALID
   */
  fastify.post('/api/invite/register', {
    schema: {
      body: {
        type: 'object',
        required: ['code', 'qqNumber', 'name', 'subdomain'],
        properties: {
          code: { type: 'string', minLength: 8, maxLength: 8, pattern: '^[A-Za-z0-9]{8}$' },
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          subdomain: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[a-z0-9-]+$' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    guardRateLimit(`invite-register:${request.ip}`, 10, 5 * 60_000)

    const body = request.body as { code: string; qqNumber: string; name: string; subdomain: string }
    const result = await registerWithInvite(body)
    return reply.code(201).send(result)
  })

  /**
   * POST /api/invite/totp-confirm
   * 公开：验证 6 位码完成首绑 → totp_verified=1 → 签发会话 cookie（复用既有签发路径）
   * 限流对齐 setup/totp-confirm（10 次/5 分钟）
   */
  fastify.post('/api/invite/totp-confirm', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'code'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    guardRateLimit(`invite-totp:${request.ip}`, 10, 5 * 60_000)

    const body = request.body as { qqNumber: string; code: string }
    const result = confirmInviteTotp(body)

    // 登录留痕批（v72）：首绑确认即首次登录，刷新上次登录时间+来源 IP（仅管理后台可见）
    recordLastLogin(result.artist.id, request.ip)

    // 签发会话 cookie（与 auth.routes.ts signSession / setup.routes.ts 同款参数）
    reply.setCookie('artist_token', result.token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 // 7 天
    })

    return reply.code(200).send({
      isAdmin: result.isAdmin,
      artist: result.artist
    })
  })

  // ═══════════════════════════════════════════════════
  // 管理端（requireAdmin）
  // ═══════════════════════════════════════════════════

  /**
   * POST /api/admin/invite-codes
   * 批量生成（数量 1-50，有效期默认 3 天，1-30 天；每码可用次数 1-100 默认 1）
   */
  fastify.post('/api/admin/invite-codes', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['count'],
        properties: {
          count: { type: 'integer', minimum: 1, maximum: 50 },
          validDays: { type: 'integer', minimum: 1, maximum: 30 },
          maxUses: { type: 'integer', minimum: 1, maximum: 100 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { count: number; validDays?: number; maxUses?: number }
    const codes = generateInviteCodes(body.count, body.validDays, body.maxUses, request.artist.id)
    return reply.code(201).send({
      codes: codes.map(c => ({ id: c.id, code: c.code, expiresAt: c.expires_at }))
    })
  })

  /**
   * GET /api/admin/invite-codes
   * 列表（含状态/最近使用人/过期时间/额度进度），支持状态筛选（unused/used/revoked/expired）、
   * 码模糊搜索与服务端分页（page/pageSize，默认 20/页）
   */
  fastify.get('/api/admin/invite-codes', {
    preHandler: requireAdmin,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['unused', 'used', 'revoked', 'expired'] },
          q: { type: 'string', maxLength: 64 },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: INVITE_PAGE_SIZE_MAX }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const query = request.query as { status?: InviteCodeStatusFilter; q?: string; page?: number; pageSize?: number }
    const page = Math.max(1, Math.trunc(query.page ?? 1))
    const { rows, total } = listInviteCodes(query)
    const now = Date.now()
    return {
      codes: rows.map(r => ({
        id: r.id,
        code: r.code,
        status: r.status,
        expiresAt: r.expires_at,
        usedAt: r.used_at,
        createdAt: r.created_at,
        createdBy: r.created_by,
        maxUses: r.max_uses,
        useCount: r.use_count,
        // 派生态：unused 且已到期（前端置灰显「已过期」，与筛选口径一致）
        expired: r.status === 'unused' && new Date(r.expires_at).getTime() <= now,
        usedBy: r.used_by_artist_id != null
          ? {
              id: r.used_by_artist_id,
              name: r.used_by_name,
              subdomain: r.used_by_subdomain,
              qqNumber: r.used_by_qq
            }
          : null
      })),
      total,
      page,
      pageSize: Math.min(INVITE_PAGE_SIZE_MAX, Math.max(1, Math.trunc(query.pageSize ?? 20)))
    }
  })

  /**
   * GET /api/admin/invite-codes/:id/uses
   * 单张码的使用明细（多次码名单：谁在何时用了这张码，倒序）
   */
  fastify.get('/api/admin/invite-codes/:id/uses', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: number }
    const uses = listInviteCodeUses(Number(id))
    return {
      uses: uses.map(u => ({
        artistId: u.artist_id,
        name: u.name,
        qqNumber: u.qq_number,
        subdomain: u.subdomain,
        usedAt: u.used_at
      }))
    }
  })

  /**
   * POST /api/admin/invite-codes/:id/revoke
   * 吊销（仅 unused；已用/已吊销返回 INVITE_CANNOT_REVOKE）
   */
  fastify.post('/api/admin/invite-codes/:id/revoke', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      }
    }
  }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: number }
    const row = revokeInviteCode(Number(id))
    return { success: true, code: row.code, status: row.status }
  })
}
