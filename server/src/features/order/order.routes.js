import * as orderService from './order.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain, getRules } from '../artist/artist.service.js'
import { clamp, isValidQq } from '../../shared/validate.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 订单路由 - 下单、查询、管理、交付
// ============================================

/** 限流守卫：不通过则抛 429 */
function guardRateLimit(key, max, windowMs) {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/**
 * 订单归属校验 preHandler
 * 解析 :id → 查订单 → 校验 artist_id → 挂载 request.order
 */
async function requireOwnOrder(request) {
  const id = parseInt(request.params.id, 10)
  if (isNaN(id)) throw new AppError(E.ORDER_INVALID_ID)
  const order = orderService.getOrder(id)
  if (!order || order.artist_id !== request.artist.id) {
    throw new AppError(E.ORDER_NOT_FOUND, 404)
  }
  request.order = order
}

export default async function orderRoutes(fastify) {

  // ─── 客户端接口（公开 + 限流） ───

  /**
   * POST /api/orders
   * 客户自助下单（限流：同IP 10次/10分钟）
   * JSON Schema 输入校验
   */
  fastify.post('/api/orders', {
    schema: {
      body: {
        type: 'object',
        required: ['subdomain', 'clientQq', 'agreeRules'],
        properties: {
          subdomain: { type: 'string', minLength: 1, maxLength: 50 },
          tierId: { type: ['integer', 'null'] },
          clientQq: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          clientName: { type: ['string', 'null'], maxLength: 50 },
          description: { type: ['string', 'null'], maxLength: 2000 },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          clientNotify: { type: 'boolean' },
          agreeRules: { type: 'boolean' },
          references: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          addons: {
            type: 'array',
            items: {
              type: 'object',
              required: ['addonId'],
              properties: {
                addonId: { type: 'integer' },
                quantity: { type: 'integer', minimum: 1, maximum: 99 }
              },
              additionalProperties: false
            },
            maxItems: 20
          },
          usageMultiplierId: { type: ['integer', 'null'] },
          rushMultiplierId: { type: ['integer', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    guardRateLimit(`order-create:${request.ip}`, 10, 10 * 60_000)

    const { subdomain, tierId, clientQq, clientName, description, priority, clientNotify, agreeRules, references, addons, usageMultiplierId, rushMultiplierId } = request.body

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)
    if (artist.status !== 'open') throw new AppError(E.ARTIST_NOT_OPEN)

    // 仅当画师设置了非空须知时，才要求客户勾选同意
    const rules = getRules(artist.id)
    if (rules?.content && !agreeRules) throw new AppError(E.RULES_NOT_AGREED)

    // C-3 修复：参考图路径校验 — 必须在 references/ 目录下，拒绝路径穿越
    if (references) {
      for (const ref of references) {
        if (ref.includes('..') || !ref.startsWith('references/')) {
          throw new AppError(E.ILLEGAL_PATH)
        }
      }
    }

    const order = orderService.createOrder({
      artistId: artist.id,
      tierId,
      clientQq: clamp(clientQq, 'qq'),
      clientName: clamp(clientName, 'name'),
      description: clamp(description, 'description'),
      priority: priority || 'medium',
      source: 'self',
      clientNotify: clientNotify || false,
      references: references || [],
      addons: addons || [],
      usageMultiplierId: usageMultiplierId || null,
      rushMultiplierId: rushMultiplierId || null
    })

    return {
      orderNo: order.order_no,
      totalPriceCents: order.total_price_cents,
      message: '下单成功！请添加画师QQ沟通细节。'
    }
  })

  /**
   * GET /api/orders/track/:orderNo
   * 客户凭订单号 + QQ号查询进度（限流：同IP 20次/5分钟）
   */
  fastify.get('/api/orders/track/:orderNo', async (request) => {
    guardRateLimit(`track:${request.ip}`, 20, 5 * 60_000)

    const { qq } = request.query || {}
    if (!qq) throw new AppError(E.QQ_REQUIRED)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const result = orderService.getClientQueuePosition(request.params.orderNo, qq)
    if (!result) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const { order, position, total } = result

    // 只返回客户需要看到的信息
    return {
      orderNo: order.order_no,
      status: order.status,
      tierName: order.tier_name,
      artistName: order.artist_name,
      position,
      total,
      deliverables: order.deliverables.map(d => ({
        id: d.id,
        fileName: d.original_name,
        url: signedUrl(d.file_path)
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }
  })

  /**
   * GET /api/orders/my
   * 客户凭 QQ号 + 画师子域名 查询自己的所有订单（"不知道订单号"场景）
   * 限流：同IP 10次/5分钟
   */
  fastify.get('/api/orders/my', async (request) => {
    guardRateLimit(`my-orders:${request.ip}`, 10, 5 * 60_000)

    const { subdomain, qq } = request.query || {}
    if (!subdomain || !qq) throw new AppError(E.MISSING_PARAMS)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    const orders = orderService.getClientOrdersByQq(artist.id, qq)
    return orders.map(o => ({
      orderNo: o.order_no,
      status: o.status,
      tierName: o.tier_name,
      createdAt: o.created_at
    }))
  })

  /**
   * GET /api/orders/lookup
   * 客户凭 QQ号 查询在某画师处是否有订单（不记得订单号场景）
   * 限流：同IP 10次/5分钟
   */
  fastify.get('/api/orders/lookup', async (request) => {
    guardRateLimit(`lookup:${request.ip}`, 10, 5 * 60_000)

    const { subdomain, qq } = request.query || {}
    if (!subdomain || !qq) throw new AppError(E.MISSING_PARAMS)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    const hasOrders = orderService.hasClientOrders(artist.id, qq)
    if (!hasOrders) {
      return { hasOrders: false }
    }

    return {
      hasOrders: true,
      contactQq: artist.contact_qq || artist.qq_number,
      adminQq: orderService.getPlatformConfig('admin_qq'),
      artistName: artist.name
    }
  })

  /**
   * GET /api/orders/delivery/:orderNo
   * 交付文件下载页数据（需 QQ 验证）
   */
  fastify.get('/api/orders/delivery/:orderNo', async (request) => {
    guardRateLimit(`delivery:${request.ip}`, 20, 5 * 60_000)

    const { qq } = request.query || {}
    if (!qq) throw new AppError(E.QQ_REQUIRED)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const order = orderService.getOrderByNo(request.params.orderNo)
    if (!order || order.client_qq !== qq) {
      throw new AppError(E.ORDER_NOT_FOUND, 404)
    }

    return {
      orderNo: order.order_no,
      status: order.status,
      artistName: order.artist_name,
      deliverables: order.deliverables.map(d => ({
        id: d.id,
        fileName: d.original_name,
        fileSize: d.file_size,
        url: signedUrl(d.file_path)
      }))
    }
  })

  // ─── 画师后台接口（需登录） ───

  /**
   * GET /api/artist/orders
   */
  fastify.get('/api/artist/orders', { preHandler: requireAuth }, async (request) => {
    const { status, page, pageSize } = request.query || {}
    return orderService.getArtistOrders(request.artist.id, status, {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize, 10) || 50, 200))
    })
  })

  /**
   * GET /api/artist/queue
   */
  fastify.get('/api/artist/queue', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistQueue(request.artist.id)
  })

  /**
   * GET /api/artist/orders/:id
   */
  fastify.get('/api/artist/orders/:id', { preHandler: [requireAuth, requireOwnOrder] }, async (request) => {
    return request.order
  })

  /**
   * POST /api/artist/orders/manual
   * JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/manual', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['clientQq'],
        properties: {
          tierId: { type: ['integer', 'null'] },
          clientQq: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          clientName: { type: ['string', 'null'], maxLength: 50 },
          description: { type: ['string', 'null'], maxLength: 2000 },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const { tierId, clientQq, clientName, description, priority } = request.body

    return orderService.createOrder({
      artistId: request.artist.id,
      tierId,
      clientQq: clamp(clientQq, 'qq'),
      clientName: clamp(clientName, 'name'),
      description: clamp(description, 'description'),
      priority: priority || 'medium',
      source: 'manual',
      clientNotify: false
    })
  })

  /**
   * PUT /api/artist/orders/:id/status
   * JSON Schema 输入校验
   */
  fastify.put('/api/artist/orders/:id/status', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled'] }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    return orderService.updateOrderStatus(request.order.id, request.body.status)
  })

  /**
   * PUT /api/artist/orders/:id/priority
   * JSON Schema 输入校验
   */
  fastify.put('/api/artist/orders/:id/priority', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['priority'],
        properties: {
          priority: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    return orderService.updatePriority(request.order.id, request.body.priority)
  })

  /**
   * PUT /api/artist/queue/reorder
   * 接收完整排序后的 ID 数组
   * JSON Schema 输入校验
   */
  fastify.put('/api/artist/queue/reorder', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['orderedIds'],
        properties: {
          orderedIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 200 }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    return orderService.reorderQueue(request.artist.id, request.body.orderedIds)
  })

  /**
   * POST /api/artist/orders/:id/notes
   * JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/notes', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 1000 }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    return orderService.addNote(request.order.id, clamp(request.body.content, 'note'), 'artist')
  })

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
          fileSize: { type: ['integer', 'null'], minimum: 0 }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const { filePath, fileName, fileSize } = request.body

    // 安全：路径归属校验 — 只允许自己交付目录下的文件，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith(`deliverables/${request.artist.id}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    const result = orderService.deliverOrder(request.order.id, filePath, fileName, fileSize)
    return { ...result.order, statusChanged: result.statusChanged }
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
  }, async (request) => {
    const { filePath, fileName, fileSize } = request.body

    // 安全：路径归属校验 — 参考图只允许 references/ 目录，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith('references/')) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    orderService.addReference(request.order.id, filePath, fileName, fileSize)
    return orderService.getOrder(request.order.id)
  })

  /**
   * GET /api/artist/stats
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistStats(request.artist.id)
  })
}
