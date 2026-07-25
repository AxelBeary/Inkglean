import * as orderService from './order.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain } from '../artist/artist.service.js'
import { clamp, isValidQq } from '../../shared/validate.js'

// ============================================
// 订单路由 - 下单、查询、管理、交付
// ============================================

export default async function orderRoutes(fastify) {

  // ─── 客户端接口（公开） ───

  /**
   * POST /api/orders
   * 客户自助下单
   */
  fastify.post('/api/orders', async (request, reply) => {
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
   * 客户凭订单号查询进度
   */
  fastify.get('/api/orders/track/:orderNo', async (request, reply) => {
    const result = orderService.getClientQueuePosition(request.params.orderNo)
    if (!result) return reply.code(404).send({ error: '订单不存在' })

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
   * GET /api/orders/delivery/:orderNo
   * 交付文件下载页数据
   */
  fastify.get('/api/orders/delivery/:orderNo', async (request, reply) => {
    const order = orderService.getOrderByNo(request.params.orderNo)
    if (!order) return reply.code(404).send({ error: '订单不存在' })

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
   * 获取画师的订单列表（支持状态筛选）
   */
  fastify.get('/api/artist/orders', { preHandler: requireAuth }, async (request) => {
    const { status } = request.query || {}
    return orderService.getArtistOrders(request.artist.id, status)
  })

  /**
   * GET /api/artist/queue
   * 获取排期队列（拖拽看板用）
   */
  fastify.get('/api/artist/queue', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistQueue(request.artist.id)
  })

  /**
   * GET /api/artist/orders/:id
   * 获取订单详情
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
   * 画师手动录入订单
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
   * 更新订单状态
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
   * 更新订单优先级
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
   * 拖拽排序
   * body: { draggedOrderId, targetPosition }
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
   * 添加订单备注
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
   * 上传交付文件（MVP：接收文件路径，Phase 2 做真正的文件上传）
   */
  fastify.post('/api/artist/orders/:id/deliver', { preHandler: requireAuth }, async (request, reply) => {
    const order = orderService.getOrder(request.params.id)
    if (!order || order.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '订单不存在' })
    }

    const { filePath, fileName, fileSize } = request.body || {}
    if (!filePath) return reply.code(400).send({ error: '缺少文件路径' })

    orderService.addDeliverable(order.id, filePath, fileName, fileSize)

    // 自动将状态改为已交付
    orderService.updateOrderStatus(order.id, 'delivered')

    return orderService.getOrder(order.id)
  })

  /**
   * GET /api/artist/stats
   * 仪表盘统计数据
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistStats(request.artist.id)
  })
}
