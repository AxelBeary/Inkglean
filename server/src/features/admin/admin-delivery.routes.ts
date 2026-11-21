import type { FastifyInstance } from 'fastify'
import { AppError, E } from '../../shared/errors.js'
import { requireAdmin } from '../../shared/middleware/auth.js'
import { getAdminDelivery, reissueAdminDeliveryLink } from './admin-delivery.service.js'

const orderNoParam = { type: 'string', minLength: 1, maxLength: 100 }

/** 管理端精确查单和单文件补发，继承 adminRoutes 的 step-up 守卫。 */
export async function adminDeliveryRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { orderNo: string } }>('/api/admin/delivery/:orderNo', {
    preHandler: requireAdmin,
    schema: {
      params: { type: 'object', properties: { orderNo: orderNoParam }, required: ['orderNo'] }
    }
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return getAdminDelivery(request.params.orderNo)
  })

  fastify.post<{ Params: { orderNo: string; fileId: number } }>('/api/admin/delivery/:orderNo/files/:fileId/reissue', {
    preHandler: requireAdmin,
    schema: {
      params: {
        type: 'object',
        properties: { orderNo: orderNoParam, fileId: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
        required: ['orderNo', 'fileId']
      }
    }
  }, async (request, reply) => {
    const body = request.body
    if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)) {
      throw new AppError(E.VALIDATION, 400)
    }
    const { orderNo, fileId } = request.params
    reply.header('Cache-Control', 'no-store')
    return reissueAdminDeliveryLink(orderNo, fileId, request.artist.id, request.ip)
  })
}
