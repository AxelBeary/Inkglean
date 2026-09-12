import { requireAdmin } from '../../shared/middleware/auth.js'
import * as platformService from '../platform/platform.service.js'
import { AppError } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { intId } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 社交平台字典 CRUD（从 admin.routes.ts 拆出）
// F-09 巨型文件清偿；纯搬移，端点与行为零变更
// ============================================

export async function adminPlatformRoutes(fastify: FastifyInstance) {

  // ============================================
  // REQ-022 F2: 社交平台 CRUD（管理端）
  // ============================================

  /** 平台 body schema 公共属性（snake_case，与 admin 端其余接口一致） */
  const platformBodyProps = {
    name: { type: 'string', minLength: 1, maxLength: 30 },
    icon_key: { type: ['string', 'null'], maxLength: 50 },
    fallback_char: { type: ['string', 'null'], maxLength: 4 },
    match_domains: {
      type: 'array', maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 100 }
    },
    sort_order: { type: 'integer', minimum: 0, maximum: 9999 },
    enabled: { type: 'boolean' }
  }

  /** GET /api/admin/platforms — 全量平台（含停用） */
  fastify.get('/api/admin/platforms', { preHandler: requireAdmin }, async () => {
    return platformService.getAllPlatforms()
  })

  /** POST /api/admin/platforms — 新增平台 */
  fastify.post('/api/admin/platforms', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object', required: ['name'], additionalProperties: false,
        properties: platformBodyProps
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const platform = platformService.createPlatform((request.body || {}) as Parameters<typeof platformService.createPlatform>[0])
      return reply.code(201).send(platform)
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /** PUT /api/admin/platforms/:id — 更新平台（部分字段合并语义） */
  fastify.put('/api/admin/platforms/:id', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object', additionalProperties: false,
        properties: platformBodyProps
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return platformService.updatePlatform(Number((request.params as { id: string }).id), (request.body || {}) as Parameters<typeof platformService.updatePlatform>[1])
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /** DELETE /api/admin/platforms/:id — 删除平台（引用该平台的链接归「其他」，不级联删链接） */
  fastify.delete('/api/admin/platforms/:id', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { reattributed } = platformService.deletePlatform(Number((request.params as { id: string }).id))
      return { success: true, reattributed }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })
}
