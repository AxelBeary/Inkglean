import * as styleService from './style.service.js'
import * as discountService from './discount.service.js'
import * as workflowService from '../artist/workflow.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain, requireVisibleArtist } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

// ============================================
// 价格公开路由（SPEC-PRICE-2 后：公开报价 + 折扣码）
// 旧倍率 CRUD / 旧档位算价已随 v50 迁移清退；唯一算价入口 = POST /api/public/calculate-style-price（style.routes）
// ============================================

/** 限流守卫 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/** audit-a P2-4: 折扣码过期时间——仅接受 YYYY-MM-DD 或 ISO 8601 日期时间 */
const EXPIRES_AT_PATTERN = '^(?:\\d{4}-\\d{2}-\\d{2}|\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z?)$'

export default async function pricingRoutes(fastify: FastifyInstance) {

  // ─── 客户端：公开报价（新模型：画风/尺寸/增项 + 分期比例 + 折扣开关） ───

  /**
   * GET /api/public/pricing/:subdomain
   * 获取画师完整报价（SPEC-PRICE-2：styles 含尺寸三态与增项 category，installments 为收款节点比例）
   */
  fastify.get('/api/public/pricing/:subdomain', async (request: FastifyRequest) => {
    guardRateLimit(`pricing:${request.ip}`, 30, 5 * 60_000)

    const artist = getArtistBySubdomain((request.params as { subdomain: string }).subdomain)
    if (!artist || artist.status === 'hidden' || artist.is_banned) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return {
      styles: styleService.getPublicStyles(artist.id),
      installments: workflowService.getPaymentPlan(artist.id),
      // v0.31 F3: 客户端据此决定是否显示折扣码输入框
      discountEnabled: discountService.getDiscountEnabled(artist.id)
    }
  })

  // ─── v0.31 F3: 折扣码管理（画师端） ───

  /** GET /api/artist/discount-codes — 折扣码列表 */
  fastify.get('/api/artist/discount-codes', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return {
      enabled: discountService.getDiscountEnabled(request.artist.id),
      codes: discountService.getDiscountCodes(request.artist.id)
    }
  })

  /** PUT /api/artist/discount-codes/toggle — 开关折扣码功能 */
  fastify.put('/api/artist/discount-codes/toggle', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    discountService.setDiscountEnabled(request.artist.id, (request.body as { enabled: boolean }).enabled)
    return { enabled: (request.body as { enabled: boolean }).enabled }
  })

  /** POST /api/artist/discount-codes — 创建折扣码 */
  fastify.post('/api/artist/discount-codes', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['code', 'discountValue'],
        properties: {
          code: { type: 'string', minLength: 2, maxLength: 20 },
          discountType: { type: 'string', enum: ['percent', 'fixed'], default: 'percent' },
          discountValue: { type: 'number', minimum: 0.01, maximum: 100 },
          maxUses: { type: ['integer', 'null'], minimum: 1, maximum: 99999 },
          expiresAt: { type: ['string', 'null'], maxLength: 50, pattern: EXPIRES_AT_PATTERN }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return discountService.createDiscountCode(request.artist.id, request.body as Parameters<typeof discountService.createDiscountCode>[1])
  })

  /** PUT /api/artist/discount-codes/:id — 更新折扣码 */
  fastify.put('/api/artist/discount-codes/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          discountValue: { type: 'number', minimum: 0.01, maximum: 100 },
          maxUses: { type: ['integer', 'null'], minimum: 1, maximum: 99999 },
          expiresAt: { type: ['string', 'null'], maxLength: 50, pattern: EXPIRES_AT_PATTERN },
          enabled: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return discountService.updateDiscountCode(request.artist.id, parseInt((request.params as { id: string }).id, 10), request.body as Parameters<typeof discountService.updateDiscountCode>[2])
  })

  /** DELETE /api/artist/discount-codes/:id — 删除折扣码 */
  fastify.delete('/api/artist/discount-codes/:id', {
    preHandler: requireAuth
  }, async (request: FastifyRequest) => {
    return discountService.deleteDiscountCode(request.artist.id, parseInt((request.params as { id: string }).id, 10))
  })

  // ─── 客户端：折扣码验证 ───

  /**
   * POST /api/public/validate-discount
   * 客户输入折扣码后实时验证（限流：同IP 20次/5分钟）
   */
  fastify.post('/api/public/validate-discount', {
    schema: {
      body: {
        type: 'object',
        required: ['subdomain', 'code'],
        properties: {
          subdomain: { type: 'string', minLength: 1, maxLength: 50 },
          code: { type: 'string', minLength: 1, maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    guardRateLimit(`discount:${request.ip}`, 20, 5 * 60_000)

    const { subdomain, code } = request.body as { subdomain: string; code: string }
    // BUG-3 修复：hidden 画师/管理员账号不允许验证折扣码（对照 GET pricing 范式）
    const artist = requireVisibleArtist(subdomain)

    const dc = discountService.validateDiscountCode(artist.id, code)
    return {
      valid: true,
      discountType: dc.discount_type,
      discountValue: dc.discount_value
    }
  })
}
