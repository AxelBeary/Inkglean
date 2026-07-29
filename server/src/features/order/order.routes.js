import * as orderService from './order.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain, getRules } from '../artist/artist.service.js'
import { getWorkflow } from '../artist/workflow.service.js'
import { clamp, isValidQq } from '../../shared/validate.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 订单路由 - 下单、查询、管理、交付
// ============================================

/** 为订单的 references + deliverables + notes 补签名 URL（H-1 修复抽取，多路由共用） */
function signOrderUrls(order) {
  if (order.references) {
    order.references = order.references.map(r => ({ ...r, url: signedUrl(r.file_path) }))
  }
  if (order.deliverables) {
    order.deliverables = order.deliverables.map(d => ({ ...d, url: signedUrl(d.file_path) }))
  }
  // R19: 备注附图签名 — 漏做 = 前端拿裸路径 → 403（焦点图 Bug 翻版）
  if (order.notes) {
    order.notes = order.notes.map(n =>
      n.image_path ? { ...n, imageUrl: signedUrl(n.image_path) } : n
    )
  }
  return order
}

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

    // R11: 流程阶段列表 + 当前阶段（需迁移 v12 后才有真实值）
    const workflowStages = getWorkflow(order.artist_id)

    // R30d: 客户只显示当前节点名（不显示进度数字）
    const stageInfo = orderService.getStageInfo(order)

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
    const result = orderService.getArtistOrders(request.artist.id, status, {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize, 10) || 50, 200))
    })
    // Bug fix: 焦点图在 references/ 目录，裸路径 403，需签名 URL
    if (result.items) {
      result.items = result.items.map(order => {
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
   */
  fastify.get('/api/artist/queue', { preHandler: requireAuth }, async (request) => {
    const queue = orderService.getArtistQueue(request.artist.id)
    // Bug fix: 焦点图在 references/ 目录，裸路径 403，需签名 URL
    return queue.map(order => {
      if (order.focus_image_path) {
        return { ...order, focusImageUrl: signedUrl(order.focus_image_path) }
      }
      return order
    })
  })

  /**
   * GET /api/artist/orders/:id
   */
  fastify.get('/api/artist/orders/:id', { preHandler: [requireAuth, requireOwnOrder] }, async (request) => {
   // H-1 修复：画师端也返回签名 URL（references + deliverables 非公开目录）
   const order = signOrderUrls(request.order)
   // R30d: 附加流程进度信息
   const stageInfo = orderService.getStageInfo(order)
   if (stageInfo) Object.assign(order, stageInfo)
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
          rushMultiplierId: { type: ['integer', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const { tierId, clientQq, clientName, description, priority, clientNotify, references, addons, usageMultiplierId, rushMultiplierId } = request.body

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
      rushMultiplierId: rushMultiplierId || null
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
    // R30d: 有 current_stage_id 的订单必须走 stage 接口（cancelled 除外）
    if (request.order.current_stage_id && request.body.status !== 'cancelled') {
      throw new AppError(E.INVALID_TRANSITION, 400, { from: '流程模式', to: '请使用 PUT stage 接口' })
    }
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
    // P1-A 修复：重排返回值补焦点图签名（同 GET /api/artist/queue 逻辑）
    const queue = orderService.reorderQueue(request.artist.id, request.body.orderedIds)
    return queue.map(order => {
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
  }, async (request) => {
    const { content, imagePath } = request.body

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
  }, async (request) => {
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
  }, async (request) => {
    const { filePath, fileName, fileSize } = request.body

    // 安全：路径归属校验 — 只允许自己交付目录下的文件，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith(`deliverables/${request.artist.id}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    const result = orderService.deliverOrder(request.order.id, filePath, fileName, fileSize)
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
  }, async (request) => {
    const { filePath, fileName, fileSize } = request.body

    // 安全：路径归属校验 — 参考图只允许 references/ 目录，拒绝路径穿越
    if (filePath.includes('..') || !filePath.startsWith('references/')) {
      throw new AppError(E.ILLEGAL_PATH)
    }

    // R18: 画师加图标记 source='artist'（显式传值，不依赖 DEFAULT）
    orderService.addReference(request.order.id, filePath, fileName, fileSize, 'artist')
    return signOrderUrls(orderService.getOrder(request.order.id))
  })

  /**
   * GET /api/artist/stats
   */
  fastify.get('/api/artist/stats', { preHandler: requireAuth }, async (request) => {
    return orderService.getArtistStats(request.artist.id)
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
  }, async (request) => {
    const { finalPriceCents, quoteSnapshot } = request.body
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
  }, async (request) => {
    const { imagePath, mode } = request.body
    const order = orderService.setFocusImage(request.order.id, imagePath, mode)
    // Bug fix: setFocusImage 返回的订单需要签名 URL（与 GET orders/:id 一致）
    return signOrderUrls(order)
  })

  /**
   * DELETE /api/artist/orders/:id/references/:refId
   * 删除参考图（自动清理焦点图）
   */
  fastify.delete('/api/artist/orders/:id/references/:refId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request) => {
    const refId = parseInt(request.params.refId, 10)
    if (isNaN(refId)) throw new AppError(E.ORDER_INVALID_ID)
    return orderService.removeReference(request.order.id, refId)
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
  }, async (request) => {
    guardRateLimit(`refresh-sig:${request.artist.id}`, 20, 5 * 60_000)

    const { paths } = request.body
    const artistId = String(request.artist.id)

    // 安全：路径归属校验 — 只允许本画师有权访问的目录
    const allowedPrefixes = ['references/', `deliverables/${artistId}/`, `notes/${artistId}/`]
    const urls = {}
    for (const p of paths) {
      if (p.includes('..') || !allowedPrefixes.some(prefix => p.startsWith(prefix))) {
        throw new AppError(E.ILLEGAL_PATH)
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
  }, async (request) => {
    const order = orderService.advanceStage(request.order.id, request.body.stageId)
    const stageInfo = orderService.getStageInfo(order)
    if (stageInfo) Object.assign(order, stageInfo)
    return signOrderUrls(order)
  })

  /**
   * PUT /api/artist/orders/:id/track-on
   * v0.14: 对无工作流订单启用流程跟踪（设第一节点，status 不变）
   */
  fastify.put('/api/artist/orders/:id/track-on', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request) => {
    const order = orderService.enableTracking(request.order.id)
    const stageInfo = orderService.getStageInfo(order)
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
  }, async (request) => {
    const order = orderService.rollbackStage(request.order.id, request.body.stageId)
    const stageInfo = orderService.getStageInfo(order)
    if (stageInfo) Object.assign(order, stageInfo)
    return signOrderUrls(order)
  })
}
