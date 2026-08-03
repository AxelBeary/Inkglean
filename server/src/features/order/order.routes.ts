import * as orderService from './order.service.js'
import * as orderStatsService from './order-stats.service.js'
import * as orderQueueService from './order-queue.service.js'
import * as orderGalleryService from './order-gallery.service.js'
import * as orderWorkflowService from './order-workflow.service.js'
import * as activityLogService from './activity-log.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain, getRules, getTierById } from '../artist/artist.service.js'
import { getWorkflow } from '../artist/workflow.service.js'
import { clamp, isValidQq } from '../../shared/validate.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'
import db from '../../db/connection.js'

// ============================================
// 订单路由 - 下单、查询、管理、交付
// ============================================

/** 为订单的 references + deliverables + notes 补签名 URL（H-1 修复抽取，多路由共用） */
function signOrderUrls(order: any): any {
  if (order.references) {
    order.references = order.references.map((r: any) => ({ ...r, url: signedUrl(r.file_path) }))
  }
  if (order.deliverables) {
    order.deliverables = order.deliverables.map((d: any) => ({ ...d, url: signedUrl(d.file_path) }))
  }
  // R19: 备注附图签名 — 漏做 = 前端拿裸路径 → 403（焦点图 Bug 翻版）
  if (order.notes) {
    order.notes = order.notes.map((n: any) =>
      n.image_path ? { ...n, imageUrl: signedUrl(n.image_path) } : n
    )
  }
  return order
}

/** 限流守卫：不通过则抛 429 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/**
 * 订单归属校验 preHandler
 * 解析 :id → 查订单 → 校验 artist_id → 挂载 request.order
 */
async function requireOwnOrder(request: any): Promise<void> {
  const id = parseInt(request.params.id, 10)
  if (isNaN(id)) throw new AppError(E.ORDER_INVALID_ID)
  const order = orderService.getOrder(id)
  if (!order || order.artist_id !== request.artist.id) {
    throw new AppError(E.ORDER_NOT_FOUND, 404)
  }
  request.order = order
}

export default async function orderRoutes(fastify: any) {

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
          rushMultiplierId: { type: ['integer', 'null'] },
          discountCode: { type: ['string', 'null'], maxLength: 20 },
          styleSizeId: { type: ['integer', 'null'] },
          styleAddons: {
            type: 'array',
            items: {
              type: 'object',
              required: ['styleAddonId'],
              properties: {
                styleAddonId: { type: 'integer' },
                quantity: { type: 'integer', minimum: 1, maximum: 99 },
                optionLabel: { type: 'string', maxLength: 100 }
              },
              additionalProperties: false
            },
            maxItems: 20
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    guardRateLimit(`order-create:${request.ip}`, 10, 10 * 60_000)

    const { subdomain, tierId, clientQq, clientName, description, priority, clientNotify, agreeRules, references, addons, usageMultiplierId, rushMultiplierId, discountCode, styleSizeId, styleAddons } = request.body as any

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)
    if ((artist as any).status !== 'open') throw new AppError(E.ARTIST_NOT_OPEN)

    // 仅当画师设置了非空须知时，才要求客户勾选同意
    const rules = getRules((artist as any).id)
    if ((rules as any)?.content && !agreeRules) throw new AppError(E.RULES_NOT_AGREED)

    // v0.24 #10: 档位三态校验 — showcase/hidden 不允许下单
    if (tierId) {
      const tier = getTierById(tierId)
      if (tier && tier.visibility !== 'visible') {
        throw new AppError(E.TIER_NOT_AVAILABLE)
      }
    }

    // C-3 修复：参考图路径校验 — 必须在 references/ 目录下，拒绝路径穿越
    if (references) {
      for (const ref of references) {
        if (ref.includes('..') || !ref.startsWith('references/')) {
          throw new AppError(E.ILLEGAL_PATH)
        }
      }
    }

    const order = orderService.createOrder({
      artistId: (artist as any).id,
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
      rushMultiplierId: rushMultiplierId || null,
      discountCode: discountCode || null,
      styleSizeId: styleSizeId || null,
      styleAddons: styleAddons || []
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
  fastify.get('/api/orders/track/:orderNo', async (request: any) => {
    guardRateLimit(`track:${request.ip}`, 20, 5 * 60_000)

    const { qq } = (request.query || {}) as any
    if (!qq) throw new AppError(E.QQ_REQUIRED)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const result = orderService.getClientQueuePosition(request.params.orderNo, qq)
    if (!result) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const { order, position, total } = result

    // R11: 流程阶段列表 + 当前阶段（需迁移 v12 后才有真实值）
    const workflowStages = getWorkflow(order.artist_id)

    // R30d: 客户只显示当前节点名（不显示进度数字）
    const stageInfo = orderWorkflowService.getStageInfo(order)

    // 只返回客户需要看到的信息
    return {
      orderNo: order.order_no,
      status: order.status,
      tierName: order.tier_name,
      artistName: order.artist_name,
      position,
      total,
      workflowStages,
      currentStageId: order.current_stage_id ?? null,
      currentStageName: stageInfo?.currentStageName ?? null,
      deliverables: order.deliverables.map((d: any) => ({
        id: d.id,
        fileName: d.original_name,
        url: signedUrl(d.file_path)
      })),
      // SPEC-003 §5.5: 客户可见附加项（仅 name + priceCents）+ 最终价格 + 付款节点
      extraItems: (order.extraItems || []).map((item: any) => ({
        name: item.name,
        priceCents: item.price_cents
      })),
      finalPriceCents: order.final_price_cents ?? null,
      paidTotalCents: order.paid_total_cents ?? 0,
      installments: orderService.getOrderInstallments(order.id),
      // SPEC-004: 排队分区信息
      queueZone: order.queue_zone || 'formal',
      queueDisplay: (() => {
        if (order.queue_zone !== 'buffer') return null
        const artist = db.prepare('SELECT hide_queue_position FROM artists WHERE id = ?').get(order.artist_id) as { hide_queue_position: number } | undefined
        if (artist?.hide_queue_position) return '排队中'
        // 计算缓冲区位次
        const bufferQueue = db.prepare(`
          SELECT id FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
          ORDER BY queue_position ASC
        `).all(order.artist_id) as Array<{ id: number }>
        const pos = bufferQueue.findIndex(o => o.id === order.id) + 1
        return pos > 0 ? `排队中（第 ${pos} 位）` : '排队中'
      })(),
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }
  })

  /**
     * GET /api/orders/my
     * 客户凭 QQ号 + 画师子域名 查询自己的所有订单（"不知道订单号"场景）
     * P2-#19: 限流收紧为每 IP 每分钟 10 次（防 QQ 枚举）
     */
    fastify.get('/api/orders/my', async (request: any) => {
      guardRateLimit(`my-orders:${request.ip}`, 10, 60_000)

    const { subdomain, qq } = (request.query || {}) as any
    if (!subdomain || !qq) throw new AppError(E.MISSING_PARAMS)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    const orders = orderService.getClientOrdersByQq((artist as any).id, qq)
    return orders.map((o: any) => ({
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
  fastify.get('/api/orders/lookup', async (request: any) => {
    guardRateLimit(`lookup:${request.ip}`, 10, 5 * 60_000)

    const { subdomain, qq } = (request.query || {}) as any
    if (!subdomain || !qq) throw new AppError(E.MISSING_PARAMS)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const artist = getArtistBySubdomain(subdomain)
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    const hasOrders = orderService.hasClientOrders((artist as any).id, qq)
    if (!hasOrders) {
      return { hasOrders: false }
    }

    return {
      hasOrders: true,
      contactQq: (artist as any).contact_qq || (artist as any).qq_number,
      adminQq: orderService.getPlatformConfig('admin_qq'),
      artistName: (artist as any).name
    }
  })

  /**
   * GET /api/orders/delivery/:orderNo
   * 交付文件下载页数据（需 QQ 验证）
   */
  fastify.get('/api/orders/delivery/:orderNo', async (request: any) => {
    guardRateLimit(`delivery:${request.ip}`, 20, 5 * 60_000)

    const { qq } = (request.query || {}) as any
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
      deliverables: order.deliverables.map((d: any) => ({
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
  fastify.get('/api/artist/orders', { preHandler: requireAuth }, async (request: any) => {
    const { status, page, pageSize, q } = (request.query || {}) as any
    const result = orderService.getArtistOrders(request.artist.id, status, {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize, 10) || 50, 200)),
      q: typeof q === 'string' ? q.slice(0, 100) : undefined
    })
    // Bug fix: 焦点图在 references/ 目录，裸路径 403，需签名 URL
    if (result.items) {
      result.items = result.items.map((order: any) => {
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
  fastify.get('/api/artist/queue', { preHandler: requireAuth }, async (request: any) => {
      const { zone } = (request.query || {}) as any
      if (zone === 'buffer') {
        // 缓冲区列表
        const bufferOrders = db.prepare(`
          SELECT o.*, t.name as tier_name, t.price as tier_price
          FROM orders o
          LEFT JOIN price_tiers t ON o.tier_id = t.id
          WHERE o.artist_id = ? AND o.queue_zone = 'buffer' AND o.status NOT IN ('delivered', 'cancelled')
          ORDER BY o.queue_position ASC
        `).all(request.artist.id) as any[]
        return bufferOrders.map((order: any) => {
          const mapped: any = { ...order, currentStageId: order.current_stage_id ?? null, startDate: order.start_date ?? null }
          if (order.focus_image_path) {
            mapped.focusImageUrl = signedUrl(order.focus_image_path)
          }
          return mapped
        })
      }
      // REQ-013 #7: 完成区（最近 7 天已交付订单，沉底灰色展示）
      if (zone === 'completed') {
        const completed = orderQueueService.getCompletedQueue(request.artist.id)
        return completed.map((order: any) => {
          const mapped: any = { ...order, currentStageId: order.current_stage_id ?? null, startDate: order.start_date ?? null }
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
      return queue.map((order: any) => {
        const mapped: any = { ...order, currentStageId: order.current_stage_id ?? null, startDate: order.start_date ?? null }
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
  fastify.get('/api/artist/orders/upcoming-deadlines', { preHandler: requireAuth }, async (request: any) => {
    return orderStatsService.getUpcomingDeadlines(request.artist.id)
  })

  /**
   * GET /api/artist/orders/:id
   */
  fastify.get('/api/artist/orders/:id', { preHandler: [requireAuth, requireOwnOrder] }, async (request: any) => {
    // H-1 修复：画师端也返回签名 URL（references + deliverables 非公开目录）
    const order = signOrderUrls(request.order)
    // R30d: 附加流程进度信息
    const stageInfo = orderWorkflowService.getStageInfo(order)
    if (stageInfo) Object.assign(order, stageInfo)
    // plan-node-speech: 话术 + 客户沟通数据
    const speechInfo = orderWorkflowService.getSpeechInfo(order)
    Object.assign(order, speechInfo)
    // B7: 额度池 — 已付/待收 + 分期推算状态
    const finalCents = order.final_price_cents ?? order.total_price_cents ?? null
    Object.assign(order, {
      paidTotalCents: order.paid_total_cents ?? 0,
      remainingCents: finalCents != null ? Math.max(0, finalCents - (order.paid_total_cents ?? 0)) : null,
      installments: orderService.getOrderInstallments(order.id),
      // v0.26 B: snake_case → camelCase 映射（对照 currentStageId 模式）
      startDate: order.start_date ?? null
    })
    return order
  })

  /**
   * POST /api/artist/orders/manual
   * R3: 补全参考图/增项/倍率/QQ通知，信息完整度不低于自助下单
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
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          clientNotify: { type: 'boolean' },
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
          rushMultiplierId: { type: ['integer', 'null'] },
          discountCode: { type: ['string', 'null'], maxLength: 20 },
          styleSizeId: { type: ['integer', 'null'] },
          styleAddons: {
            type: 'array',
            items: {
              type: 'object',
              required: ['styleAddonId'],
              properties: {
                styleAddonId: { type: 'integer' },
                quantity: { type: 'integer', minimum: 1, maximum: 99 },
                optionLabel: { type: 'string', maxLength: 100 }
              },
              additionalProperties: false
            },
            maxItems: 20
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const { tierId, clientQq, clientName, description, priority, clientNotify, references, addons, usageMultiplierId, rushMultiplierId, discountCode, styleSizeId, styleAddons } = request.body as any

    // C-3 安全：参考图路径校验（与自助下单一致）
    if (references) {
      for (const ref of references) {
        if (ref.includes('..') || !ref.startsWith('references/')) {
          throw new AppError(E.ILLEGAL_PATH)
        }
      }
    }

    return orderService.createOrder({
      artistId: request.artist.id,
      tierId,
      clientQq: clamp(clientQq, 'qq'),
      clientName: clamp(clientName, 'name'),
      description: clamp(description, 'description'),
      priority: priority || 'medium',
      source: 'manual',
      clientNotify: clientNotify || false,
      references: references || [],
      addons: addons || [],
      usageMultiplierId: usageMultiplierId || null,
      rushMultiplierId: rushMultiplierId || null,
      discountCode: discountCode || null,
      styleSizeId: styleSizeId || null,
      styleAddons: styleAddons || []
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
  }, async (request: any) => {
    // R30d: 有 current_stage_id 的订单必须走 stage 接口（cancelled 除外）
    if (request.order.current_stage_id && (request.body as any).status !== 'cancelled') {
      throw new AppError(E.INVALID_TRANSITION, 400, { from: '流程模式', to: '请使用 PUT stage 接口' })
    }
    return orderService.updateOrderStatus(request.order.id, (request.body as any).status)
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
  }, async (request: any) => {
    return orderQueueService.updatePriority(request.order.id, (request.body as any).priority)
  })

  /**
   * PUT /api/artist/orders/:id/deadline
   * R51: 设置/修改/清除截稿日
   */
  fastify.put('/api/artist/orders/:id/deadline', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['deadline'],
        properties: {
          deadline: { type: ['string', 'null'], maxLength: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return orderService.updateDeadline(request.order.id, (request.body as any).deadline)
  })

  /**
   * PUT /api/artist/orders/:id/start-date
   * v0.26 B: 设置/修改/清除开工日
   */
  fastify.put('/api/artist/orders/:id/start-date', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['startDate'],
        properties: {
          startDate: { type: ['string', 'null'], maxLength: 10 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return orderService.updateStartDate(request.order.id, (request.body as any).startDate)
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
  }, async (request: any) => {
    // P1-A 修复：重排返回值补焦点图签名（同 GET /api/artist/queue 逻辑）
    const queue = orderQueueService.reorderQueue(request.artist.id, (request.body as any).orderedIds)
    return queue.map((order: any) => {
      if (order.focus_image_path) {
        return { ...order, focusImageUrl: signedUrl(order.focus_image_path) }
      }
      return order
    })
  })

  /**
   * POST /api/artist/orders/:id/notes
   * R19: 支持可选附图 imagePath（notes/{artistId}/ 目录）
   * JSON Schema 输入校验
   */
  fastify.post('/api/artist/orders/:id/notes', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 1000 },
          imagePath: { type: ['string', 'null'], maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const { content, imagePath } = request.body as any

    // R19: 路径归属校验 — 只允许 notes/{artistId}/ 目录，拒绝路径穿越
    if (imagePath) {
      if (imagePath.includes('..') || !imagePath.startsWith(`notes/${request.artist.id}/`)) {
        throw new AppError(E.NOTE_IMAGE_PATH_INVALID)
      }
    }

    return signOrderUrls(orderService.addNote(request.order.id, clamp(content, 'note'), 'artist', imagePath || null))
  })

  /**
   * DELETE /api/artist/orders/:id/notes/:noteId
   * R46: 删除备注（系统备注拒绝，带图备注由 GC 清理）
   */
  fastify.delete('/api/artist/orders/:id/notes/:noteId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    const noteId = parseInt(request.params.noteId, 10)
    if (isNaN(noteId)) throw new AppError(E.ORDER_INVALID_ID)
    return signOrderUrls(orderService.deleteNote(request.order.id, noteId))
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
  }, async (request: any) => {
    const { filePath, fileName, fileSize } = request.body as any

    // 安全：路径归属校验 — 只允许自己交付目录下的文件，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith(`deliverables/${request.artist.id}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    const result = orderGalleryService.deliverOrder(request.order.id, filePath, fileName, fileSize)
    // R19: 交付返回的订单含 notes，需签名
    return { ...signOrderUrls(result.order), statusChanged: result.statusChanged }
  })

  /**
   * POST /api/artist/orders/:id/deliver-no-file
   * 无文件交付（方案 B：修复工作流订单最后节点交付卡死）
   * 画师确认本单无需交付文件，直接完成交付流程
   */
  fastify.post('/api/artist/orders/:id/deliver-no-file', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    const result = orderGalleryService.deliverOrderWithoutFile(request.order.id)
    // R19: 交付返回的订单含 notes，需签名
    return { ...signOrderUrls(result.order), statusChanged: result.statusChanged }
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
  }, async (request: any) => {
    const { filePath, fileName, fileSize } = request.body as any

    // 安全：路径归属校验 — 参考图只允许 references/ 目录，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith('references/')) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    // R18: 画师加图标记 source='artist'（显式传值，不依赖 DEFAULT）
    orderGalleryService.addReference(request.order.id, filePath, fileName, fileSize, 'artist')
    return signOrderUrls(orderService.getOrder(request.order.id))
  })

  /**
   * GET /api/artist/stats
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request: any) => {
    return orderStatsService.getArtistStats(request.artist.id)
  })

  // ─── v0.11 R2: 最终价格修改 ───

  /**
   * PUT /api/artist/orders/:id/price
   * 修改最终价格 + 报价字符串
   */
  fastify.put('/api/artist/orders/:id/price', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['finalPriceCents'],
        properties: {
          finalPriceCents: { type: 'integer', minimum: 1, maximum: 99999999 },
          quoteSnapshot: { type: ['string', 'null'], maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const { finalPriceCents, quoteSnapshot } = request.body as any
    // R19: 改价返回的订单含 notes，需签名（与 GET orders/:id 一致）
    return signOrderUrls(orderService.updateFinalPrice(request.order.id, finalPriceCents, quoteSnapshot))
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
  }, async (request: any) => {
    const { imagePath, mode } = request.body as any
    // M2 修复：路由层路径校验（纵深防御）— 焦点图必须来自 references/ 目录，拒绝路径穿越。
    // 服务层仍校验参考图归属该订单（setFocusImage），此处只补格式层守卫。
    if (imagePath && (imagePath.includes('..') || !imagePath.startsWith('references/'))) {
      throw new AppError(E.ILLEGAL_PATH)
    }
    const order = orderGalleryService.setFocusImage(request.order.id, imagePath, mode)
    // Bug fix: setFocusImage 返回的订单需要签名 URL（与 GET orders/:id 一致）
    return signOrderUrls(order)
  })

  /**
   * DELETE /api/artist/orders/:id/references/:refId
   * 删除参考图（自动清理焦点图）
   */
  fastify.delete('/api/artist/orders/:id/references/:refId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    const refId = parseInt(request.params.refId, 10)
    if (isNaN(refId)) throw new AppError(E.ORDER_INVALID_ID)
    return orderGalleryService.removeReference(request.order.id, refId)
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
  }, async (request: any) => {
    guardRateLimit(`refresh-sig:${request.artist.id}`, 20, 5 * 60_000)

    const { paths } = request.body as any
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
          urls[p] = signedUrl(p)
        }

    return { urls }
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
          stageId: { type: ['integer', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const order = orderWorkflowService.advanceStage(request.order.id, (request.body as any).stageId)
    const stageInfo = orderWorkflowService.getStageInfo(order)
    if (stageInfo) Object.assign(order, stageInfo)
    return signOrderUrls(order)
  })

  /**
   * PUT /api/artist/orders/:id/track-on
   * v0.14: 对无工作流订单启用流程跟踪（设第一节点，status 不变）
   */
  fastify.put('/api/artist/orders/:id/track-on', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    const order = orderWorkflowService.enableTracking(request.order.id)
    const stageInfo = orderWorkflowService.getStageInfo(order)
    if (stageInfo) Object.assign(order, stageInfo)
    return signOrderUrls(order)
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
          stageId: { type: 'integer' }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const order = orderWorkflowService.rollbackStage(request.order.id, (request.body as any).stageId)
    const stageInfo = orderWorkflowService.getStageInfo(order)
    if (stageInfo) Object.assign(order, stageInfo)
    return signOrderUrls(order)
  })

  // ─── SPEC-003: 附加工作项 ───

  /**
   * POST /api/artist/orders/:id/extra-items
   * 添加附加工作项（终态拒绝 + 上限 20）
   */
  fastify.post('/api/artist/orders/:id/extra-items', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: ['string', 'null'], maxLength: 500 },
          priceCents: { type: 'integer', minimum: 0, maximum: 99999999 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const { name, description, priceCents } = request.body as any
    return signOrderUrls(orderService.addExtraItem(request.order.id, { name, description, priceCents }))
  })

  /**
   * DELETE /api/artist/orders/:id/extra-items/:itemId
   * 删除附加工作项（归属校验）
   */
  fastify.delete('/api/artist/orders/:id/extra-items/:itemId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    const itemId = parseInt(request.params.itemId, 10)
    if (isNaN(itemId)) throw new AppError(E.ORDER_INVALID_ID)
    return signOrderUrls(orderService.deleteExtraItem(request.order.id, itemId))
  })

  // ─── B7: 额度池收款 ───

  /**
   * POST /api/artist/orders/:id/payments
   * 记录收款（正数）或撤销/退款（负数）
   */
  fastify.post('/api/artist/orders/:id/payments', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        required: ['amountCents'],
        properties: {
          amountCents: { type: 'integer', minimum: -99999999, maximum: 99999999 },
          note: { type: ['string', 'null'], maxLength: 200 },
          installmentId: { type: ['integer', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    const { amountCents, note, installmentId } = request.body as any
    const payment = orderService.addPayment(request.order.id, { amountCents, note, createdBy: 'artist', installmentId: installmentId || null })
    const order = orderService.getOrder(request.order.id)
    return {
      payment,
      paidTotalCents: order?.paid_total_cents ?? 0,
      finalPriceCents: order?.final_price_cents ?? order?.total_price_cents ?? null,
      installments: orderService.getOrderInstallments(request.order.id)
    }
  })

  /**
   * GET /api/artist/orders/:id/payments
   * 收款流水列表
   */
  fastify.get('/api/artist/orders/:id/payments', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    return { payments: orderService.getPayments(request.order.id) }
  })

  /**
   * GET /api/artist/orders/:id/logs
   * v0.31 REQ-021 F1: 操作日志（分页 + ?type= 筛选）
   */
  fastify.get('/api/artist/orders/:id/logs', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    const { page, pageSize, type } = (request.query || {}) as any
    return activityLogService.getOrderLogs(request.order.id, {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize, 10) || 50, 200)),
      type: typeof type === 'string' ? type : undefined
    })
  })

  // ─── SPEC-004: 名额与缓冲 ───

  /**
   * POST /api/artist/orders/:id/promote
   * 递补：buffer → formal（排到正式队列末尾 + 生成付款节点）
   */
  fastify.post('/api/artist/orders/:id/promote', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: any) => {
    return signOrderUrls(orderService.promoteOrder(request.order.id))
  })
}
