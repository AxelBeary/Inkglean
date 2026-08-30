import * as orderService from './order.service.js'
import * as orderWorkflowService from './order-workflow.service.js'
import * as orderGalleryService from './order-gallery.service.js'
import { assertReferenceFileExists, guardRateLimit } from './order-route-utils.js'
import { getRules, requireVisibleArtist, isArtistVisibleById } from '../artist/artist.service.js'
import { getWorkflow } from '../artist/workflow.service.js'
import { clamp } from '../../shared/validate.js'
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
          message: '下单成功！请添加画师QQ沟通细节。',
          // F1 围剿：客户访问令牌明文仅本次下发一次 + 完整追踪 URL 片段
          customerToken: order.customerToken,
          trackUrl: orderService.buildCustomerTrackUrl(artist.subdomain, order.order_no, order.customerToken)
        }
      }
    })
    return reply.code(result.statusCode).send(result.body)
  })

  /**
   * GET /api/orders/track/:orderNo
   * F1 围剿：客户凭订单号 + 高熵令牌查询进度（限流：同IP 20次/5分钟）
   * 令牌不符/缺失/订单不存在一律 404 ORDER_NOT_FOUND（不暴露订单存在性）
   * logLevel=silent：令牌明文在 query 中，禁止进入访问日志/错误日志（纪律：日志不打印令牌）
   */
  fastify.get('/api/orders/track/:orderNo', { logLevel: 'silent' }, async (request: FastifyRequest) => {
    guardRateLimit(`track:${request.ip}`, 20, 5 * 60_000)

    const { token } = (request.query || {}) as { token?: string }

    const result = orderService.getClientQueuePosition((request.params as { orderNo: string }).orderNo, token || '')
    if (!result) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const { order, position, total } = result
    // audit-a P2-7: 订单所属画师不可见（hidden/封禁/已删除）→ 按订单不存在处理，不泄露画师
    if (!isArtistVisibleById(order.artist_id)) {
      throw new AppError(E.ORDER_NOT_FOUND, 404)
    }

    // R11: 流程阶段列表 + 当前阶段（需迁移 v12 后才有真实值）
    const workflowStages = getWorkflow(order.artist_id)

    // R30d: 客户只显示当前节点名（不显示进度数字）
    // L-4（审计 三#10）: 公开追踪端无 request.artist，用订单归属作为过滤条件
    const stageInfo = orderWorkflowService.getStageInfo(order, order.artist_id)

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
      // 260830 审计 H-4：追踪页不再下发可用的交付文件直链（旧式裸签名可转发，架空一次性下载）；
      // 下载一律走下方 download-start 链路（每次签发新链接、锁定后失效）。
      // url 字段保留空串仅为前端类型兼容。
      deliverables: (order.deliverables || []).map((d: { id: number; original_name?: string | null; file_path: string }) => ({
        id: d.id,
        fileName: d.original_name,
        url: ''
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
      // L-5（审计 七#1）: 后端不再硬编码「排队中」中文绕过 i18n——只下发状态键与位次，
      // 文案由前端 TrackOrder 按键走 $t 渲染
      queueStatus: order.queue_zone === 'buffer' ? 'queued' : null,
      queuePosition: (() => {
        if (order.queue_zone !== 'buffer') return null
        const artist = db.prepare('SELECT hide_queue_position FROM artists WHERE id = ?').get(order.artist_id) as { hide_queue_position: number } | undefined
        if (artist?.hide_queue_position) return null
        // 计算缓冲区位次
        const bufferQueue = db.prepare(`
          SELECT id FROM orders WHERE artist_id = ? AND queue_zone = 'buffer' AND status NOT IN ('delivered', 'cancelled')
          ORDER BY queue_position ASC
        `).all(order.artist_id) as Array<{ id: number }>
        const pos = bufferQueue.findIndex(o => o.id === order.id) + 1
        return pos > 0 ? pos : null
      })(),
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }
  })

  /**
   * GET /api/orders/my
   * F1 围剿：退役——QQ+订单号弱双因子已由高熵令牌取代，本端点不再提供。
   * 路由保留但返回 410 + MY_ORDERS_RETIRED，文案指引使用保存的追踪链接或联系画师补发。
   */
  fastify.get('/api/orders/my', async (request: FastifyRequest) => {
    guardRateLimit(`my-orders:${request.ip}`, 10, 60_000)
    throw new AppError(E.MY_ORDERS_RETIRED, 410)
  })

  /**
   * GET /api/orders/lookup
   * F1 围剿：退役——原用途「不记得订单号时凭 QQ 查单」已被令牌链接取代
   * （持有令牌即持有完整追踪链接，含订单号），继续提供只会保留 QQ 枚举面。
   * 返回 410 + LOOKUP_RETIRED。
   */
  fastify.get('/api/orders/lookup', async (request: FastifyRequest) => {
    guardRateLimit(`lookup:${request.ip}`, 10, 5 * 60_000)
    throw new AppError(E.LOOKUP_RETIRED, 410)
  })

  /**
   * GET /api/orders/delivery/:orderNo
   * F1 围剿：交付文件下载页数据（需订单号 + 高熵令牌；不符一律 404）
   * logLevel=silent：令牌明文在 query 中，禁止进入访问日志/错误日志
   */
  fastify.get('/api/orders/delivery/:orderNo', { logLevel: 'silent' }, async (request: FastifyRequest) => {
    guardRateLimit(`delivery:${request.ip}`, 20, 5 * 60_000)

    const { token } = (request.query || {}) as { token?: string }
    const order = orderService.getClientOrderByToken(
      (request.params as { orderNo: string }).orderNo,
      token || ''
    )
    if (!order) {
      throw new AppError(E.ORDER_NOT_FOUND, 404)
    }

    return {
      orderNo: order.order_no,
      status: order.status,
      artistName: order.artist_name,
      deliverables: (order.deliverables || []).map((d: { id: number; original_name?: string | null; file_size?: number | null; file_path: string; download_locked?: number }) => ({
        id: d.id,
        fileName: d.original_name,
        fileSize: d.file_size,
        // 260830 审计 H-4：交付页下载走 download-start 链路，列表不再下发可用直链（同追踪页口径）
        url: '',
        // 815 拍板 #4：一次性下载状态（前端据此禁用下载按钮并提示联系画师再许可）
        downloadLocked: d.download_locked === 1
      }))
    }
  })

  /**
   * POST /api/orders/delivery/:orderNo/file/:fileId/download-start
   * 815 拍板 #4：客户开始下载——结算上次尝试后签发一次性下载 URL；
   * 锁定/冷却/半途防护逻辑在服务层（startDeliverableDownload）。
   * logLevel=silent：令牌明文在 query 中，禁止进日志
   */
  fastify.post('/api/orders/delivery/:orderNo/file/:fileId/download-start', { logLevel: 'silent' }, async (request: FastifyRequest) => {
    guardRateLimit(`delivery-dl:${request.ip}`, 20, 5 * 60_000)

    const { token } = (request.query || {}) as { token?: string }
    const order = orderService.getClientOrderByToken(
      (request.params as { orderNo: string }).orderNo,
      token || ''
    )
    if (!order) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const fileId = parseInt((request.params as { fileId: string }).fileId, 10)
    if (isNaN(fileId)) throw new AppError(E.ORDER_INVALID_ID)

    const { filePath, deliverableId, nonce } = orderGalleryService.startDeliverableDownload(order.id, fileId)
    // 260830 审计 H-4：一次性下载链接携带载荷（deliverableId+本次 nonce），
    // 访问层凭它对账：锁定/再许可/再次 start 后旧链接即 403。
    return { url: signedUrl(filePath, { deliverableId, nonce }) }
  })

  /**
   * POST /api/orders/delivery/:orderNo/file/:fileId/download-confirm
   * 815 拍板 #4：客户确认完整接收（web fetch 全量收到后上报）→ 锁定 + IP/时间留痕
   */
  fastify.post('/api/orders/delivery/:orderNo/file/:fileId/download-confirm', { logLevel: 'silent' }, async (request: FastifyRequest) => {
    guardRateLimit(`delivery-dl:${request.ip}`, 20, 5 * 60_000)

    const { token } = (request.query || {}) as { token?: string }
    const order = orderService.getClientOrderByToken(
      (request.params as { orderNo: string }).orderNo,
      token || ''
    )
    if (!order) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const fileId = parseInt((request.params as { fileId: string }).fileId, 10)
    if (isNaN(fileId)) throw new AppError(E.ORDER_INVALID_ID)

    orderGalleryService.confirmDeliverableDownload(order.id, fileId, request.ip)
    return { locked: true }
  })
}
