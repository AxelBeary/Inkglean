import * as orderService from './order.service.js'
import * as orderWorkflowService from './order-workflow.service.js'
import { assertReferenceFileExists, guardRateLimit } from './order-route-utils.js'
import { getRules, requireVisibleArtist, isArtistVisibleById } from '../artist/artist.service.js'
import { getWorkflow } from '../artist/workflow.service.js'
import { clamp, isValidQq } from '../../shared/validate.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'
import { withIdempotency, readIdempotencyKey } from '../../shared/idempotency.js'
import { resolveAnonToken } from '../tracking/tracking.service.js'
import db from '../../db/connection.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 订单路由 - 客户端公开端点子插件（从 order.routes.ts 拆出）
// ============================================

export async function orderClientRoutes(fastify: FastifyInstance) {

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
          clientQq: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          clientName: { type: ['string', 'null'], maxLength: 50 },
          description: { type: ['string', 'null'], maxLength: 2000 },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          clientNotify: { type: 'boolean' },
          agreeRules: { type: 'boolean' },
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
    guardRateLimit(`order-create:${request.ip}`, 10, 10 * 60_000)

    const { subdomain, clientQq, clientName, description, priority, clientNotify, agreeRules, references, discountCode, styleSizeId, styleAddons } = request.body as { subdomain: string; clientQq: string; clientName?: string | null; description?: string | null; priority?: string; clientNotify?: boolean; agreeRules: boolean; references?: string[]; discountCode?: string | null; styleSizeId?: number | null; styleAddons?: Array<{ styleAddonId: number; quantity?: number }> }
    const qq = clamp(clientQq, 'qq')!

    // audit-a P2-7: hidden/封禁/不存在统一 404，不泄露存在性
    const artist = requireVisibleArtist(subdomain)
    if (artist.status !== 'open') throw new AppError(E.ARTIST_NOT_OPEN)

    // 仅当画师设置了非空须知时，才要求客户勾选同意
    const rules = getRules(artist.id)
    if (rules?.content && !agreeRules) throw new AppError(E.RULES_NOT_AGREED)

    // C-3 + P2-12：参考图路径校验 — references/ 目录 + 拒绝穿越 + 文件真实存在
    if (references) {
      for (const ref of references) {
        assertReferenceFileExists(ref)
      }
    }

    // F-10（P2-13 后端侧）: 参考图归属凭据——references 非空时要求 x-anon-token，
    // 校验/绑定由 createOrder 事务内完成；缺失/无效一律 ILLEGAL_PATH（不泄露归属细节）
    let anonId: number | null = null
    if (references && references.length > 0) {
      const anonToken = request.headers['x-anon-token']
      anonId = typeof anonToken === 'string' ? resolveAnonToken(anonToken) : null
      if (anonId == null) {
        throw new AppError(E.ILLEGAL_PATH, 400)
      }
    }

    // D-2（R-9）: 下单幂等键——scope 含画师身份 + 客户 QQ（防跨画师/跨客户串 key），
    // 双标签页/慢渲染双击同 key 只落一单；错误（校验/下单失败）不缓存，允许重试
    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key'])
    const result = withIdempotency(`orders:${artist.id}:${qq}`, idempotencyKey, () => {
      const order = orderService.createOrder({
        artistId: artist.id,
        clientQq: qq,
        clientName: clamp(clientName, 'name'),
        description: clamp(description, 'description'),
        priority: priority || 'medium',
        source: 'self',
        clientNotify: clientNotify || false,
        references: references || [],
        discountCode: discountCode || null,
        styleSizeId: styleSizeId || null,
        styleAddons: styleAddons || [],
        anonId
      })
      return {
        statusCode: 200,
        body: {
          orderNo: order.order_no,
          totalPriceCents: order.total_price_cents,
          message: '下单成功！请添加画师QQ沟通细节。'
        }
      }
    })
    return reply.code(result.statusCode).send(result.body)
  })

  /**
   * GET /api/orders/track/:orderNo
   * 客户凭订单号 + QQ号查询进度（限流：同IP 20次/5分钟）
   */
  fastify.get('/api/orders/track/:orderNo', async (request: FastifyRequest) => {
    guardRateLimit(`track:${request.ip}`, 20, 5 * 60_000)

    const { qq } = (request.query || {}) as { qq?: string }
    if (!qq) throw new AppError(E.QQ_REQUIRED)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const result = orderService.getClientQueuePosition((request.params as { orderNo: string }).orderNo, qq)
    if (!result) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const { order, position, total } = result
    // audit-a P2-7: 订单所属画师不可见（hidden/封禁/已删除）→ 按订单不存在处理，不泄露画师
    if (!isArtistVisibleById(order.artist_id)) {
      throw new AppError(E.ORDER_NOT_FOUND, 404)
    }

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
      description: result.description,
      references: (result.references || []).map((r: { file_path: string; original_name?: string | null }) => ({
        url: signedUrl(r.file_path),
        originalName: r.original_name
      })),
      position,
      total,
      workflowStages,
      currentStageId: order.current_stage_id ?? null,
      currentStageName: stageInfo?.currentStageName ?? null,
      deliverables: (order.deliverables || []).map((d: { id: number; original_name?: string | null; file_path: string }) => ({
        id: d.id,
        fileName: d.original_name,
        url: signedUrl(d.file_path)
      })),
      // SPEC-003 §5.5: 客户可见附加项（仅 name + priceCents）+ 最终价格 + 付款节点
      extraItems: (order.extraItems || []).map((item: { name: string; price_cents: number }) => ({
        name: item.name,
        priceCents: item.price_cents
      })),
      finalPriceCents: order.final_price_cents ?? null,
      paidTotalCents: order.paid_total_cents ?? 0,
      installments: orderService.getOrderInstallments(order.id),
      // 收款明细（客户可见：金额/备注/时间，负数=退款）
      payments: orderService.getOrderPayments(order.id),
      // 截稿日（无则 null）
      deadline: order.deadline ?? null,
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
    fastify.get('/api/orders/my', async (request: FastifyRequest) => {
      guardRateLimit(`my-orders:${request.ip}`, 10, 60_000)

    const { subdomain, qq } = (request.query || {}) as { subdomain?: string; qq?: string }
    if (!subdomain || !qq) throw new AppError(E.MISSING_PARAMS)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    // audit-a P2-7: 与 lookup/track 同口径——hidden/封禁/不存在统一 404
    const artist = requireVisibleArtist(subdomain)

    const orders = orderService.getClientOrdersByQq(artist.id, qq)
    return orders.map((o: { order_no: string; status: string; tier_name: string | null; created_at: string }) => ({
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
  fastify.get('/api/orders/lookup', async (request: FastifyRequest) => {
    guardRateLimit(`lookup:${request.ip}`, 10, 5 * 60_000)

    const { subdomain, qq } = (request.query || {}) as { subdomain?: string; qq?: string }
    if (!subdomain || !qq) throw new AppError(E.MISSING_PARAMS)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    // audit-a P2-7: 与 my/track 同口径——hidden/封禁/不存在统一 404
    const artist = requireVisibleArtist(subdomain)

    const hasOrders = orderService.hasClientOrders(artist.id, qq)
    if (!hasOrders) {
      return { hasOrders: false }
    }

    return {
      hasOrders: true,
      // P3-14: 与公开主页同口径——不兜底登录账号 QQ（lookup 也是公开接口）
      contactQq: artist.contact_qq || null,
      adminQq: orderService.getPlatformConfig('admin_qq'),
      artistName: artist.name
    }
  })

  /**
   * GET /api/orders/delivery/:orderNo
   * 交付文件下载页数据（需 QQ 验证）
   */
  fastify.get('/api/orders/delivery/:orderNo', async (request: FastifyRequest) => {
    guardRateLimit(`delivery:${request.ip}`, 20, 5 * 60_000)

    const { qq } = (request.query || {}) as { qq?: string }
    if (!qq) throw new AppError(E.QQ_REQUIRED)
    if (!isValidQq(qq)) throw new AppError(E.QQ_FORMAT)

    const order = orderService.getOrderByNo((request.params as { orderNo: string }).orderNo)
    if (!order || order.client_qq !== qq) {
      throw new AppError(E.ORDER_NOT_FOUND, 404)
    }

    return {
      orderNo: order.order_no,
      status: order.status,
      artistName: order.artist_name,
      deliverables: (order.deliverables || []).map((d: { id: number; original_name?: string | null; file_size?: number | null; file_path: string }) => ({
        id: d.id,
        fileName: d.original_name,
        fileSize: d.file_size,
        url: signedUrl(d.file_path)
      }))
    }
  })
}
