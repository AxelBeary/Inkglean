import * as artistService from './artist.service.js'
import { requireAuth, getAdminQq } from '../../shared/middleware/auth.js'
import { clamp } from '../../shared/validate.js'

// ============================================
// 画师路由 - 公开主页 + 后台管理
// ============================================

export default async function artistRoutes(fastify) {

  // ─── 公开接口（客户端） ───

  /**
   * GET /api/artists
   * 获取所有画师公开信息（首页列表，排除管理员账号）
   */
  fastify.get('/api/artists', async () => {
    return artistService.getAllArtists()
      .filter(a => a.qq_number !== getAdminQq())
      .map(a => ({
        id: a.id, name: a.name, subdomain: a.subdomain,
        avatar: a.avatar, bio: a.bio, status: a.status,
        weiboUrl: a.weibo_url, bilibiliUrl: a.bilibili_url,
        customLinks: artistService.getCustomLinks(a)
      }))
  })

  /**
   * GET /api/artists/:subdomain
   * 获取画师公开主页信息（作品、价格、状态、须知）
   */
  fastify.get('/api/artists/:subdomain', async (request, reply) => {
    const artist = artistService.getArtistBySubdomain(request.params.subdomain)
    if (!artist || artist.qq_number === getAdminQq()) return reply.code(404).send({ error: '画师不存在' })

    const tiers = artistService.getTiers(artist.id)
    const artworks = artistService.getArtworks(artist.id)
    const rules = artistService.getRules(artist.id)

    return {
      id: artist.id,
      name: artist.name,
      subdomain: artist.subdomain,
      avatar: artist.avatar,
      bio: artist.bio,
      status: artist.status,
      templateId: artist.template_id || 'default',
      paletteId: artist.palette_id || 'paper',
      weiboUrl: artist.weibo_url,
      bilibiliUrl: artist.bilibili_url,
      customLinks: artistService.getCustomLinks(artist),
      notifyEnabled: !!artist.notify_enabled,
      contactQq: artist.contact_qq || artist.qq_number,
      revisionNote: artist.revision_note || null,
      tiers,
      artworks,
      rules: rules?.content || ''
    }
  })

  // ─── 画师后台接口（需登录） ───

  /**
   * GET /api/artist/profile
   * 获取当前登录画师的完整信息
   */
  fastify.get('/api/artist/profile', { preHandler: requireAuth }, async (request) => {
    const artist = request.artist
    return {
      ...artist,
      tiers: artistService.getTiers(artist.id),
      artworks: artistService.getArtworks(artist.id),
      rules: artistService.getRules(artist.id)
    }
  })

  /**
   * PUT /api/artist/profile
   * 更新画师资料（昵称、简介、状态、外链、身份码等）
   * R15: 新增 customLinks JSON Schema 校验 + 旧列冻结
   */
  fastify.put('/api/artist/profile', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          avatar: { type: ['string', 'null'], maxLength: 500 },
          bio: { type: ['string', 'null'], maxLength: 500 },
          status: { type: 'string', enum: ['open', 'full', 'break'] },
          customLinks: {
            type: 'array',
            maxItems: 6,
            items: {
              type: 'object',
              required: ['name', 'url'],
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 20 },
                url: { type: 'string', minLength: 1, maxLength: 500, pattern: '^https?://' },
                icon: { type: 'string', enum: ['weibo', 'bilibili', 'pixiv', 'x', 'xiaohongshu', 'lofter', 'douyin', 'link'] }
              },
              additionalProperties: false
            }
          },
          notifyEnabled: { type: 'boolean' },
          artistCode: { type: 'string', maxLength: 10 },
          contactQq: { type: ['string', 'null'], maxLength: 15 },
          templateId: { type: 'string', maxLength: 50 },
          paletteId: { type: 'string', enum: ['paper', 'ink', 'dusk', 'moss'] },
          revisionNote: { type: ['string', 'null'], maxLength: 500 },
          dashboardDefaultPanel: { type: ['string', 'null'], maxLength: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    try {
      const body = request.body || {}
      // camelCase → snake_case 映射（前端统一用 camelCase）
      const keyMap = {
        customLinks: 'custom_links',
        notifyEnabled: 'notify_enabled',
        artistCode: 'artist_code',
        contactQq: 'contact_qq',
        templateId: 'template_id',
        paletteId: 'palette_id',
        revisionNote: 'revision_note',
        dashboardDefaultPanel: 'dashboard_default_panel'
      }
      const CLAMP_MAP = { artist_code: 'artistCode', contact_qq: 'contactQq' }
      const sanitized = {}
      for (const [k, v] of Object.entries(body)) {
        const dbKey = keyMap[k] || k
        sanitized[dbKey] = typeof v === 'string' ? clamp(v, CLAMP_MAP[dbKey] || dbKey) : v
      }
      const updated = artistService.updateArtist(request.artist.id, sanitized)
      return updated
    } catch (err) {
      return reply.code(err.statusCode || 400).send({ code: err.code || 'UNKNOWN', error: err.message })
    }
  })

  // ─── 价格档位 CRUD ───

  fastify.get('/api/artist/tiers', { preHandler: requireAuth }, async (request) => {
    return artistService.getTiers(request.artist.id)
  })

  fastify.post('/api/artist/tiers', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          price: { type: 'number', minimum: 0, maximum: 1000000 },
          description: { type: ['string', 'null'], maxLength: 500 },
          exampleImage: { type: ['string', 'null'], maxLength: 500 },
          workDays: { type: ['integer', 'null'], minimum: 0, maximum: 365 }
        },
        additionalProperties: false
      }
    }
  }, async (request, _reply) => {
    const { name, price, description, exampleImage, workDays } = request.body || {}
    return artistService.createTier(request.artist.id, { name, price, description, exampleImage, workDays })
  })

  fastify.put('/api/artist/tiers/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          price: { type: 'number', minimum: 0, maximum: 1000000 },
          description: { type: ['string', 'null'], maxLength: 500 },
          exampleImage: { type: ['string', 'null'], maxLength: 500 },
          workDays: { type: ['integer', 'null'], minimum: 0, maximum: 365 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    // 归属校验：只能改自己的档位
    const tier = artistService.getTierById(request.params.id)
    if (!tier || tier.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '档位不存在' })
    }
    const updated = artistService.updateTier(request.params.id, request.body || {})
    if (!updated) return reply.code(404).send({ error: '档位不存在' })
    return updated
  })

  fastify.delete('/api/artist/tiers/:id', { preHandler: requireAuth }, async (request, reply) => {
    // 归属校验
    const tier = artistService.getTierById(request.params.id)
    if (!tier || tier.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '档位不存在' })
    }
    artistService.deleteTier(request.params.id)
    return { success: true }
  })

  // ─── 作品管理 ───

  fastify.get('/api/artist/artworks', { preHandler: requireAuth }, async (request) => {
    return artistService.getArtworks(request.artist.id)
  })

  fastify.post('/api/artist/artworks', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['imagePath'],
        properties: {
          imagePath: { type: 'string', minLength: 1, maxLength: 500 },
          title: { type: ['string', 'null'], maxLength: 100 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { imagePath, title } = request.body || {}
    if (!imagePath) return reply.code(400).send({ error: '图片路径为必填项' })
    // 安全：路径归属校验 — 只允许自己图片目录下的文件，拒绝路径穿越
    if (imagePath.includes('..') || !imagePath.startsWith(`images/${request.artist.id}/`)) {
      return reply.code(400).send({ error: '非法图片路径' })
    }
    return artistService.createArtwork(request.artist.id, { imagePath, title })
  })

  fastify.delete('/api/artist/artworks/:id', { preHandler: requireAuth }, async (request, reply) => {
    // 归属校验
    const artwork = artistService.getArtworkById(request.params.id)
    if (!artwork || artwork.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '作品不存在' })
    }
    artistService.deleteArtwork(request.params.id)
    return { success: true }
  })

  // ─── 约稿须知 ───

  fastify.get('/api/artist/rules', { preHandler: requireAuth }, async (request) => {
    return artistService.getRules(request.artist.id)
  })

  fastify.put('/api/artist/rules', { preHandler: requireAuth }, async (request, reply) => {
    const { content } = request.body || {}
    if (content == null) return reply.code(400).send({ error: '内容为必填项' })
    return artistService.updateRules(request.artist.id, clamp(content, 'rules'))
  })

  // ─── 问候语 ───

  /**
   * GET /api/artist/greeting
   * 为当前画师抽取一条问候语（按时段随机）
   */
  fastify.get('/api/artist/greeting', { preHandler: requireAuth }, async (request) => {
    const greetingService = await import('./greeting.service.js')
    return greetingService.drawGreeting(request.artist.id, request.artist.name)
  })

  // ─── 流程与比例 ───

  const workflowService = await import('./workflow.service.js')

  /** GET /api/artist/workflow — 流程节点列表 */
  fastify.get('/api/artist/workflow', { preHandler: requireAuth }, async (request) => {
    return { stages: workflowService.getWorkflow(request.artist.id) }
  })

  /** POST /api/artist/workflow — 添加节点 */
  fastify.post('/api/artist/workflow', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object', required: ['name'], additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 }
        }
      }
    }
  }, async (request) => {
    return workflowService.addStage(request.artist.id, request.body)
  })

  /** PUT /api/artist/workflow/:id — 改名/改描述/切换收款 */
  fastify.put('/api/artist/workflow/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
          takesPayment: { type: 'boolean' }
        }
      }
    }
  }, async (request) => {
    return workflowService.updateStage(request.artist.id, parseInt(request.params.id), request.body)
  })

  /** DELETE /api/artist/workflow/:id — 删除节点 */
  fastify.delete('/api/artist/workflow/:id', { preHandler: requireAuth }, async (request) => {
    return workflowService.deleteStage(request.artist.id, parseInt(request.params.id))
  })

  /** PUT /api/artist/workflow/reorder — 拖拽排序 */
  fastify.put('/api/artist/workflow/reorder', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object', required: ['orderedIds'], additionalProperties: false,
        properties: { orderedIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 } }
      }
    }
  }, async (request) => {
    return { stages: workflowService.reorderStages(request.artist.id, request.body.orderedIds) }
  })

  /** PUT /api/artist/workflow/payment — 批量保存比例 */
  fastify.put('/api/artist/workflow/payment', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object', required: ['nodes'], additionalProperties: false,
        properties: {
          nodes: {
            type: 'array', maxItems: 20,
            items: {
              type: 'object', required: ['id', 'basisPoints'], additionalProperties: false,
              properties: {
                id: { type: 'integer' },
                basisPoints: { type: 'integer', minimum: 500, maximum: 9500 }
              }
            }
          }
        }
      }
    }
  }, async (request) => {
    return { stages: workflowService.savePayment(request.artist.id, request.body.nodes) }
  })

  /** POST /api/artist/workflow/reset — 恢复默认模板 */
  fastify.post('/api/artist/workflow/reset', { preHandler: requireAuth }, async (request) => {
    return { stages: workflowService.resetArtistStages(request.artist.id) }
  })

  // ─── 公开：流程 + 收款计划 ───

  /** GET /api/artists/:subdomain/workflow — 客户端可见 */
  fastify.get('/api/artists/:subdomain/workflow', async (request, reply) => {
    const artist = artistService.getArtistBySubdomain(request.params.subdomain)
    if (!artist || artist.qq_number === getAdminQq()) return reply.code(404).send({ error: '画师不存在' })
    return { stages: workflowService.getWorkflow(artist.id) }
  })
}
