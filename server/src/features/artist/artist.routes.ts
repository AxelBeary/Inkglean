import * as artistService from './artist.service.js'
import * as platformService from '../platform/platform.service.js'
import * as trackingService from '../tracking/tracking.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { clamp } from '../../shared/validate.js'
import { AppError, E } from '../../shared/errors.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { publicArtistDTO } from '../../shared/dto.js'
import { collectSensitiveHits } from '../../shared/sensitive-words.js'
import { getPlatformAnnouncement } from '../announcement/announcement.service.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 画师路由 - 公开主页 + 后台管理
// ============================================

/** audit-a P3-16: 公开读接口限流守卫（对齐 artworks 30次/分钟/IP，429 错误码对齐） */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

export default async function artistRoutes(fastify: FastifyInstance) {

  // ─── 公开接口（客户端） ───

  /**
   * GET /api/platforms
   * REQ-022 F2: 社交平台列表（公开，仅启用项）——设置页下拉 + 前端识别体验层
   */
  fastify.get('/api/platforms', async () => {
    return platformService.getEnabledPlatforms()
  })

  /**
   * GET /api/artists
   * 获取所有画师公开信息（首页列表；hidden/封禁画师排除）
   * 方案 A（2026-08-21 用户拍板）：开业就绪门槛——未备好作品与价格的空店不上首页目录，
   * 直接访问 /artist/:subdomain 不受此门槛影响（readyIds 只管目录展示）
   */
  fastify.get('/api/artists', async () => {
    const readyIds = artistService.getReadyArtistIds()
    return artistService.getAllArtists()
      .filter(a => a.status !== 'hidden' && !a.is_banned && readyIds.has(a.id))
      .map(a => ({
        id: a.id, name: a.name, subdomain: a.subdomain,
        avatar: a.avatar, bio: a.bio, status: a.status,
        customLinks: artistService.getCustomLinks(a)
      }))
  })

  /**
   * GET /api/artists/:subdomain
   * 获取画师公开主页信息（作品、价格、状态、须知）
   */
  fastify.get('/api/artists/:subdomain', async (request: FastifyRequest, reply: FastifyReply) => {
    // audit-a P3-16: 公开主页较重，补 30次/分钟/IP 限流
    guardRateLimit(`artist-profile:${request.ip}`, 30, 60_000)
    const artist = artistService.getArtistBySubdomain((request.params as { subdomain: string }).subdomain)
    // REQ-042: 封禁画师与「不存在」同响应（目录/主页/工作流全链路隐身）
    if (!artist || artist.is_banned) return reply.code(404).send({ error: '画师不存在' })

    // UI-8: hidden 状态 — 只返回最小信息，不暴露 bio/pricing/artworks/rules
    if (artist.status === 'hidden') {
      return { id: artist.id, name: artist.name, subdomain: artist.subdomain, status: 'hidden' }
    }
    // SPEC-PRICE-2（v50）：旧档位表已清退；tiers 字段保留空数组仅为前端过渡兼容，价格数据走 /api/public/styles
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
      // REQ-022 F2: 外链新结构 [{platformId, url}]；weiboUrl/bilibiliUrl/platformUrls 已移除
      customLinks: artistService.getCustomLinks(artist),
      notifyEnabled: !!artist.notify_enabled,
      // 820-L（v68）: 留言功能开关——关闭时客户端隐藏留言板块（前端据此渲染）
      guestbookEnabled: !!artist.guestbook_enabled,
      // P3-14: 不再兜底登录账号 QQ——未设置展示联系 QQ 时公开接口返回 null
      contactQq: artist.contact_qq || null,
      revisionNote: artist.revision_note || null,
      accentColor: artist.accent_color || null,
      orderTemplateId: artist.order_template_id || 'default',
      inspirationTags: artistService.getInspirationTags(artist),
      // SPEC-004: 名额与缓冲信息
      batchLimit: artist.batch_limit ?? null,
      bufferLimit: artist.buffer_limit ?? 0,
      formalCount: artistService.getZoneCounts(artist.id).formal,
      bufferCount: artistService.getZoneCounts(artist.id).buffer,
      slotDisplay: artistService.computeSlotDisplay(artist),
      // #54: 额度耗尽时覆盖状态，前端据此显示「已约满」而非「可约稿」
      effectiveStatus: (artist.status === 'open' && artistService.computeSlotDisplay(artist) === '本月已约满') ? 'full' : artist.status,
      // S5: 月度额度池
      monthlyQuota: artist.monthly_quota ?? null,
      quotaInfo: artist.monthly_quota != null ? artistService.getMonthlyUsage(artist.id, artist.monthly_quota) : null,
      announcement: artistService.getAnnouncement(artist),
      tiers: [],
      artworks,
      rules: rules?.content || ''
    }
  })

  // ─── 画师后台接口（需登录） ───

  /**
   * GET /api/artist/profile
   * 获取当前登录画师的完整信息
   */
  fastify.get('/api/artist/profile', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    const artist = request.artist
    // 安全加固批 F1: 完整行含 totp_secret，走 DTO 剔除敏感列（quick_actions 保留，前端 Preferences/QuickActions 消费）
    return {
      ...publicArtistDTO(artist),
      tiers: [], // SPEC-PRICE-2（v50）：旧档位已清退，空数组过渡兼容
      artworks: artistService.getArtworks(artist.id),
      rules: artistService.getRules(artist.id),
      slotDisplay: artistService.computeSlotDisplay(artist),
      // 820-L（v68）: 留言开关（对齐 notify_enabled 口径）；统计功能管理员开关（默认关闭=隐藏导航）
      guestbookEnabled: !!artist.guestbook_enabled,
      statsEnabled: trackingService.getStatsEnabled(),
      // E2 补全（清扫批）：月度额度用量下发（与公开主页端点同口径），仪表盘满态牌据此覆盖额度耗尽轴
      quotaInfo: artist.monthly_quota != null ? artistService.getMonthlyUsage(artist.id, artist.monthly_quota) : null
    }
  })

  /**
   * GET /api/artist/announcement
   * REQ-043 I4: 平台公告（画师侧入口弹窗数据源；零主动打扰，仅登录态可读）
   */
  fastify.get('/api/artist/announcement', { preHandler: requireAuth }, async () => {
    return getPlatformAnnouncement()
  })

  /**
   * PUT /api/artist/profile
   * 更新画师资料（昵称、简介、状态、外链、身份码等）
   * REQ-022 F2: customLinks 新结构 [{url}]（platformId 后端重推导）；platformUrls 已删除
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
          status: { type: 'string', enum: ['open', 'full', 'break', 'hidden'] },
          // REQ-022 F2: 外链新结构 — 前端只传 url（platformId 一律后端按 URL 重推导）
          // 无 pattern 约束：裸链补全/协议白名单/长度上限全部在 service 层硬校验
          customLinks: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              required: ['url'],
              properties: {
                url: { type: 'string', minLength: 1, maxLength: 2048 }
              },
              additionalProperties: false
            }
          },
          notifyEnabled: { type: 'boolean' },
          guestbookEnabled: { type: 'boolean' },
          artistCode: { type: 'string', maxLength: 20 },
          contactQq: { type: ['string', 'null'], maxLength: 15 },
          templateId: { type: 'string', maxLength: 50 },
          paletteId: { type: 'string', enum: ['paper', 'ink', 'dusk', 'moss'] },
          revisionNote: { type: ['string', 'null'], maxLength: 500 },
          dashboardDefaultPanel: { type: ['string', 'null'], maxLength: 50 },
          accentColor: { type: ['string', 'null'], maxLength: 20 },
          orderTemplateId: { type: 'string', maxLength: 50 },
          inspirationTags: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', minLength: 1, maxLength: 30 }
          },
          batchLimit: { type: ['integer', 'null'], minimum: 0, maximum: 999 },
          bufferLimit: { type: 'integer', minimum: 0, maximum: 999 },
          autoPromote: { type: 'boolean' },
          hideQueuePosition: { type: 'boolean' },
          hidePromoteNotify: { type: 'boolean' },
          bufferShortForm: { type: 'boolean' },
          announcement: { type: ['string', 'null'], maxLength: 500 },
          announcementExpiresAt: { type: ['string', 'null'], maxLength: 30 },
          monthlyQuota: { type: ['integer', 'null'], minimum: 0, maximum: 999 },
          // v0.25 C: 快捷按钮（DB 持久化，数组→JSON 字符串存储）
          quickActions: { type: ['array', 'null'], maxItems: 9, items: { type: 'string', maxLength: 30 } },
          // 视觉批 P2：看板模块开关（键白名单+布尔，service 层硬校验）
          dashboardModules: {
            type: ['object', 'null'],
            properties: {
              schedule: { type: 'boolean' },
              guestbook: { type: 'boolean' },
              activity: { type: 'boolean' },
              onboarding: { type: 'boolean' }
            },
            additionalProperties: false
          },
          // v0.37 (REQ-024 F2): 多画风开关（关=客户端只见默认画风）
          multiStyleEnabled: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body || {}
      // camelCase → snake_case 映射（前端统一用 camelCase）
      const keyMap = {
        customLinks: 'custom_links',
        notifyEnabled: 'notify_enabled',
        guestbookEnabled: 'guestbook_enabled',
        artistCode: 'artist_code',
        contactQq: 'contact_qq',
        templateId: 'template_id',
        paletteId: 'palette_id',
        revisionNote: 'revision_note',
        dashboardDefaultPanel: 'dashboard_default_panel',
        accentColor: 'accent_color',
        orderTemplateId: 'order_template_id',
        inspirationTags: 'inspiration_tags',
        batchLimit: 'batch_limit',
        bufferLimit: 'buffer_limit',
        autoPromote: 'auto_promote',
        hideQueuePosition: 'hide_queue_position',
        hidePromoteNotify: 'hide_promote_notify',
        bufferShortForm: 'buffer_short_form',
        announcementExpiresAt: 'announcement_expires_at',
        monthlyQuota: 'monthly_quota',
        quickActions: 'quick_actions',
        dashboardModules: 'dashboard_modules',
        multiStyleEnabled: 'multi_style_enabled'
      }
      const CLAMP_MAP = { artist_code: 'artistCode', contact_qq: 'contactQq' }
      const sanitized: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        const dbKey = keyMap[k as keyof typeof keyMap] || k
        sanitized[dbKey] = typeof v === 'string' ? clamp(v, CLAMP_MAP[dbKey as keyof typeof CLAMP_MAP] || dbKey) : v
      }
      // SPEC-004: N+M ≥ 1 校验（batchLimit 为 null 时跳过）
      if ('batch_limit' in sanitized && sanitized.batch_limit !== null) {
        const current = artistService.getArtistById(request.artist.id)
        const N = sanitized.batch_limit as number
        const M = (('buffer_limit' in sanitized) ? sanitized.buffer_limit : (current?.buffer_limit ?? 0)) as number
        if (N + M < 1) {
          return reply.code(400).send({ code: 'INVALID_BATCH_LIMIT', error: '名额设置无效（正式位+缓冲位至少为1）' })
        }
      }
      const updated = artistService.updateArtist(request.artist.id, sanitized)
      // SPEC-004: 画师调大 N 后触发自动递补
      if ('batch_limit' in sanitized && sanitized.batch_limit != null) {
        const { tryAutoPromote } = await import('../order/order.service.js')
        tryAutoPromote(request.artist.id)
      }
      // REQ-042: 主页公告保存命中敏感词 → warning 提示（不硬拦，先发后审）
      const sensitiveWords = 'announcement' in sanitized
        ? collectSensitiveHits(typeof sanitized.announcement === 'string' ? sanitized.announcement : null)
        : []
      // F1 补全：写路径回显同样走 DTO——updateArtist 内部返回完整行（含 totp_secret）
      const dto = publicArtistDTO(updated)
      return sensitiveWords.length ? { ...dto, warning: { sensitiveWords } } : dto
    } catch (err) {
      // 业务错误(AppError)返回其状态码；非业务错误向上抛，走全局 500 handler
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  // ─── 作品管理 ───

  fastify.get('/api/artist/artworks', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    // v0.37 (REQ-024 F6): 附带每作品的档位标注 id 列表（后台作品管理编辑回显）
    const artworks = artistService.getArtworks(request.artist.id)
    return artworks.map((art) => ({
      ...art,
      size_tag_ids: artistService.getArtworkSizeTagIds(art.id)
    }))
  })

  /** GET /api/artist/artworks/paged?page&pageSize — 画师端作品分页（默认 20，clamp 1-50；封面置顶）
   * 老接口 GET /api/artist/artworks 保留（返回全量数组），分页走新接口，避免破坏现有调用
   */
  fastify.get('/api/artist/artworks/paged', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    const q = request.query as { page?: string; pageSize?: string }
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(q.pageSize ?? '20', 10) || 20, 1), 50)
    const paged = artistService.getArtworksPaged(request.artist.id, page, pageSize)
    return {
      ...paged,
      items: paged.items.map((art) => ({
        ...art,
        size_tag_ids: artistService.getArtworkSizeTagIds(art.id)
      }))
    }
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
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { imagePath, title } = (request.body as { imagePath: string; title?: string | null }) || {}
    if (!imagePath) return reply.code(400).send({ error: '图片路径为必填项' })
    // 安全：路径归属校验 — 只允许自己图片目录下的文件，拒绝路径穿越
    if (imagePath.includes('..') || !imagePath.startsWith(`images/${request.artist.id}/`)) {
      return reply.code(400).send({ error: '非法图片路径' })
    }
    const artwork = await artistService.createArtwork(request.artist.id, { imagePath, title })
    // REQ-042: 敏感词命中不硬拦，响应带 warning 供前端提示（先发后审）
    const sensitiveWords = collectSensitiveHits(title)
    return sensitiveWords.length ? { ...artwork, warning: { sensitiveWords } } : artwork
  })

  fastify.delete('/api/artist/artworks/:id', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    // 归属校验
    const artwork = artistService.getArtworkById(parseInt((request.params as { id: string }).id, 10))
    if (!artwork || artwork.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '作品不存在' })
    }
    artistService.deleteArtwork(parseInt((request.params as { id: string }).id, 10))
    return { success: true }
  })

  // ─── v0.37 (REQ-024 F6): 作品编辑（标题/自由描述）+ 档位标注 ───

  /** PUT /api/artist/artworks/:id — 编辑作品（title/description，均可选） */
  fastify.put('/api/artist/artworks/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          title: { type: ['string', 'null'], maxLength: 100 },
          description: { type: ['string', 'null'], maxLength: 2000 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artwork = artistService.getArtworkById(parseInt((request.params as { id: string }).id, 10))
    if (!artwork || artwork.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '作品不存在' })
    }
    const updated = artistService.updateArtwork(artwork.id, request.body || {})
    // REQ-042: 编辑标题/描述命中敏感词 → warning 提示（不硬拦）
    const body = (request.body || {}) as { title?: string | null; description?: string | null }
    const sensitiveWords = collectSensitiveHits(body.title, body.description)
    return sensitiveWords.length ? { ...updated, warning: { sensitiveWords } } : updated
  })

  /** PUT /api/artist/artworks/:id/tags — 批量设置档位标注（多选替换语义） */
  fastify.put('/api/artist/artworks/:id/tags', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['sizeIds'],
        properties: {
          sizeIds: { type: 'array', items: { type: 'integer' }, maxItems: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artwork = artistService.getArtworkById(parseInt((request.params as { id: string }).id, 10))
    if (!artwork || artwork.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '作品不存在' })
    }
    try {
      const sizeIds = artistService.setArtworkSizeTags(request.artist.id, artwork.id, (request.body as { sizeIds: number[] }).sizeIds)
      return { sizeIds }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  // ─── v0.25 #5: 封面图 ───

  /** PUT /api/artist/artworks/:id/cover — 设为封面（同画师其他作品自动取消） */
  fastify.put('/api/artist/artworks/:id/cover', {
    preHandler: requireAuth
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artworkId = parseInt((request.params as { id: string }).id, 10)
    const artwork = artistService.getArtworkById(artworkId)
    if (!artwork || artwork.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '作品不存在' })
    }
    return artistService.setCover(request.artist.id, artworkId)
  })

  /** DELETE /api/artist/artworks/:id/cover — 取消封面 */
  fastify.delete('/api/artist/artworks/:id/cover', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artworkId = parseInt((request.params as { id: string }).id, 10)
    const artwork = artistService.getArtworkById(artworkId)
    if (!artwork || artwork.artist_id !== request.artist.id) {
      return reply.code(404).send({ error: '作品不存在' })
    }
    return artistService.clearCover(request.artist.id, artworkId)
  })

  /** PUT /api/artist/artworks/cover-order — v0.31: 封面排序（多封面轮播顺序） */
  fastify.put('/api/artist/artworks/cover-order', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['orderedIds'],
        properties: {
          orderedIds: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 50 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest) => {
    return artistService.reorderCovers(request.artist.id, (request.body as { orderedIds: number[] }).orderedIds)
  })

  // ─── 约稿须知 ───

  fastify.get('/api/artist/rules', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return artistService.getRules(request.artist.id)
  })

  fastify.put('/api/artist/rules', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { content } = (request.body as { content?: string }) || {}
    if (content == null) return reply.code(400).send({ error: '内容为必填项' })
    // P1 strictNullChecks: 上方已守卫 content == null，clamp 必返回 string
    return artistService.updateRules(request.artist.id, clamp(content, 'rules')!)
  })

  // ─── 问候语 ───

  /**
   * GET /api/artist/greeting
   * 为当前画师抽取一条问候语（按时段随机）
   */
  fastify.get('/api/artist/greeting', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    const greetingService = await import('./greeting.service.js')
    return greetingService.drawGreeting(request.artist.id, request.artist.name)
  })

  // ─── 流程与比例 ───

  const workflowService = await import('./workflow.service.js')

  /** GET /api/artist/workflow — 流程节点列表 */
  fastify.get('/api/artist/workflow', { preHandler: requireAuth }, async (request: FastifyRequest) => {
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
  }, async (request: FastifyRequest) => {
    return workflowService.addStage(request.artist.id, request.body as { name: string; description?: string | null })
  })

  /** PUT /api/artist/workflow/:id — 改名/改描述/切换收款/改话术/改随机开关 */
  fastify.put('/api/artist/workflow/:id', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
          takesPayment: { type: 'boolean' },
          speechTemplate: { type: ['string', 'null'], maxLength: 500 },
          randomTemplate: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    return workflowService.updateStage(request.artist.id, parseInt((request.params as { id: string }).id, 10), request.body as Record<string, unknown>)
  })

  /** DELETE /api/artist/workflow/:id — 删除节点 */
  fastify.delete('/api/artist/workflow/:id', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return workflowService.deleteStage(request.artist.id, parseInt((request.params as { id: string }).id, 10))
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
  }, async (request: FastifyRequest) => {
    return { stages: workflowService.reorderStages(request.artist.id, (request.body as { orderedIds: number[] }).orderedIds) }
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
                // L-11（审计 九#4）: 与 savePayment/默认模板共用同一上限常量
                basisPoints: { type: 'integer', minimum: 500, maximum: workflowService.MAX_NON_FINAL_BP }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    // 批4 B10（方案 b）：活跃订单存在时附 appliesToNewOrdersOnly，前端 toast 提示仅影响新订单
    const result = workflowService.savePayment(request.artist.id, (request.body as { nodes: Array<{ id: number; basisPoints: number }> }).nodes)
    return { stages: result.stages, ...(result.appliesToNewOrdersOnly ? { appliesToNewOrdersOnly: true } : {}) }
  })

  /** POST /api/artist/workflow/reset — 恢复默认模板 */
  fastify.post('/api/artist/workflow/reset', { preHandler: requireAuth }, async (request: FastifyRequest) => {
    return { stages: workflowService.resetArtistStages(request.artist.id) }
  })

  // ─── 公开：流程 + 收款计划 ───

  /** GET /api/artists/:subdomain/workflow — 客户端可见 */
  fastify.get('/api/artists/:subdomain/workflow', async (request: FastifyRequest, reply: FastifyReply) => {
    // audit-a P3-16: 公开工作流接口补 30次/分钟/IP 限流
    guardRateLimit(`artist-workflow:${request.ip}`, 30, 60_000)
    const artist = artistService.getArtistBySubdomain((request.params as { subdomain: string }).subdomain)
    if (!artist || artist.status === 'hidden' || artist.is_banned) return reply.code(404).send({ error: '画师不存在' })
    return { stages: workflowService.getWorkflow(artist.id) }
  })

  /** GET /api/public/artworks/:artistId?page&pageSize — 公开作品分页（默认 10，clamp 1-30；封面置顶）
   * 客户端画师主页「加载更多」用；hidden/封禁/已删除画师 404，与公开 profile 一致不暴露
   * 限流：同 IP 每分钟 30 次（用户红线：公开接口必须防刷）
   */
  fastify.get('/api/public/artworks/:artistId', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!rateLimit(`public-artworks:${request.ip}`, 30, 60_000)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }
    const artistId = Number((request.params as { artistId: string }).artistId)
    if (!Number.isInteger(artistId) || artistId <= 0) {
      return reply.code(400).send({ code: 'INVALID_PARAM', error: '画师 ID 无效' })
    }
    const artist = artistService.getArtistById(artistId)
    if (!artist || artist.deleted_at || artist.status === 'hidden' || artist.is_banned) {
      return reply.code(404).send({ code: 'NOT_FOUND', error: '画师不存在' })
    }
    const q = request.query as { page?: string; pageSize?: string }
    const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(q.pageSize ?? '10', 10) || 10, 1), 30)
    return artistService.getPublicArtworksPaged(artistId, page, pageSize)
  })

  // ─── F1: 作品点赞（公开，匿名） ───

  /** POST /api/public/artworks/:id/like — 点赞 +1（P1-5: IP 限流 5次/分钟/作品） */
    fastify.post('/api/public/artworks/:id/like', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!rateLimit(`like:${request.ip}:${(request.params as { id: string }).id}`, 5, 60_000)) {
        return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
      }
      const artwork = artistService.likeArtwork(parseInt((request.params as { id: string }).id, 10))
      if (!artwork) return reply.code(404).send({ error: '作品不存在' })
      return { likeCount: artwork.like_count }
    })

    /** DELETE /api/public/artworks/:id/like — 取消点赞 -1（P1-5: IP 限流 5次/分钟/作品） */
    fastify.delete('/api/public/artworks/:id/like', async (request: FastifyRequest, reply: FastifyReply) => {
      if (!rateLimit(`unlike:${request.ip}:${(request.params as { id: string }).id}`, 5, 60_000)) {
        return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
      }
      const artwork = artistService.unlikeArtwork(parseInt((request.params as { id: string }).id, 10))
      if (!artwork) return reply.code(404).send({ error: '作品不存在' })
      return { likeCount: artwork.like_count }
    })

  // ─── 仪表盘（v0.18 第二批） ───
  const dashboardRoutes = await import('./dashboard.routes.js')
  await fastify.register(dashboardRoutes.default)

  // ─── 画师工具（REQ-035 批A/批C + REQ-031 A1：客户标记/老客召回/散单记账/收入导出） ───
  const toolsRoutes = await import('./tools.routes.js')
  await fastify.register(toolsRoutes.default)
}
