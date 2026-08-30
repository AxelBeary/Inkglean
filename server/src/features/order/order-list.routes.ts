import * as orderService from './order.service.js'
import * as orderStatsService from './order-stats.service.js'
import * as orderQueueService from './order-queue.service.js'
import { assertReferenceFileExists, enrichOrderForArtist, guardRateLimit, requireOwnOrder } from './order-route-utils.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { clamp } from '../../shared/validate.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'
import db from '../../db/connection.js'
import type { ArtistOrderRow } from '../../types/entities.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { withIdempotency, readIdempotencyKey } from '../../shared/idempotency.js'

// ============================================
// 订单路由 - 画师端列表/队列/统计子插件（从 order.routes.ts 拆出）
// ============================================

export async function orderListRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/artist/orders
   */
  fastify.get('/api/artist/orders', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    const { status, page, pageSize, q, sort } = (request.query || {}) as { status?: string; page?: string; pageSize?: string; q?: string; sort?: string }
    const result = orderService.getArtistOrders(request.artist.id, status, {
      page: Math.max(1, parseInt(page ?? '', 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize ?? '', 10) || 50, 200)),
      q: typeof q === 'string' ? q.slice(0, 100) : undefined,
      // v130: 排序白名单（非法值回落默认时间倒序）
      sort: sort === 'time_asc' || sort === 'priority' ? sort : undefined
    })
    // Bug fix: 焦点图在 references/ 目录，裸路径 403，需签名 URL
    if (result.items) {
      result.items = result.items.map((order: ArtistOrderRow) => {
        if (order.focus_image_path) {
          return { ...order, focusImageUrl: signedUrl(order.focus_image_path) }
        }
        return order
      })
    }
    return result
  })

  /**
   * GET /api/artist/queue
   * SPEC-004: zone=buffer 返回缓冲区列表
   */
  fastify.get('/api/artist/queue', { preHandler: requireAuth }, async (request: FastifyRequest) => {
      // 815 拍板 #1：懒结算过期撤销窗口（队列重排/递补在窗口过后才发生）
      orderService.settleExpiredUndoWindows(request.artist.id)
      const { zone } = (request.query || {}) as { zone?: string }
      if (zone === 'buffer') {
        // 缓冲区列表
        const bufferOrders = db.prepare(`
          SELECT o.*, (ast.name || ' / ' || ss.name) as tier_name, ss.base_price as tier_price
          FROM orders o
          LEFT JOIN style_sizes ss ON o.style_size_id = ss.id
          LEFT JOIN art_styles ast ON ss.art_style_id = ast.id
          WHERE o.artist_id = ? AND o.queue_zone = 'buffer' AND o.status NOT IN ('delivered', 'cancelled')
          ORDER BY o.queue_position ASC
        `).all(request.artist.id) as ArtistOrderRow[]
        return bufferOrders.map((order: ArtistOrderRow) => {
          const mapped: ArtistOrderRow = { ...order, currentStageId: order.current_stage_id ?? null, startDate: order.start_date ?? null }
          if (order.focus_image_path) {
            mapped.focusImageUrl = signedUrl(order.focus_image_path)
          }
          return mapped
        })
      }
      // REQ-013 #7: 完成区（最近 7 天已交付订单，沉底灰色展示）
      if (zone === 'completed') {
        const completed = orderQueueService.getCompletedQueue(request.artist.id)
        return completed.map((order: ArtistOrderRow) => {
          const mapped: ArtistOrderRow = { ...order, currentStageId: order.current_stage_id ?? null, startDate: order.start_date ?? null }
          if (order.focus_image_path) {
            mapped.focusImageUrl = signedUrl(order.focus_image_path)
          }
          return mapped
        })
      }
      // 默认：正式区
      const queue = orderQueueService.getArtistQueue(request.artist.id)
      // Bug fix: 焦点图在 references/ 目录，裸路径 403，需签名 URL
      // Bug 4 fix: 映射 current_stage_id → currentStageId（前端用 camelCase）
      return queue.map((order: ArtistOrderRow) => {
        const mapped: ArtistOrderRow = { ...order, currentStageId: order.current_stage_id ?? null, startDate: order.start_date ?? null }
        if (order.focus_image_path) {
          mapped.focusImageUrl = signedUrl(order.focus_image_path)
        }
        return mapped
      })
    })

  /**
   * GET /api/artist/orders/upcoming-deadlines
   * R51: 即将到期订单列表（deadline 在未来 7 天内 + 非终态，按 deadline 升序）
   * 注意：必须在 /api/artist/orders/:id 之前注册，避免被 :id 吞掉
   */
  fastify.get('/api/artist/orders/upcoming-deadlines', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return orderStatsService.getUpcomingDeadlines(request.artist.id)
  })

  /**
   * GET /api/artist/orders/:id
   */
  fastify.get('/api/artist/orders/:id', { preHandler: [requireAuth, requireOwnOrder] }, async (request: FastifyRequest) => {
    // B1 修复：增强逻辑抽至 enrichOrderForArtist，与所有变更端点统一
    return enrichOrderForArtist(request.order, request.artist.id)
  })

  /**
   * POST /api/artist/orders/manual
   * SPEC-PRICE-2：手动录单同走画风尺寸 + 增项唯一计价路径
   */
  fastify.post('/api/artist/orders/manual', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['clientQq'],
        properties: {
          clientQq: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          clientName: { type: ['string', 'null'], maxLength: 50 },
          description: { type: ['string', 'null'], maxLength: 2000 },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          clientNotify: { type: 'boolean' },
          // P2-12: 单条参考图路径限长，防超大字符串撑爆后续校验/落库
          references: { type: 'array', items: { type: 'string', maxLength: 2000 }, maxItems: 5 },
          discountCode: { type: ['string', 'null'], maxLength: 20 },
          styleSizeId: { type: ['integer', 'null'] },
          styleAddons: {
            type: 'array',
            items: {
              type: 'object',
              required: ['styleAddonId'],
              properties: {
                styleAddonId: { type: 'integer' },
                quantity: { type: 'integer', minimum: 1, maximum: 999 }
              },
              additionalProperties: false
            },
            maxItems: 20
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientQq, clientName, description, priority, clientNotify, references, discountCode, styleSizeId, styleAddons } = request.body as { clientQq: string; clientName?: string | null; description?: string | null; priority?: string; clientNotify?: boolean; references?: string[]; discountCode?: string | null; styleSizeId?: number | null; styleAddons?: Array<{ styleAddonId: number; quantity?: number }> }

    // C-3 + P2-12：参考图路径校验（与自助下单一致，含文件存在性）
    if (references) {
      for (const ref of references) {
        assertReferenceFileExists(ref)
      }
    }

    // I6-d（v75 遗留收尾）: 手动录单消费幂等键 header（前端已携带 idempotency-key；
    // 对齐 R-9 既有模式——同 key 重放原样返回首单结果，不重复建单）
    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key'])
    const result = withIdempotency(`manual-order:${request.artist.id}`, idempotencyKey, () => {
      const order = orderService.createOrder({
        artistId: request.artist.id,
        clientQq: clamp(clientQq, 'qq')!,
        clientName: clamp(clientName, 'name'),
        description: clamp(description, 'description'),
        priority: priority || 'medium',
        source: 'manual',
        clientNotify: clientNotify || false,
        references: references || [],
        discountCode: discountCode || null,
        styleSizeId: styleSizeId || null,
        styleAddons: styleAddons || []
      })
      // F1 围剿：手动录单同样生成令牌；响应一次下发明文 + 完整追踪 URL 片段
      // （画师可立即复制链接发给客户）。customer_token_hash 不外泄（非明文但无需下发）。
      const orderBody = { ...order }
      delete (orderBody as { customerToken?: string }).customerToken
      delete (orderBody as { customer_token_hash?: string }).customer_token_hash
      return {
        statusCode: 200,
        body: {
          ...orderBody,
          customerToken: order.customerToken,
          trackUrl: orderService.buildCustomerTrackUrl(
            request.artist.subdomain,
            order.order_no,
            order.customerToken
          )
        }
      }
    })
    return reply.code(result.statusCode).send(result.body)
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
  }, async (request: FastifyRequest) => {
    // P1-A 修复：重排返回值补焦点图签名（同 GET /api/artist/queue 逻辑）
    const queue = orderQueueService.reorderQueue(request.artist.id, (request.body as { orderedIds: number[] }).orderedIds)
    return queue.map((order: ArtistOrderRow) => {
      if (order.focus_image_path) {
        return { ...order, focusImageUrl: signedUrl(order.focus_image_path) }
      }
      return order
    })
  })

  /**
   * GET /api/artist/stats
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return orderStatsService.getArtistStats(request.artist.id)
  })

  // ─── R33: 签名 URL 批量刷新 ───

  /**
   * POST /api/artist/refresh-signatures
   * 批量刷新签名 URL（前端定时轮询，防 15min 过期 403）
   * 限流：同画师 20次/5分钟
   */
  fastify.post('/api/artist/refresh-signatures', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['paths'],
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 500 },
            minItems: 1,
            maxItems: 50
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    guardRateLimit(`refresh-sig:${request.artist.id}`, 20, 5 * 60_000)

    const { paths } = request.body as { paths: string[] }
    const artistId = String(request.artist.id)

    // 安全：路径归属校验 — 只允许本画师有权访问的目录
        const allowedPrefixes = ['references/', `deliverables/${artistId}/`, `notes/${artistId}/`]
        const urls: Record<string, string> = {}
        for (const p of paths) {
          if (p.includes('..') || !allowedPrefixes.some((prefix: string) => p.startsWith(prefix))) {
            throw new AppError(E.ILLEGAL_PATH)
          }
          // P2-#20: references/ 路径需校验属于本画师的订单（防跨画师签发）
          if (p.startsWith('references/')) {
            const owned = db.prepare(
              'SELECT 1 FROM order_references r JOIN orders o ON r.order_id = o.id WHERE r.file_path = ? AND o.artist_id = ? LIMIT 1'
            ).get(p, request.artist.id)
            if (!owned) throw new AppError(E.ILLEGAL_PATH)
          }
          // 260830 审计 H-4：deliverables/ 路径带预览载荷签发（仅 deliverableId，访问层查账本行存在即放行）；
          // 裸签名在交付目录会被钩子 403。归属校验同 references 口径（目录前缀已含画家 id，JOIN 双保险）。
          if (p.startsWith('deliverables/')) {
            const owned = db.prepare(
              'SELECT d.id FROM deliverables d JOIN orders o ON d.order_id = o.id WHERE d.file_path = ? AND o.artist_id = ? LIMIT 1'
            ).get(p, request.artist.id) as { id: number } | undefined
            if (!owned) throw new AppError(E.ILLEGAL_PATH)
            urls[p] = signedUrl(p, { deliverableId: owned.id })
            continue
          }
          urls[p] = signedUrl(p)
        }

    return { urls }
  })
}
