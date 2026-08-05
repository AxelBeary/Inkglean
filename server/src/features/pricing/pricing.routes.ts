import * as pricingService from './pricing.service.js'
import * as discountService from './discount.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain, requireVisibleArtist } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 价格计算器路由 - 增项/倍率 CRUD + 公开计算
// ============================================

/** 限流守卫 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/** 倍率归属校验 preHandler */
async function requireOwnMultiplier(request: any): Promise<void> {
  const id = parseInt(request.params.id, 10)
  if (isNaN(id)) throw new AppError(E.VALIDATION, 400)
  // getMultipliers 返回全部，手动查找
  const m = pricingService.getMultipliers(request.artist.id).find((x: any) => x.id === id)
  if (!m) throw new AppError(E.MULTIPLIER_NOT_FOUND, 404)
  request.multiplier = m
}

export default async function pricingRoutes(fastify: any) {

  // ─── 画师后台：倍率管理 ───

  fastify.get('/api/artist/multipliers', { preHandler: requireAuth }, async (request: any) => {
    return pricingService.getMultipliers(request.artist.id)
  })

  fastify.post('/api/artist/multipliers', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['type', 'name', 'multiplier'],
        properties: {
          type: { type: 'string', enum: ['usage', 'rush'] },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          multiplier: { type: 'number', minimum: 1.0, maximum: 100 },
          description: { type: ['string', 'null'], maxLength: 200 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return pricingService.createMultiplier(request.artist.id, request.body)
  })

  fastify.put('/api/artist/multipliers/:id', {
    preHandler: [requireAuth, requireOwnMultiplier],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          multiplier: { type: 'number', minimum: 1.0, maximum: 100 },
          description: { type: ['string', 'null'], maxLength: 200 },
          enabled: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return pricingService.updateMultiplier(request.artist.id, parseInt(request.params.id, 10), request.body)
  })

  fastify.delete('/api/artist/multipliers/:id', {
    preHandler: [requireAuth, requireOwnMultiplier]
  }, async (request: any) => {
    return pricingService.deleteMultiplier(request.artist.id, parseInt(request.params.id, 10))
  })

  // ─── 客户端：公开报价 + 计算 ───

  /**
   * GET /api/public/pricing/:subdomain
   * 获取画师完整报价（档位+增项+倍率+分期比例）
   */
  fastify.get('/api/public/pricing/:subdomain', async (request: any) => {
    guardRateLimit(`pricing:${request.ip}`, 30, 5 * 60_000)

    const artist = getArtistBySubdomain(request.params.subdomain) as any
    if (!artist || artist.status === 'hidden') throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return pricingService.getPublicPricing(artist.id)
  })

  /**
   * POST /api/public/calculate-price
   * 无状态价格计算（限流：同IP 30次/5分钟）
   */
  fastify.post('/api/public/calculate-price', {
    schema: {
      body: {
        type: 'object',
        required: ['subdomain', 'tierId'],
        properties: {
          subdomain: { type: 'string', minLength: 1, maxLength: 50 },
          tierId: { type: 'integer' },
          usageMultiplierId: { type: ['integer', 'null'] },
          rushMultiplierId: { type: ['integer', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    guardRateLimit(`calc:${request.ip}`, 30, 5 * 60_000)

    const { subdomain, tierId, usageMultiplierId, rushMultiplierId } = request.body as any

    // BUG-3 修复：hidden 画师/管理员账号不允许算价（对照 GET pricing 范式）
    const artist = requireVisibleArtist(subdomain)

    return pricingService.calculatePrice(artist.id, {
      tierId,
      usageMultiplierId,
      rushMultiplierId
    })
  })

  // ─── v0.31 F3: 折扣码管理（画师端） ───

  /** GET /api/artist/discount-codes — 折扣码列表 */
  fastify.get('/api/artist/discount-codes', { preHandler: requireAuth }, async (request: any) => {
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
  }, async (request: any) => {
    discountService.setDiscountEnabled(request.artist.id, (request.body as any).enabled)
    return { enabled: (request.body as any).enabled }
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
          expiresAt: { type: ['string', 'null'], maxLength: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return discountService.createDiscountCode(request.artist.id, request.body)
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
          expiresAt: { type: ['string', 'null'], maxLength: 50 },
          enabled: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return discountService.updateDiscountCode(request.artist.id, parseInt(request.params.id, 10), request.body)
  })

  /** DELETE /api/artist/discount-codes/:id — 删除折扣码 */
  fastify.delete('/api/artist/discount-codes/:id', {
    preHandler: requireAuth
  }, async (request: any) => {
    return discountService.deleteDiscountCode(request.artist.id, parseInt(request.params.id, 10))
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
  }, async (request: any) => {
    guardRateLimit(`discount:${request.ip}`, 20, 5 * 60_000)

    const { subdomain, code } = request.body as any
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
