import * as styleService from './style.service.js'
import * as stylePricingService from './style-pricing.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { getArtistBySubdomain, requireVisibleArtist } from '../artist/artist.service.js'
import { isArtistHomeInvisible } from '../artist/artist-visibility.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'

// ============================================
// 多画风路由 - 增项库 / 画风 / 尺寸 / 覆盖 + 公开配置
// REQ-023 Phase 1
// ============================================

/** 限流守卫 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

/** 画风归属校验 preHandler — 校验 :id 画风属于当前画师，挂到 request.artStyle */
async function requireOwnStyle(request: FastifyRequest): Promise<void> {
  const id = parseInt((request.params as { id: string }).id, 10)
  if (isNaN(id)) throw new AppError(E.VALIDATION, 400)
  request.artStyle = styleService.getArtStyle(request.artist.id, id)
}

/** 增项模板归属校验 preHandler */
async function requireOwnTemplate(request: FastifyRequest): Promise<void> {
  const id = parseInt((request.params as { id: string }).id, 10)
  if (isNaN(id)) throw new AppError(E.VALIDATION, 400)
  request.addonTemplate = styleService.getAddonTemplate(request.artist.id, id)
}

export default async function styleRoutes(fastify: FastifyInstance) {

  // ─── 增项库（addon_templates） ───

  /** GET /api/artist/addon-templates — 增项库列表 */
  fastify.get('/api/artist/addon-templates', { preHandler: requireAuth }, async (request: FastifyRequest) => {
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
          control_type: { type: 'string', enum: ['switch', 'quantity'], default: 'switch' },
          price_mode: { type: 'string', enum: ['fixed', 'percent'], default: 'fixed' },
          // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
          default_price: { type: 'number', minimum: 0, maximum: 999999, moneyPrecision: true, default: 0 },
          unit_label: { type: ['string', 'null'], maxLength: 20 },
          // SPEC-PRICE-2：category 维度 + 数量上限
          category: { type: 'string', enum: ['add', 'usage', 'rush'], default: 'add' },
          max_quantity: { type: ['integer', 'null'], minimum: 1, maximum: 999 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return styleService.createAddonTemplate(request.artist.id, request.body as Parameters<typeof styleService.createAddonTemplate>[1])
  })

  /**
   * PUT /api/artist/addon-templates/:id — 更新增项模板
   * F0192 deprecated（仅注释，契约原样保留）：增项设置弹窗的模板价改动已并入下方 saveAddonSettings
   * 单事务端点；本端点保留——AddonTemplateManager 模板管理编辑仍依赖。
   */
  fastify.put('/api/artist/addon-templates/:id', {
    preHandler: [requireAuth, requireOwnTemplate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          control_type: { type: 'string', enum: ['switch', 'quantity'] },
          price_mode: { type: 'string', enum: ['fixed', 'percent'] },
          // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
          default_price: { type: 'number', minimum: 0, maximum: 999999, moneyPrecision: true },
          unit_label: { type: ['string', 'null'], maxLength: 20 },
          // SPEC-PRICE-2：category 维度 + 数量上限
          category: { type: 'string', enum: ['add', 'usage', 'rush'] },
          max_quantity: { type: ['integer', 'null'], minimum: 1, maximum: 999 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return styleService.updateAddonTemplate(request.artist.id, parseInt((request.params as { id: string }).id, 10), request.body as Parameters<typeof styleService.updateAddonTemplate>[2])
  })

  /** DELETE /api/artist/addon-templates/:id — 删除增项模板（级联删 style_addons 引用） */
  fastify.delete('/api/artist/addon-templates/:id', {
    preHandler: [requireAuth, requireOwnTemplate]
  }, async (request: FastifyRequest) => {
    return styleService.deleteAddonTemplate(request.artist.id, parseInt((request.params as { id: string }).id, 10))
  })

  // ─── 画风（art_styles） ───

  /** GET /api/artist/art-styles — 画风列表（含 sizes + addons 嵌套） */
  fastify.get('/api/artist/art-styles', { preHandler: requireAuth }, async (request: FastifyRequest) => {
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
  }, async (request: FastifyRequest) => {
    return styleService.createArtStyle(request.artist.id, request.body as Parameters<typeof styleService.createArtStyle>[1])
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
  }, async (request: FastifyRequest) => {
    return styleService.updateArtStyle(request.artist.id, parseInt((request.params as { id: string }).id, 10), request.body as Parameters<typeof styleService.updateArtStyle>[2])
  })

  /** DELETE /api/artist/art-styles/:id — 删除画风（级联删 sizes + style_addons + overrides） */
  fastify.delete('/api/artist/art-styles/:id', {
    preHandler: [requireAuth, requireOwnStyle]
  }, async (request: FastifyRequest) => {
    return styleService.deleteArtStyle(request.artist.id, parseInt((request.params as { id: string }).id, 10))
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
          // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
          base_price: { type: 'number', minimum: 0, maximum: 999999, moneyPrecision: true },
          // v0.37 (REQ-024 F1): 尺寸带图/描述/天数（均可选）
          image: { type: ['string', 'null'], maxLength: 500 },
          image_artwork_id: { type: ['integer', 'null'] },
          description: { type: ['string', 'null'], maxLength: 500 },
          work_days: { type: ['integer', 'null'], minimum: 1, maximum: 365 },
          // v49 (REQ-036): 尺寸三态
          display_status: { type: 'string', enum: ['available', 'showcase', 'closed'], default: 'available' },
          // v81: 该档位含 N 次免费修改（0 = 不限）
          free_revisions: { type: 'integer', minimum: 0, maximum: 99 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return styleService.createStyleSize(request.artist.id, parseInt((request.params as { id: string }).id, 10), request.body as Parameters<typeof styleService.createStyleSize>[2])
  })

  /** PUT /api/artist/art-styles/:id/sizes/:sizeId — 更新尺寸 */
  fastify.put('/api/artist/art-styles/:id/sizes/:sizeId', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
          base_price: { type: 'number', minimum: 0, maximum: 999999, moneyPrecision: true },
          sort_order: { type: 'integer', minimum: 0, maximum: 999 },
          // v0.37 (REQ-024 F1): 尺寸带图/描述/天数（image/image_artwork_id 互斥，传一清一）
          image: { type: ['string', 'null'], maxLength: 500 },
          image_artwork_id: { type: ['integer', 'null'] },
          description: { type: ['string', 'null'], maxLength: 500 },
          work_days: { type: ['integer', 'null'], minimum: 1, maximum: 365 },
          // v49 (REQ-036): 尺寸三态
          display_status: { type: 'string', enum: ['available', 'showcase', 'closed'] },
          // v81: 该档位含 N 次免费修改（0 = 不限）；只改默认值，历史订单是快照
          free_revisions: { type: 'integer', minimum: 0, maximum: 99 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return styleService.updateStyleSize(
      request.artist.id,
      parseInt((request.params as { id: string }).id, 10),
      parseInt((request.params as { sizeId: string }).sizeId, 10),
      request.body as Parameters<typeof styleService.updateStyleSize>[3]
    )
  })

  /** DELETE /api/artist/art-styles/:id/sizes/:sizeId — 删除尺寸 */
  fastify.delete('/api/artist/art-styles/:id/sizes/:sizeId', {
    preHandler: [requireAuth, requireOwnStyle]
  }, async (request: FastifyRequest) => {
    return styleService.deleteStyleSize(
      request.artist.id,
      parseInt((request.params as { id: string }).id, 10),
      parseInt((request.params as { sizeId: string }).sizeId, 10)
    )
  })

  // ─── 画风增项批量设置 ───

  /**
   * PUT /api/artist/art-styles/:id/addons — 批量设置画风增项（启用/禁用/改价）
   * F0192 deprecated（仅注释，契约原样保留）：增项设置弹窗的「一次保存」请改用 PUT .../addon-settings
   * （单事务全成全败 + 服务端同类互斥推导）；本端点保留——ArtStyleManager 拖拽/新建挂载、
   * AddonImportDialog 整体导入仍依赖其 upsert 契约。
   */
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
                // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
                price_override: { type: ['number', 'null'], minimum: 0, maximum: 999999, moneyPrecision: true }
              },
              additionalProperties: false
            },
            maxItems: 100
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return styleService.setStyleAddons(request.artist.id, parseInt((request.params as { id: string }).id, 10), (request.body as { items: Array<{ addon_template_id: number; is_enabled?: boolean; price_override?: number | null }> }).items)
  })

  /** DELETE /api/artist/art-styles/:id/addons/:saId — 移除画风增项（解绑，不动增项库） */
  fastify.delete('/api/artist/art-styles/:id/addons/:saId', {
    preHandler: [requireAuth, requireOwnStyle]
  }, async (request: FastifyRequest) => {
    return styleService.removeStyleAddon(
      request.artist.id,
      parseInt((request.params as { id: string }).id, 10),
      parseInt((request.params as { saId: string }).saId, 10)
    )
  })

  // ─── 尺寸覆盖 ───

  /**
   * GET /api/artist/art-styles/overrides — 全量尺寸覆盖（只读）
   * 画风管理页批量预载：一次拿全本画师所有画风 × 尺寸的覆盖行，替代前端 N×M 次逐对 GET。
   * 行结构与逐对端点一致，另带 style_id 便于前端按画风归并。
   */
  fastify.get('/api/artist/art-styles/overrides', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return styleService.getAllSizeOverrides(request.artist.id)
  })

  /** GET /api/artist/art-styles/:id/sizes/:sizeId/overrides — 读取尺寸覆盖列表（只读） */
  fastify.get('/api/artist/art-styles/:id/sizes/:sizeId/overrides', {
    preHandler: [requireAuth, requireOwnStyle]
  }, async (request: FastifyRequest) => {
    return styleService.getSizeOverrides(
      request.artist.id,
      parseInt((request.params as { id: string }).id, 10),
      parseInt((request.params as { sizeId: string }).sizeId, 10)
    )
  })

  /**
   * PUT /api/artist/art-styles/:id/sizes/:sizeId/overrides — 设置尺寸覆盖
   * F0192 deprecated（仅注释，契约原样保留）：增项设置弹窗的尺寸级改动已并入 saveAddonSettings；
   * 本端点保留——ArtStyleManager 拖拽到池/拖入尺寸行的单行停用-启用仍依赖。
   */
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
                // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
                price_override: { type: ['number', 'null'], minimum: 0, maximum: 999999, moneyPrecision: true },
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
  }, async (request: FastifyRequest) => {
    return styleService.setSizeOverrides(
      request.artist.id,
      parseInt((request.params as { id: string }).id, 10),
      parseInt((request.params as { sizeId: string }).sizeId, 10),
      (request.body as { items: Array<{ style_addon_id: number; price_override?: number | null; is_hidden?: boolean }> }).items
    )
  })

  // ─── F0192: 增项「一次保存」事务端点 ───

  /**
   * PUT /api/artist/art-styles/:id/addon-settings — 增项设置一次保存（单事务）
   * 模板价 → 画风价覆盖/激活（含同类互斥服务端推导）→ 尺寸覆盖合并写入，全成全败；
   * 返回聚合最新状态 { addons, sizeOverrides }。孤儿行（addon_template_id:null）带模板价时
   * 服务端跳过模板级写入并告警、不 422（拍板口径）。老前端多写路径与三老端点可长期共存。
   */
  fastify.put('/api/artist/art-styles/:id/addon-settings', {
    preHandler: [requireAuth, requireOwnStyle],
    schema: {
      body: {
        type: 'object',
        required: ['styleAddonId', 'sizeOverrides'],
        properties: {
          // F0192: 身份键 = style_addons 行 id（孤儿行 addon_template_id=null 无模板 id 可传）
          styleAddonId: { type: 'integer' },
          // P3-29: 两位小数=分精度，防 REAL 存储浮点边界（percent 整数约束由 updateAddonTemplate 兜底）
          templateDefaultPrice: { type: 'number', minimum: 0, maximum: 999999, moneyPrecision: true },
          stylePriceOverride: { type: ['number', 'null'], minimum: 0, maximum: 999999, moneyPrecision: true },
          styleEnabled: { type: 'boolean' },
          sizeOverrides: {
            type: 'array',
            // 施工图 §2：单画风尺寸数上界，防超大 payload
            maxItems: 50,
            items: {
              type: 'object',
              required: ['sizeId', 'priceOverride', 'isHidden'],
              properties: {
                sizeId: { type: 'integer' },
                // P3-29: 两位小数=分精度，防 REAL 存储浮点边界
                priceOverride: { type: ['number', 'null'], minimum: 0, maximum: 999999, moneyPrecision: true },
                isHidden: { type: 'boolean' }
              },
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return styleService.saveAddonSettings(
      request.artist.id,
      parseInt((request.params as { id: string }).id, 10),
      request.body as Parameters<typeof styleService.saveAddonSettings>[2]
    )
  })

  // ─── 客户端公开 ───

  /**
   * GET /api/public/styles/:subdomain
   * 获取画师画风+尺寸+增项完整配置（客户端三步走用）
   */
  fastify.get('/api/public/styles/:subdomain', async (request: FastifyRequest) => {
    guardRateLimit(`styles:${request.ip}`, 30, 5 * 60_000)

    const artist = getArtistBySubdomain((request.params as { subdomain: string }).subdomain)
    // v76：改用统一可见性判定（隐身 ∪ 平台下架 ∪ 封禁 ∪ 软删）→ 一律 404
    if (!artist || isArtistHomeInvisible(artist)) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return styleService.getPublicStyles(artist.id)
  })

  /**
   * GET /api/public/gallery/:subdomain
   * v0.37 (REQ-024 F6): 公开画廊数据 — 作品列表（含档位标注 size_tags + 自由描述 description）
   * + filterSizes 筛选标签（可见画风的尺寸）。二号波 2 画廊筛选/大图标签消费此端点。
   */
  fastify.get('/api/public/gallery/:subdomain', async (request: FastifyRequest) => {
    guardRateLimit(`gallery:${request.ip}`, 30, 5 * 60_000)

    const artist = getArtistBySubdomain((request.params as { subdomain: string }).subdomain)
    // v76：改用统一可见性判定（隐身 ∪ 平台下架 ∪ 封禁 ∪ 软删）→ 一律 404
    if (!artist || isArtistHomeInvisible(artist)) throw new AppError(E.ARTIST_NOT_FOUND, 404)

    return styleService.getPublicGallery(artist.id)
  })

  /**
   * POST /api/public/calculate-style-price
   * SPEC-PRICE-2 唯一算价入口：style_size_id + 增项选择（含用途/加急，各最多选一个）+ 折扣码
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
                quantity: { type: 'integer', minimum: 1, maximum: 999 }
              },
              additionalProperties: false
            },
            maxItems: 20
          },
          discountCode: { type: ['string', 'null'], maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    guardRateLimit('calc-style:' + request.ip, 30, 5 * 60_000)

    const { subdomain, styleSizeId, addons, discountCode } = request.body as { subdomain: string; styleSizeId: number; addons?: Array<{ styleAddonId: number; quantity?: number }>; discountCode?: string | null }

    // BUG-3 遗留修复：hidden/封禁画师不允许算价（对齐同文件 GET styles/gallery 的 hidden 过滤）
    const artist = requireVisibleArtist(subdomain)

    return stylePricingService.calculateStylePrice(artist.id, {
      styleSizeId,
      addons: addons || [],
      discountCode
    })
  })
}
