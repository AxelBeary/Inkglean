import * as orderService from './order.service.js'
import * as orderGalleryService from './order-gallery.service.js'
import { requireOwnOrder } from './order-route-utils.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

// ============================================
// 订单路由 - 过程稿子插件（v81，从 order.routes.ts 再拆一支）
// 画师侧：订单级开关 + 免费修改次数 + 过程稿增删改查
// 客户侧下发见 order-client.routes.ts 的 track（双层开关在服务层收口）
// ============================================

/**
 * 写接口的单图响应：行从列表视图回读（与 GET .../previews 完全同形，前端一套切版）
 * 列表最多几十张，不为它单开一行查询接口；pick 不到说明刚写入的行被并发删除 → 404 如实报
 */
function pickPreview(previews: orderGalleryService.PreviewRow[], previewId: number): orderGalleryService.PreviewRow {
  const row = previews.find(p => p.id === previewId)
  if (!row) throw new AppError(E.PREVIEW_NOT_FOUND, 404)
  return row
}

export async function orderPreviewRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/artist/orders/:id/previews
   * 过程稿管理页首屏：订单级开关 + 免费修改次数 + 全部过程稿（含仅画师可见的私稿）
   * revisionUsed 走 getRevisionQuota（与客户侧 track 同一口径，避免两处各算一套）
   */
  fastify.get('/api/artist/orders/:id/previews', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    return {
      previewVisibleToClient: request.order.preview_visible_to_client === 1,
      freeRevisionLimit: request.order.free_revision_limit ?? 0,
      revisionUsed: orderGalleryService.getRevisionQuota(request.order).used,
      previews: orderGalleryService.listPreviews(request.order.id)
    }
  })

  /**
   * POST /api/artist/orders/:id/previews
   * 挂一张过程稿（图先走 POST /api/upload/preview 落盘，这里只登记路径）
   */
  fastify.post('/api/artist/orders/:id/previews', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['filePath'],
        properties: {
          filePath: { type: 'string', minLength: 1, maxLength: 500 },
          caption: { type: ['string', 'null'], maxLength: 200 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { filePath, caption } = request.body as { filePath: string; caption?: string | null }
    // 归属前缀校验用 request.artist.id（订单归属已由 requireOwnOrder 保证）
    const id = orderGalleryService.addPreview(request.order.id, request.artist.id, filePath, caption ?? null)
    return pickPreview(orderGalleryService.listPreviews(request.order.id), id)
  })

  /**
   * PATCH /api/artist/orders/:id/previews/:pid
   * 单图「对客户可见」开关 / 备注（caption 传 null 或空串 = 清空）
   */
  fastify.patch('/api/artist/orders/:id/previews/:pid', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        properties: {
          visible: { type: 'boolean' },
          caption: { type: ['string', 'null'], maxLength: 200 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const previewId = parseInt((request.params as { pid: string }).pid, 10)
    if (isNaN(previewId)) throw new AppError(E.ORDER_INVALID_ID)
    const { visible, caption } = request.body as { visible?: boolean; caption?: string | null }
    orderGalleryService.updatePreview(request.order.id, previewId, { visible, caption })
    return pickPreview(orderGalleryService.listPreviews(request.order.id), previewId)
  })

  /**
   * DELETE /api/artist/orders/:id/previews/:pid
   * 只删登记行；磁盘文件由 gcUploads 黑名单扫描兜底回收（同交付文件口径）
   */
  fastify.delete('/api/artist/orders/:id/previews/:pid', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    const previewId = parseInt((request.params as { pid: string }).pid, 10)
    if (isNaN(previewId)) throw new AppError(E.ORDER_INVALID_ID)
    orderGalleryService.removePreview(request.order.id, previewId)
    return { deleted: true }
  })

  /**
   * PATCH /api/artist/orders/:id/preview-settings
   * 订单级：过程稿对客户可见开关 + 免费修改次数（0 = 不限，前端必须显示这句说明）
   */
  fastify.patch('/api/artist/orders/:id/preview-settings', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        properties: {
          previewVisibleToClient: { type: 'boolean' },
          // 0..99 整数；0 = 不限。服务层二次校验（schema 之外仍要走同一断言）
          freeRevisionLimit: { type: 'integer', minimum: 0, maximum: 99 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { previewVisibleToClient, freeRevisionLimit } = request.body as { previewVisibleToClient?: boolean; freeRevisionLimit?: number }
    orderGalleryService.updatePreviewSettings(request.order.id, { previewVisibleToClient, freeRevisionLimit })
    // 回读订单（request.order 是 preHandler 的快照，设置已变）
    const order = orderService.getOrder(request.order.id)!
    return {
      previewVisibleToClient: order.preview_visible_to_client === 1,
      freeRevisionLimit: order.free_revision_limit ?? 0
    }
  })
}
