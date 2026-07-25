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
   */
  fastify.post('/api/orders', async (request, reply) => {
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
    const order = orderService.getOrder(request.params.id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }
    return order
  })

  /**
   * POST /api/artist/orders/manual
   */
  fastify.post('/api/artist/orders/manual', { preHandler: requireAuth }, async (request, reply) => {
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
   */
  fastify.put('/api/artist/orders/:id/status', { preHandler: requireAuth }, async (request, reply) => {
    const order = orderService.getOrder(request.params.id)
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
   */
  fastify.put('/api/artist/orders/:id/priority', { preHandler: requireAuth }, async (request, reply) => {
    const order = orderService.getOrder(request.params.id)
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
   */
  fastify.put('/api/artist/queue/reorder', { preHandler: requireAuth }, async (request, reply) => {
    const { draggedOrderId, targetPosition } = request.body || {}

    if (draggedOrderId == null || targetPosition == null) {
      return reply.code(400).send({ error: '缺少排序参数' })
    }

    try {
      return orderService.reorderQueueByDrag(request.artist.id, draggedOrderId, targetPosition)
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * POST /api/artist/orders/:id/notes
   */
  fastify.post('/api/artist/orders/:id/notes', { preHandler: requireAuth }, async (request, reply) => {
    const order = orderService.getOrder(request.params.id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { content } = request.body || {}
    if (!content) return reply.code(400).send({ error: '备注内容不能为空' })

    return orderService.addNote(order.id, clamp(content, 'note'), 'artist')
  })

  /**
   * POST /api/artist/orders/:id/deliver
   */
  fastify.post('/api/artist/orders/:id/deliver', { preHandler: requireAuth }, async (request, reply) => {
    const order = orderService.getOrder(request.params.id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { filePath, fileName, fileSize } = request.body || {}
    if (!filePath) return reply.code(400).send({ error: '缺少文件路径' })

    orderService.addDeliverable(order.id, filePath, fileName, fileSize)

    // 自动将状态改为已交付（需从 done 状态）
    try {
      orderService.updateOrderStatus(order.id, 'delivered')
    } catch {
      // 如果状态不允许直接交付（如还在 wip），仅添加文件不改状态
    }

    return orderService.getOrder(order.id)
  })

  /**
   * GET /api/artist/stats
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistStats(request.artist.id)
  })
}
