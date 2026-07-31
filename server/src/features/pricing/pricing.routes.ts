import * as pricingService from './pricing.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 价格计算器路由 - 增项/倍率 CRUD + 公开计算
// ============================================

/** 限流守卫 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/** 增项归属校验 preHandler */
async function requireOwnAddon(request: any): Promise<void> {
  const id = parseInt(request.params.id, 10)
  if (isNaN(id)) throw new AppError(E.VALIDATION, 400)
  request.addon = pricingService.getAddon(request.artist.id, id)
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

  // ─── 画师后台：增项管理 ───

  fastify.get('/api/artist/addons', { preHandler: requireAuth }, async (request: any) => {
    return pricingService.getAddons(request.artist.id)
  })

  fastify.post('/api/artist/addons', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['category', 'name', 'priceValue'],
        properties: {
          category: { type: 'string', enum: ['expression', 'outfit', 'background', 'weapon', 'other'] },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          priceType: { type: 'string', enum: ['fixed', 'percent'], default: 'fixed' },
          priceValue: { type: 'number', minimum: 0, maximum: 100000 },
          selectMode: { type: 'string', enum: ['quantity', 'toggle', 'inquiry'], default: 'quantity' },
          maxQty: { type: 'integer', minimum: 1, maximum: 99, default: 5 },
          description: { type: ['string', 'null'], maxLength: 200 },
          tierIds: { type: 'array', items: { type: 'integer' }, maxItems: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return pricingService.createAddon(request.artist.id, request.body)
  })

  fastify.put('/api/artist/addons/:id', {
    preHandler: [requireAuth, requireOwnAddon],
    schema: {
      body: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['expression', 'outfit', 'background', 'weapon', 'other'] },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          priceType: { type: 'string', enum: ['fixed', 'percent'] },
          priceValue: { type: 'number', minimum: 0, maximum: 100000 },
          selectMode: { type: 'string', enum: ['quantity', 'toggle', 'inquiry'] },
          maxQty: { type: 'integer', minimum: 1, maximum: 99 },
          description: { type: ['string', 'null'], maxLength: 200 },
          enabled: { type: 'boolean' },
          tierIds: { type: 'array', items: { type: 'integer' }, maxItems: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return pricingService.updateAddon(request.artist.id, parseInt(request.params.id, 10), request.body)
  })

  fastify.delete('/api/artist/addons/:id', {
    preHandler: [requireAuth, requireOwnAddon]
  }, async (request: any) => {
    return pricingService.deleteAddon(request.artist.id, parseInt(request.params.id, 10))
  })

  fastify.put('/api/artist/addons/reorder', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['orderedIds'],
        properties: {
          orderedIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 100 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return pricingService.reorderAddons(request.artist.id, (request.body as any).orderedIds)
  })

  fastify.put('/api/artist/addons/:id/tiers', {
    preHandler: [requireAuth, requireOwnAddon],
    schema: {
      body: {
        type: 'object',
        required: ['tierIds'],
        properties: {
          tierIds: { type: 'array', items: { type: 'integer' }, maxItems: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return pricingService.updateAddonTiers(request.artist.id, parseInt(request.params.id, 10), (request.body as any).tierIds)
  })

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
  }, async (request: any) => {
    guardRateLimit(`calc:${request.ip}`, 30, 5 * 60_000)

    const { subdomain, tierId, addons, usageMultiplierId, rushMultiplierId } = request.body as any

    const artist = getArtistBySubdomain(subdomain) as any
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return pricingService.calculatePrice(artist.id, {
      tierId,
      addons: addons || [],
      usageMultiplierId,
      rushMultiplierId
    })
  })
}
