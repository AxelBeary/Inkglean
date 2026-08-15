import * as orderService from './order.service.js'
import * as orderQueueService from './order-queue.service.js'
import * as activityLogService from './activity-log.service.js'
import { enrichOrderForArtist, parseOptionalVersion, requireOwnOrder } from './order-route-utils.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { clamp } from '../../shared/validate.js'
import { AppError, E } from '../../shared/errors.js'
import { withIdempotency, readIdempotencyKey } from '../../shared/idempotency.js'
import { MAX_MONEY_CENTS } from './order-limits.js'  // 815 拍板 #2：金额上限统一 100 万
import db from '../../db/connection.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 订单路由 - 画师端订单动作子插件（从 order.routes.ts 拆出）
// 状态/优先级/日期/备注/改价/增项/收款/日志/递补
// ============================================

export async function orderActionRoutes(fastify: FastifyInstance) {

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
          status: { type: 'string', enum: ['pending', 'confirmed', 'wip', 'revision', 'done', 'delivered', 'cancelled'] },
          // audit-a R-2: 取消已收款订单的显式确认开关
          confirmPaidCancel: { type: 'boolean' },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    // R30d: 有 current_stage_id 的订单必须走 stage 接口（cancelled 除外）
    // 815 审计 P1-2 修复：confirmed/wip 是纯状态流转（不触碰节点，状态机断言仍在服务层），
    // 放行以支持仪表盘待办清单的轻量动作；done/delivered/revision 等仍须走 stage 接口
    const body = request.body as { status: string }
    const statusRouteAllowed = ['cancelled', 'confirmed', 'wip']
    if (request.order.current_stage_id && !statusRouteAllowed.includes(body.status)) {
      throw new AppError(E.INVALID_TRANSITION, 400, { from: '流程模式', to: '请使用 PUT stage 接口' })
    }
    const { status, confirmPaidCancel, version } = request.body as { status: string; confirmPaidCancel?: boolean; version?: number }
    return enrichOrderForArtist(orderService.updateOrderStatus(request.order.id, status, !!confirmPaidCancel, version))
  })

  /**
   * POST /api/artist/orders/:id/cancel
   * 815 拍板 #1：带 5 秒撤销窗口的取消（画师端取消入口）——队列重排/递补延迟到窗口过期结算
   */
  fastify.post('/api/artist/orders/:id/cancel', {
    preHandler: [requireAuth, requireOwnOrder],
    schema: {
      body: {
        type: 'object',
        properties: {
          confirmPaidCancel: { type: 'boolean' },
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { confirmPaidCancel, version } = (request.body ?? {}) as { confirmPaidCancel?: boolean; version?: number }
    const order = orderService.cancelOrderWithUndo(request.order.id, !!confirmPaidCancel, version)
    return { ...enrichOrderForArtist(order), undoWindowMs: orderService.CANCEL_UNDO_WINDOW_MS }
  })

  /**
   * POST /api/artist/orders/:id/cancel-undo
   * 815 拍板 #1：撤销取消（窗口内）；窗口过期 410
   */
  fastify.post('/api/artist/orders/:id/cancel-undo', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    return enrichOrderForArtist(orderService.undoCancelOrder(request.order.id, request.artist.id))
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
  }, async (request: FastifyRequest) => {
    return enrichOrderForArtist(orderQueueService.updatePriority(request.order.id, (request.body as { priority: string }).priority))
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
          deadline: { type: ['string', 'null'], maxLength: 50 },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { deadline, version } = request.body as { deadline: string | null; version?: number }
    return enrichOrderForArtist(orderService.updateDeadline(request.order.id, deadline, version))
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
          startDate: { type: ['string', 'null'], maxLength: 10 },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { startDate, version } = request.body as { startDate: string | null; version?: number }
    return enrichOrderForArtist(orderService.updateStartDate(request.order.id, startDate, version))
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
  }, async (request: FastifyRequest) => {
    const { content, imagePath } = request.body as { content: string; imagePath?: string | null }

    // R19: 路径归属校验 — 只允许 notes/{artistId}/ 目录，拒绝路径穿越
    if (imagePath) {
      if (imagePath.includes('..') || !imagePath.startsWith(`notes/${request.artist.id}/`)) {
        throw new AppError(E.NOTE_IMAGE_PATH_INVALID)
      }
    }

    return enrichOrderForArtist(orderService.addNote(request.order.id, clamp(content, 'note')!, 'artist', imagePath || null))
  })

  /**
   * DELETE /api/artist/orders/:id/notes/:noteId
   * R46: 删除备注（系统备注拒绝，带图备注由 GC 清理）
   */
  fastify.delete('/api/artist/orders/:id/notes/:noteId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    const noteId = parseInt((request.params as { noteId: string }).noteId, 10)
    if (isNaN(noteId)) throw new AppError(E.ORDER_INVALID_ID)
    return enrichOrderForArtist(orderService.deleteNote(request.order.id, noteId))
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
          finalPriceCents: { type: 'integer', minimum: 1, maximum: MAX_MONEY_CENTS },
          quoteSnapshot: { type: ['string', 'null'], maxLength: 500 },
          // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
          version: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { finalPriceCents, quoteSnapshot, version } = request.body as { finalPriceCents: number; quoteSnapshot?: string | null; version?: number }
    // R19 + B1: 改价返回的订单统一增强（与 GET orders/:id 一致）
    return enrichOrderForArtist(orderService.updateFinalPrice(request.order.id, finalPriceCents, quoteSnapshot, version))
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
          // REQ-025 R13: done 半终态减价路径——放开负数（负增项走 refund_item 冲正条目）
          priceCents: { type: 'integer', minimum: -MAX_MONEY_CENTS, maximum: MAX_MONEY_CENTS }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    const { name, description, priceCents } = request.body as { name: string; description?: string | null; priceCents?: number }
    return enrichOrderForArtist(orderService.addExtraItem(request.order.id, { name, description, priceCents }))
  })

  /**
   * DELETE /api/artist/orders/:id/extra-items/:itemId
   * 删除附加工作项（归属校验）
   */
  fastify.delete('/api/artist/orders/:id/extra-items/:itemId', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    const itemId = parseInt((request.params as { itemId: string }).itemId, 10)
    if (isNaN(itemId)) throw new AppError(E.ORDER_INVALID_ID)
    return enrichOrderForArtist(orderService.deleteExtraItem(request.order.id, itemId))
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
          amountCents: { type: 'integer', minimum: -MAX_MONEY_CENTS, maximum: MAX_MONEY_CENTS },
          note: { type: ['string', 'null'], maxLength: 200 },
          installmentId: { type: ['integer', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { amountCents, note, installmentId } = request.body as { amountCents: number; note?: string | null; installmentId?: number | null }
    // D-2（R-9）: 收款幂等键——scope 含 orderId（跨订单不串），双标签页/脚本双击同 key
    // 只入账一笔；金额/撤销校验错误不缓存（同 key 修正后重试可成功）
    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key'])
    const result = withIdempotency(`payment:${request.order.id}`, idempotencyKey, () => {
      const payment = orderService.addPayment(request.order.id, { amountCents, note, createdBy: 'artist', installmentId: installmentId || null })
      const order = orderService.getOrder(request.order.id)
      return {
        statusCode: 200,
        body: {
          payment,
          paidTotalCents: order?.paid_total_cents ?? 0,
          finalPriceCents: order?.final_price_cents ?? order?.total_price_cents ?? null,
          installments: orderService.getOrderInstallments(request.order.id)
        }
      }
    })
    return reply.code(result.statusCode).send(result.body)
  })

  /**
   * GET /api/artist/orders/:id/payments
   * 收款流水列表
   */
  fastify.get('/api/artist/orders/:id/payments', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    return { payments: orderService.getPayments(request.order.id) }
  })

  /**
   * GET /api/artist/orders/:id/logs
   * v0.31 REQ-021 F1: 操作日志（分页 + ?type= 筛选）
   */
  fastify.get('/api/artist/orders/:id/logs', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    const { page, pageSize, type } = (request.query || {}) as { page?: string; pageSize?: string; type?: string }
    return activityLogService.getOrderLogs(request.order.id, {
      page: Math.max(1, parseInt(page ?? '', 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize ?? '', 10) || 50, 200)),
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
  }, async (request: FastifyRequest) => {
    // D-1（R-5）: 乐观锁版本（不传 = 兼容期服务层取当前版本，行为不变）
    return enrichOrderForArtist(orderService.promoteOrder(request.order.id, parseOptionalVersion(request.body)))
  })

  // ─── F1 围剿：客户追踪令牌补发 ───

  /**
   * POST /api/artist/orders/:id/regenerate-token
   * 画师补发客户追踪链接（用户拍板简化方案）：
   * 生成新令牌 → 覆盖旧哈希（旧令牌立即失效）→ 返回新明文一次。
   * 不引入明文存储/加密列——实现最简单，代价是客户旧链接失效。
   * 明文只出现在本响应（一次）；日志不得打印令牌。
   */
  fastify.post('/api/artist/orders/:id/regenerate-token', {
    preHandler: [requireAuth, requireOwnOrder]
  }, async (request: FastifyRequest) => {
    const customerToken = orderService.generateCustomerToken()
    const tokenHash = orderService.hashCustomerToken(customerToken)
    db.prepare('UPDATE orders SET customer_token_hash = ? WHERE id = ?')
      .run(tokenHash, request.order.id)
    return {
      customerToken,
      trackUrl: orderService.buildCustomerTrackUrl(
        request.artist.subdomain,
        request.order.order_no,
        customerToken
      )
    }
  })
}
