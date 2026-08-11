import * as orderService from './order.service.js'
import * as orderGalleryService from './order-gallery.service.js'
import * as orderWorkflowService from './order-workflow.service.js'
import { assertReferenceFileExists, enrichOrderForArtist, parseOptionalVersion, requireOwnOrder } from './order-route-utils.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { AppError, E } from '../../shared/errors.js'
import { collectSensitiveHits } from '../../shared/sensitive-words.js'
import type { OrderDetail } from '../../types/entities.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 订单路由 - 画师端交付/图库/流程动作子插件（从 order.routes.ts 拆出）
// 交付/作品发布/参考图/焦点图/流程节点推进回退
// ============================================

export async function orderDeliveryRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/artist/orders/:id/deliver
   * 事务化交付
   * JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/deliver', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['filePath'],
        properties: {
          filePath: { type: 'string', minLength: 1, maxLength: 500 },
          fileName: { type: ['string', 'null'], maxLength: 255 },
          fileSize: { type: ['integer', 'null'], minimum: 0 },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { filePath, fileName, fileSize, version } = request.body as { filePath: string; fileName?: string | null; fileSize?: number | null; version?: number }

    // 安全：路径归属校验 — 只允许自己交付目录下的文件，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith(`deliverables/${request.artist.id}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    const result = orderGalleryService.deliverOrder(request.order.id, filePath, fileName ?? null, fileSize ?? null, version)
    // R19 + B1: 交付返回的订单统一增强（含 notes 签名 + 收款字段）
    return { ...enrichOrderForArtist(result.order), statusChanged: result.statusChanged }
  })

  /**
   * POST /api/artist/orders/:id/deliver-no-file
   * 无文件交付（方案 B：修复工作流订单最后节点交付卡死）
   * 画师确认本单无需交付文件，直接完成交付流程
   */
  fastify.post('/api/artist/orders/:id/deliver-no-file', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
    const result = orderGalleryService.deliverOrderWithoutFile(request.order.id, parseOptionalVersion(request.body))
    // R19 + B1: 交付返回的订单统一增强（含 notes 签名 + 收款字段）
    return { ...enrichOrderForArtist(result.order), statusChanged: result.statusChanged }
  })

  /**
   * POST /api/artist/orders/:id/publish-artwork
   * REQ-022 F1: 发布为作品（用户拍板：delivered 门槛 + 一图一作品）
   * 勾选的交付图复制（非移动）到公开目录，一图建一条 artworks 行；原交付物保留
   * 跨画师访问在 service 层二次防御（ORDER_NOT_OWNED 403；requireOwnOrder 先行 404）
   */
  fastify.post('/api/artist/orders/:id/publish-artwork', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['deliverableIds', 'title'],
        properties: {
          deliverableIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 },
          title: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: ['string', 'null'], maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { deliverableIds, title, description } = request.body as { deliverableIds: number[]; title: string; description?: string | null }
    const artworks = await orderGalleryService.publishArtwork(
      request.order.id, request.artist.id, deliverableIds, title, description
    )
    // REQ-042: 作品发布命中敏感词 → warning 提示（不硬拦，先发后审）
    const sensitiveWords = collectSensitiveHits(title, description)
    return reply.code(201).send(
      sensitiveWords.length ? { artworks, warning: { sensitiveWords } } : { artworks }
    )
  })

  /**
   * POST /api/artist/orders/:id/references
   * 添加参考图
   * JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/references', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['filePath'],
        properties: {
          filePath: { type: 'string', minLength: 1, maxLength: 500 },
          fileName: { type: ['string', 'null'], maxLength: 255 },
          fileSize: { type: ['integer', 'null'], minimum: 0 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { filePath, fileName, fileSize } = request.body as { filePath: string; fileName?: string | null; fileSize?: number | null }

    // 安全：路径归属校验 — 参考图只允许 references/ 目录，拒绝路径穿越；P2-12 追加存在性校验
    assertReferenceFileExists(filePath)

    // R18: 画师加图标记 source='artist'（显式传值，不依赖 DEFAULT）
    orderGalleryService.addReference(request.order.id, filePath, fileName ?? null, fileSize ?? null, 'artist')
    return enrichOrderForArtist(orderService.getOrder(request.order.id) as OrderDetail)
  })

  // ─── v0.11 R4: 焦点图 ───

  /**
   * PUT /api/artist/orders/:id/focus-image
   * 设置焦点图路径 + 模式（off/small/large）
   */
  fastify.put('/api/artist/orders/:id/focus-image', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['mode'],
        properties: {
          imagePath: { type: ['string', 'null'], maxLength: 500 },
          mode: { type: 'string', enum: ['off', 'small', 'large'] }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { imagePath, mode } = request.body as { imagePath?: string | null; mode: string }
    // M2 修复：路由层路径校验（纵深防御）— 焦点图必须来自 references/ 目录，拒绝路径穿越。
    // 服务层仍校验参考图归属该订单（setFocusImage），此处只补格式层守卫。
    if (imagePath && (imagePath.includes('..') || !imagePath.startsWith('references/'))) {
      throw new AppError(E.ILLEGAL_PATH)
    }
    const order = orderGalleryService.setFocusImage(request.order.id, imagePath ?? null, mode)
    // Bug fix + B1: setFocusImage 返回的订单统一增强（与 GET orders/:id 一致）
    return enrichOrderForArtist(order)
  })

  /**
   * DELETE /api/artist/orders/:id/references/:refId
   * 删除参考图（自动清理焦点图）
   */
  fastify.delete('/api/artist/orders/:id/references/:refId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    const refId = parseInt((request.params as { refId: string }).refId, 10)
    if (isNaN(refId)) throw new AppError(E.ORDER_INVALID_ID)
    // B1: 统一增强（此前连签名都没有，删图后前端直接覆盖 → 同样丢字段）
    return enrichOrderForArtist(orderGalleryService.removeReference(request.order.id, refId))
  })

  // ─── R30d: 流程状态机 ───

  /**
   * PUT /api/artist/orders/:id/stage
   * 推进流程节点（只能前进）；stageId=null 关闭流程跟踪
   */
  fastify.put('/api/artist/orders/:id/stage', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['stageId'],
        properties: {
          stageId: { type: ['integer', 'null'] },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { stageId, version } = request.body as { stageId: number | null; version?: number }
    const order = orderWorkflowService.advanceStage(request.order.id, stageId, version)
    // B1: 统一增强（stageInfo 已含于 enrichOrderForArtist）
    return enrichOrderForArtist(order)
  })

  /**
   * PUT /api/artist/orders/:id/track-on
   * v0.14: 对无工作流订单启用流程跟踪（设第一节点，status 不变）
   */
  fastify.put('/api/artist/orders/:id/track-on', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
    const order = orderWorkflowService.enableTracking(request.order.id, parseOptionalVersion(request.body))
    // B1: 统一增强（stageInfo 已含于 enrichOrderForArtist）
    return enrichOrderForArtist(order)
  })

  /**
   * PUT /api/artist/orders/:id/stage-back
   * 回退流程节点（打回修改），状态→revision + 系统备注
   */
  fastify.put('/api/artist/orders/:id/stage-back', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['stageId'],
        properties: {
          stageId: { type: 'integer' },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { stageId, version } = request.body as { stageId: number; version?: number }
    const order = orderWorkflowService.rollbackStage(request.order.id, stageId, version)
    // B1: 统一增强（stageInfo 已含于 enrichOrderForArtist）
    return enrichOrderForArtist(order)
  })
}
