import { statSync } from 'fs'
import { resolve, sep } from 'path'
import * as orderService from './order.service.js'
import * as orderWorkflowService from './order-workflow.service.js'
import * as orderGalleryService from './order-gallery.service.js'
import { assertReferenceFileExists, guardRateLimit, UPLOAD_ROOT } from './order-route-utils.js'
import { getRules, requireVisibleArtist, isArtistVisibleById } from '../artist/artist.service.js'
import { getWorkflow } from '../artist/workflow.service.js'
import { clamp } from '../../shared/validate.js'
import { signedUrl } from '../../shared/file-sign.js'
import { AppError, E } from '../../shared/errors.js'
import { withIdempotency, readIdempotencyKey } from '../../shared/idempotency.js'
import { resolveAnonToken } from '../tracking/tracking.service.js'
import db from '../../db/connection.js'
import type { OrderDetail } from '../../types/entities.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 订单路由 - 客户端公开端点子插件（从 order.routes.ts 拆出）
// ============================================

const DELIVERABLE_ROOT = resolve(UPLOAD_ROOT, 'deliverables') + sep

/** 历史订单只列出实际还在的交付文件；路径来自本单的交付记录。 */
function isStoredDeliverable({ file_path }: { file_path: string }): boolean {
  if (!file_path.startsWith('deliverables/')) return false
  const absolutePath = resolve(UPLOAD_ROOT, file_path)
  if (!absolutePath.startsWith(DELIVERABLE_ROOT)) return false
  try {
    return statSync(absolutePath).isFile()
  } catch {
    return false
  }
}

/** 已验证令牌的订单：画师可见时不加限制，不可见时仅允许有净实收的既有交付。 */
function requireClientDeliveryAccess(order: OrderDetail | null) {
  if (!order) throw new AppError(E.ORDER_NOT_FOUND, 404)
  const deliveryOnly = !isArtistVisibleById(order.artist_id)
  const deliverables = order.deliverables ?? []
  if (deliveryOnly && !(order.status === 'delivered' && order.paid_total_cents > 0 && deliverables.length > 0)) {
    throw new AppError(E.ORDER_NOT_FOUND, 404)
  }
  return { order, deliveryOnly, deliverables }
}

function requireDeliveryOrder(request: FastifyRequest) {
  const { token } = (request.query || {}) as { token?: string }
  const { orderNo } = request.params as { orderNo: string }
  return requireClientDeliveryAccess(orderService.getClientOrderByToken(orderNo, token))
}

function requireDeliveryFile(request: FastifyRequest) {
  const { order, deliveryOnly, deliverables } = requireDeliveryOrder(request)
  const fileId = parseInt((request.params as { fileId: string }).fileId, 10)
  if (isNaN(fileId)) throw new AppError(E.ORDER_INVALID_ID)
  if (deliveryOnly && !deliverables.some(file => file.id === fileId && isStoredDeliverable(file))) {
    throw new AppError(E.ORDER_NOT_FOUND, 404)
  }
  return { orderId: order.id, fileId }
}

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
    }, {
      // 审计 #21 条目 3: 指纹只覆盖下单业务内容（画风/尺寸/增项/文案/折扣码/参考图），
      // 不含 anonId 凭证——同一意图换凭证轮转不该被判成冲突
      styleSizeId: styleSizeId || null,
      styleAddons: styleAddons || [],
      description: clamp(description, 'description'),
      clientName: clamp(clientName, 'name'),
      priority: priority || 'medium',
      clientNotify: clientNotify || false,
      references: references || [],
      discountCode: discountCode || null
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
    const { deliveryOnly, deliverables } = requireClientDeliveryAccess(order)
    if (deliveryOnly) {
      if (!deliverables.some(isStoredDeliverable)) throw new AppError(E.ORDER_NOT_FOUND, 404)
      return { orderNo: order.order_no, deliveryOnly: true }
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
      // v81: 过程稿（订单级开关关 → 一律 []；单图 visible=0 只在画师侧可见）
      previews: orderGalleryService.getClientPreviews(order.id),
      // v81: 免费修改次数（limit=0 → 不限，remaining=null，客户侧不显示配额徽标）
      revisionQuota: orderGalleryService.getRevisionQuota(order),
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
   * POST /api/orders/track/:orderNo/refresh-signatures
   * 查单页停留续签（客户侧对应画师端 POST /api/artist/refresh-signatures）
   * 背景：签名 TTL 5 分钟（file-sign.ts FILE_TTL_MS = 5 * 60_000），而查单页只在 onMounted 取一次数据——
   * 客户停留超过 5 分钟后参考图与过程稿全部 403。前端每 3 分钟 + 回到前台时调本端点续签。
   * 鉴权/限流/画师可见性口径照抄上面的 track 路由；logLevel=silent：令牌在 body 里同样禁止进日志。
   * 路径不属于本单一律 ILLEGAL_PATH（不按「订单不存在/无权」分码，避免被用来探测订单存在性）。
   */
  fastify.post('/api/orders/track/:orderNo/refresh-signatures', {
    logLevel: 'silent',
    schema: {
      body: {
        type: 'object',
        required: ['token', 'paths'],
        properties: {
          token: { type: 'string' },
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
    guardRateLimit(`refresh-sig-track:${request.ip}`, 20, 5 * 60_000)

    const { token, paths } = request.body as { token: string; paths: string[] }
    const result = orderService.getClientQueuePosition((request.params as { orderNo: string }).orderNo, token)
    if (!result) throw new AppError(E.ORDER_NOT_FOUND, 404)

    const { order } = result
    // audit-a P2-7 同款：订单所属画师不可见（hidden/封禁/已删除）→ 按订单不存在处理，不泄露画师
    if (!isArtistVisibleById(order.artist_id)) {
      throw new AppError(E.ORDER_NOT_FOUND, 404)
    }

    // 路径归属校验（核心，不许省）：只给本单自己的图续签。
    // 参考图加 source='client' 是因为 track 本就只下发客户信源那一份——画师自用的私有参考图
    // 不该被客户凭路径换来签名；过程稿那两个附加条件则是**刻意的安全要点**：
    // 单图 visible=1 且订单级 preview_visible_to_client=1 必须同时成立，
    // 画师关掉「允许客户查看过程稿」后，已发出的预览 URL 不能靠本接口继续续命。
    const refOwned = db.prepare(
      "SELECT 1 FROM order_references WHERE file_path = ? AND order_id = ? AND source = 'client' LIMIT 1"
    )
    const previewOwned = db.prepare(
      `SELECT 1 FROM order_previews p
         JOIN orders o ON o.id = p.order_id
        WHERE p.file_path = ? AND p.order_id = ? AND p.visible = 1 AND o.preview_visible_to_client = 1
        LIMIT 1`
    )

    // 逐条判定，**不做整批原子**：需要续签的路径里只要有一条已失效（画师刚关掉
    // 「允许客户查看过程稿」、刚删了某张图、或刚把单图设为不可见），整批 400 会让
    // 同一页面上其它仍然有效的图（尤其参考图）一起停止续签——那些图 5 分钟后 403
    // 且永不自愈（前端一失败即停，见 useSignatureRefresh 的分片中断语义）。
    // 故失效路径**静默略过**：不返回它的 URL 即等于不续签，不泄露任何额外信息；
    // 只有 '..' 这种明确的攻击特征仍然整批拒绝。
    const urls: Record<string, string> = {}
    const skipped: string[] = []
    for (const p of paths) {
      if (p.includes('..')) throw new AppError(E.ILLEGAL_PATH)
      if (!refOwned.get(p, order.id) && !previewOwned.get(p, order.id)) {
        skipped.push(p)
        continue
      }
      // previews/ 与 references/ 都是普通签名目录（交付物的一次性载荷不适用）
      urls[p] = signedUrl(p)
    }

    // skipped 只回显调用方自己传来的路径，不含任何库内信息
    return skipped.length > 0 ? { urls, skipped } : { urls }
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

    const { order, deliveryOnly, deliverables } = requireDeliveryOrder(request)
    const files = deliveryOnly ? deliverables.filter(isStoredDeliverable) : deliverables
    if (deliveryOnly && files.length === 0) throw new AppError(E.ORDER_NOT_FOUND, 404)

    return {
      orderNo: order.order_no,
      status: order.status,
      artistName: order.artist_name,
      ...(deliveryOnly ? { deliveryOnly: true } : {}),
      deliverables: files.map((d: { id: number; original_name?: string | null; file_size?: number | null; file_path: string; download_locked?: number }) => ({
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

    const { orderId, fileId } = requireDeliveryFile(request)
    const { filePath, deliverableId, nonce } = orderGalleryService.startDeliverableDownload(orderId, fileId)
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

    const { orderId, fileId } = requireDeliveryFile(request)
    orderGalleryService.confirmDeliverableDownload(orderId, fileId, request.ip)
    return { locked: true }
  })
}
