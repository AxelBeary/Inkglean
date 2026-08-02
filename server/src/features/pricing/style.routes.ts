import * as styleService from './style.service.js'
import * as stylePricingService from './style-pricing.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'

// ============================================
// 多画风路由 - 增项库 / 画风 / 尺寸 / 覆盖 + 公开配置
// REQ-023 Phase 1
// ============================================

/** 限流守卫 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/** 画风归属校验 preHandler — 校验 :id 画风属于当前画师，挂到 request.artStyle */
async function requireOwnStyle(request: any): Promise<void> {
  const id = parseInt(request.params.id, 10)
  if (isNaN(id)) throw new AppError(E.VALIDATION, 400)
  request.artStyle = styleService.getArtStyle(request.artist.id, id)
}

/** 增项模板归属校验 preHandler */
async function requireOwnTemplate(request: any): Promise<void> {
  const id = parseInt(request.params.id, 10)
  if (isNaN(id)) throw new AppError(E.VALIDATION, 400)
  request.addonTemplate = styleService.getAddonTemplate(request.artist.id, id)
}

export default async function styleRoutes(fastify: any) {

  // ─── 增项库（addon_templates） ───

  /** GET /api/artist/addon-templates — 增项库列表 */
  fastify.get('/api/artist/addon-templates', { preHandler: requireAuth }, async (request: any) => {
    return styleService.getAddonTemplates(request.artist.id)
  })

  /** POST /api/artist/addon-templates — 新建增项模板 */
  fastify.post('/api/artist/addon-templates', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          control_type: { type: 'string', enum: ['switch', 'quantity', 'radio'], default: 'switch' },
          pricing_mode: { type: 'string', enum: ['fixed', 'per_unit', 'per_option'], default: 'fixed' },
          default_price: { type: 'number', minimum: 0, maximum: 999999, default: 0 },
          options: { type: ['string', 'null'], maxLength: 2000 },
          unit_label: { type: ['string', 'null'], maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.createAddonTemplate(request.artist.id, request.body)
  })

  /** PUT /api/artist/addon-templates/:id — 更新增项模板 */
  fastify.put('/api/artist/addon-templates/:id', {
    preHandler: [requireAuth, requireOwnTemplate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          control_type: { type: 'string', enum: ['switch', 'quantity', 'radio'] },
          pricing_mode: { type: 'string', enum: ['fixed', 'per_unit', 'per_option'] },
          default_price: { type: 'number', minimum: 0, maximum: 999999 },
          options: { type: ['string', 'null'], maxLength: 2000 },
          unit_label: { type: ['string', 'null'], maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.updateAddonTemplate(request.artist.id, parseInt(request.params.id, 10), request.body)
  })

  /** DELETE /api/artist/addon-templates/:id — 删除增项模板（级联删 style_addons 引用） */
  fastify.delete('/api/artist/addon-templates/:id', {
    preHandler: [requireAuth, requireOwnTemplate]
  }, async (request: any) => {
    return styleService.deleteAddonTemplate(request.artist.id, parseInt(request.params.id, 10))
  })

  // ─── 画风（art_styles） ───

  /** GET /api/artist/art-styles — 画风列表（含 sizes + addons 嵌套） */
  fastify.get('/api/artist/art-styles', { preHandler: requireAuth }, async (request: any) => {
    return styleService.getArtStyles(request.artist.id)
  })

  /** POST /api/artist/art-styles — 新建画风（可选 importAddons 从增项库一键导入） */
  fastify.post('/api/artist/art-styles', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: ['string', 'null'], maxLength: 500 },
          cover_image: { type: ['string', 'null'], maxLength: 500 },
          importAddons: { type: 'boolean', default: false }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.createArtStyle(request.artist.id, request.body)
  })

  /** PUT /api/artist/art-styles/:id — 更新画风 */
  fastify.put('/api/artist/art-styles/:id', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: ['string', 'null'], maxLength: 500 },
          cover_image: { type: ['string', 'null'], maxLength: 500 },
          sort_order: { type: 'integer', minimum: 0, maximum: 999 },
          is_active: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.updateArtStyle(request.artist.id, parseInt(request.params.id, 10), request.body)
  })

  /** DELETE /api/artist/art-styles/:id — 删除画风（级联删 sizes + style_addons + overrides） */
  fastify.delete('/api/artist/art-styles/:id', {
    preHandler: [requireAuth, requireOwnStyle]
  }, async (request: any) => {
    return styleService.deleteArtStyle(request.artist.id, parseInt(request.params.id, 10))
  })

  // ─── 尺寸（style_sizes） ───

  /** POST /api/artist/art-styles/:id/sizes — 添加尺寸 */
  fastify.post('/api/artist/art-styles/:id/sizes', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'base_price'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          base_price: { type: 'number', minimum: 0, maximum: 999999 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.createStyleSize(request.artist.id, parseInt(request.params.id, 10), request.body)
  })

  /** PUT /api/artist/art-styles/:id/sizes/:sizeId — 更新尺寸 */
  fastify.put('/api/artist/art-styles/:id/sizes/:sizeId', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          base_price: { type: 'number', minimum: 0, maximum: 999999 },
          sort_order: { type: 'integer', minimum: 0, maximum: 999 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.updateStyleSize(
      request.artist.id,
      parseInt(request.params.id, 10),
      parseInt(request.params.sizeId, 10),
      request.body
    )
  })

  /** DELETE /api/artist/art-styles/:id/sizes/:sizeId — 删除尺寸 */
  fastify.delete('/api/artist/art-styles/:id/sizes/:sizeId', {
    preHandler: [requireAuth, requireOwnStyle]
  }, async (request: any) => {
    return styleService.deleteStyleSize(
      request.artist.id,
      parseInt(request.params.id, 10),
      parseInt(request.params.sizeId, 10)
    )
  })

  // ─── 画风增项批量设置 ───

  /** PUT /api/artist/art-styles/:id/addons — 批量设置画风增项（启用/禁用/改价） */
  fastify.put('/api/artist/art-styles/:id/addons', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['addon_template_id'],
              properties: {
                addon_template_id: { type: 'integer' },
                is_enabled: { type: 'boolean' },
                price_override: { type: ['number', 'null'], minimum: 0, maximum: 999999 },
                options_override: { type: ['string', 'null'], maxLength: 2000 }
              },
              additionalProperties: false
            },
            maxItems: 100
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.setStyleAddons(request.artist.id, parseInt(request.params.id, 10), (request.body as any).items)
  })

  // ─── 尺寸覆盖 ───

  /** PUT /api/artist/art-styles/:id/sizes/:sizeId/overrides — 设置尺寸覆盖 */
  fastify.put('/api/artist/art-styles/:id/sizes/:sizeId/overrides', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['style_addon_id'],
              properties: {
                style_addon_id: { type: 'integer' },
                price_override: { type: ['number', 'null'], minimum: 0, maximum: 999999 },
                is_hidden: { type: 'boolean' }
              },
              additionalProperties: false
            },
            maxItems: 100
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    return styleService.setSizeOverrides(
      request.artist.id,
      parseInt(request.params.id, 10),
      parseInt(request.params.sizeId, 10),
      (request.body as any).items
    )
  })

  // ─── 客户端公开 ───

  /**
   * GET /api/public/styles/:subdomain
   * 获取画师画风+尺寸+增项完整配置（客户端三步走用）
   */
  fastify.get('/api/public/styles/:subdomain', async (request: any) => {
    guardRateLimit(`styles:${request.ip}`, 30, 5 * 60_000)

    const artist = getArtistBySubdomain(request.params.subdomain) as any
    if (!artist || artist.status === 'hidden') throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return styleService.getPublicStyles(artist.id)
  })

  /**
   * POST /api/public/calculate-style-price
   * 多画风价格计算（基于 style_size_id + 增项 + 倍率 + 折扣码）
   * 限流：同IP 30次/5分钟
   */
  fastify.post('/api/public/calculate-style-price', {
    schema: {
      body: {
        type: 'object',
        required: ['subdomain', 'styleSizeId'],
        properties: {
          subdomain: { type: 'string', minLength: 1, maxLength: 50 },
          styleSizeId: { type: 'integer' },
          addons: {
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
          },
          usageMultiplierId: { type: ['integer', 'null'] },
          rushMultiplierId: { type: ['integer', 'null'] },
          discountCode: { type: ['string', 'null'], maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: any) => {
    guardRateLimit('calc-style:' + request.ip, 30, 5 * 60_000)

    const { subdomain, styleSizeId, addons, usageMultiplierId, rushMultiplierId, discountCode } = request.body as any

    const artist = getArtistBySubdomain(subdomain) as any
    if (!artist) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId,
      addons: addons || [],
      usageMultiplierId,
      rushMultiplierId,
      discountCode
    })
  })
}
