import * as orderService from './order.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain } from '../artist/artist.service.js'
import { clamp, isValidQq } from '../../shared/validate.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'

// ============================================
// 订单路由 - 下单、查询、管理、交付
// ============================================

export default async function orderRoutes(fastify) {

  // ─── 客户端接口（公开 + 限流） ───

  /**
   * POST /api/orders
   * 客户自助下单（限流：同IP 10次/10分钟）
   * P1-8: JSON Schema 输入校验
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
          agreeRules: { type: 'boolean', const: true }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    if (!rateLimit(`order-create:${request.ip}`, 10, 10 * 60_000)) {
      return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
    }

    const { subdomain, tierId, clientQq, clientName, description, priority, clientNotify, agreeRules } = request.body || {}

    if (!subdomain) return reply.code(400).send({ error: '缺少画师信息' })
    if (!clientQq) return reply.code(400).send({ error: '请填写你的QQ号' })
    if (!isValidQq(clientQq)) return reply.code(400).send({ error: 'QQ号格式不正确（5-15位数字）' })
    if (!agreeRules) return reply.code(400).send({ error: '请先阅读并同意约稿须知' })

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    if (artist.status !== 'open') return reply.code(400).send({ error: '该画师当前不接受新约稿' })

    try {
      const order = orderService.createOrder({
        artistId: artist.id,
        tierId,
        clientQq: clamp(clientQq, 'qq'),
        clientName: clamp(clientName, 'name'),
        description: clamp(description, 'description'),
        priority: priority || 'medium',
        source: 'self',
        clientNotify: clientNotify || false
      })

      return {
        orderNo: order.order_no,
        message: '下单成功！请添加画师QQ沟通细节。'
      }
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * GET /api/orders/track/:orderNo
   * 客户凭订单号 + QQ号查询进度（限流：同IP 20次/5分钟）
   */
  fastify.get('/api/orders/track/:orderNo', async (request, reply) => {
    if (!rateLimit(`track:${request.ip}`, 20, 5 * 60_000)) {
      return reply.code(429).send({ error: '查询过于频繁，请稍后再试' })
    }

    const { qq } = request.query || {}
    if (!qq) return reply.code(400).send({ error: '请同时提供你的QQ号以验证身份' })
    // P2-10: QQ 格式校验
    if (!isValidQq(qq)) return reply.code(400).send({ error: 'QQ号格式不正确（5-15位数字）' })

    const result = orderService.getClientQueuePosition(request.params.orderNo, qq)
    if (!result) return reply.code(404).send({ error: '订单不存在或QQ号不匹配' })

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
        url: `/uploads/${d.file_path}`
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
  fastify.get('/api/orders/my', async (request, reply) => {
    if (!rateLimit(`my-orders:${request.ip}`, 10, 5 * 60_000)) {
      return reply.code(429).send({ error: '查询过于频繁，请稍后再试' })
    }

    const { subdomain, qq } = request.query || {}
    if (!subdomain || !qq) return reply.code(400).send({ error: '缺少参数' })
    if (!isValidQq(qq)) return reply.code(400).send({ error: 'QQ号格式不正确' })

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

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
  fastify.get('/api/orders/lookup', async (request, reply) => {
    if (!rateLimit(`lookup:${request.ip}`, 10, 5 * 60_000)) {
      return reply.code(429).send({ error: '查询过于频繁，请稍后再试' })
    }

    const { subdomain, qq } = request.query || {}
    if (!subdomain || !qq) return reply.code(400).send({ error: '缺少参数' })
    if (!isValidQq(qq)) return reply.code(400).send({ error: 'QQ号格式不正确' })

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

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
  fastify.get('/api/orders/delivery/:orderNo', async (request, reply) => {
    if (!rateLimit(`delivery:${request.ip}`, 20, 5 * 60_000)) {
      return reply.code(429).send({ error: '查询过于频繁，请稍后再试' })
    }

    const { qq } = request.query || {}
    if (!qq) return reply.code(400).send({ error: '请同时提供你的QQ号以验证身份' })
    // P2-10: QQ 格式校验
    if (!isValidQq(qq)) return reply.code(400).send({ error: 'QQ号格式不正确（5-15位数字）' })

    const order = orderService.getOrderByNo(request.params.orderNo)
    if (!order || order.client_qq !== qq) {
      return reply.code(404).send({ error: '订单不存在或QQ号不匹配' })
    }

    return {
      orderNo: order.order_no,
      status: order.status,
      artistName: order.artist_name,
      deliverables: order.deliverables.map(d => ({
        id: d.id,
        fileName: d.original_name,
        fileSize: d.file_size,
        url: `/uploads/${d.file_path}`
      }))
    }
  })

  // ─── 画师后台接口（需登录） ───

  /**
   * GET /api/artist/orders
   */
  fastify.get('/api/artist/orders', { preHandler: requireAuth }, async (request) => {
    const { status } = request.query || {}
    return orderService.getArtistOrders(request.artist.id, status)
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
  fastify.get('/api/artist/orders/:id', { preHandler: requireAuth }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: '无效的订单ID' })
    const order = orderService.getOrder(id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }
    return order
  })

  /**
   * POST /api/artist/orders/manual
   * P1-8: JSON Schema 输入校验
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
  }, async (request, reply) => {
    const { tierId, clientQq, clientName, description, priority } = request.body || {}

    if (!clientQq) return reply.code(400).send({ error: '请填写客户QQ号' })

    try {
      const order = orderService.createOrder({
        artistId: request.artist.id,
        tierId,
        clientQq: clamp(clientQq, 'qq'),
        clientName: clamp(clientName, 'name'),
        description: clamp(description, 'description'),
        priority: priority || 'medium',
        source: 'manual',
        clientNotify: false
      })
      return order
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * PUT /api/artist/orders/:id/status
   * P1-8: JSON Schema 输入校验
   */
  fastify.put('/api/artist/orders/:id/status', {
    preHandler: requireAuth,
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
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: '无效的订单ID' })
    const order = orderService.getOrder(id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { status } = request.body || {}
    if (!status) return reply.code(400).send({ error: '请指定状态' })

    try {
      return orderService.updateOrderStatus(order.id, status)
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * PUT /api/artist/orders/:id/priority
   * P1-8: JSON Schema 输入校验
   */
  fastify.put('/api/artist/orders/:id/priority', {
    preHandler: requireAuth,
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
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: '无效的订单ID' })
    const order = orderService.getOrder(id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { priority } = request.body || {}
    try {
      return orderService.updatePriority(order.id, priority)
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * PUT /api/artist/queue/reorder
   * P1-2: 接收完整排序后的 ID 数组
   * P1-8: JSON Schema 输入校验
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
  }, async (request, reply) => {
    const { orderedIds } = request.body || {}

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return reply.code(400).send({ error: '缺少排序参数' })
    }

    try {
      return orderService.reorderQueue(request.artist.id, orderedIds)
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /api/artist/orders/:id/notes
   * P1-8: JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/notes', {
    preHandler: requireAuth,
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
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: '无效的订单ID' })
    const order = orderService.getOrder(id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { content } = request.body || {}
    if (!content) return reply.code(400).send({ error: '备注内容不能为空' })

    return orderService.addNote(order.id, clamp(content, 'note'), 'artist')
  })

  /**
   * POST /api/artist/orders/:id/deliver
   * P1-3: 事务化交付
   * P1-8: JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/deliver', {
    preHandler: requireAuth,
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
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: '无效的订单ID' })
    const order = orderService.getOrder(id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { filePath, fileName, fileSize } = request.body || {}
    if (!filePath) return reply.code(400).send({ error: '缺少文件路径' })

    try {
      const result = orderService.deliverOrder(order.id, filePath, fileName, fileSize)
      return result.order
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /api/artist/orders/:id/references
   * P1-1: 添加参考图
   * P1-8: JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/references', {
    preHandler: requireAuth,
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
  }, async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.code(400).send({ error: '无效的订单ID' })
    const order = orderService.getOrder(id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { filePath, fileName, fileSize } = request.body || {}
    if (!filePath) return reply.code(400).send({ error: '缺少文件路径' })

    orderService.addReference(order.id, filePath, fileName, fileSize)
    return orderService.getOrder(order.id)
  })

  /**
   * GET /api/artist/stats
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistStats(request.artist.id)
  })
}
