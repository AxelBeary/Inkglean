import { requireAdmin } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as styleService from '../pricing/style.service.js'
import * as complianceService from '../compliance/compliance.service.js'
import { publicArtistDTO } from '../../shared/dto.js'
import { AppError, E } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { intId, intIdAid, requireExistingArtist } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 画师全设置代理（资料/价格概览/作品/须知）（从 admin.routes.ts 拆出）
// F-09 巨型文件清偿；纯搬移，端点与行为零变更
// P4-2 §8.5（v76 同批）：管理端「删作品」语义改为**下架**（置 takedown_at，行保留可恢复），
//   统一走 complianceService.removeContent('artwork', ...) 并写留痕；
//   画师自己删作品（artist.routes.ts）仍是物理删——用户意图不同，不改。
//   注意：作品读路径由此分叉——管理端一律走 getArtistArtworks（不过滤下架行、透出 takedown_at），
//   不能用 getArtworks（公开端语义，C 路已加 takedown_at IS NULL 过滤，用它会导致下架作品查不到、
//   归属校验误判 404，已下架的作品再也恢复不了）
// ============================================

export async function adminArtistSettingsRoutes(fastify: FastifyInstance) {

  // ─── 画师全设置代理（管理员编辑任意画师） ───

  /** GET /api/admin/artists/:id/profile — 画师资料 */
  fastify.get('/api/admin/artists/:id/profile', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const a = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!a) return reply.code(404).send({ error: '画师不存在' })
    // 安全加固批 F1: 完整行含 totp_secret，走 DTO 剔除敏感列；
    // 登录留痕批（v72）：last_login_at/last_login_ip 被 DTO 剔除，此处显式重新附带（抽屉展示）
    // 内容下架批（v76）：home_takedown_reason 被 DTO 剔除，同范式显式重附（抽屉要能说下架原因）
    return {
      ...publicArtistDTO(a),
      last_login_at: a.last_login_at,
      last_login_ip: a.last_login_ip,
      home_takedown_at: a.home_takedown_at,
      home_takedown_reason: a.home_takedown_reason
    }
  })

  /** PUT /api/admin/artists/:id/profile — 更新画师资料（P1-2: 字段白名单） */
  fastify.put('/api/admin/artists/:id/profile', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          bio: { type: 'string', maxLength: 500 },
          status: { type: 'string', enum: ['open', 'full', 'break', 'hidden'] },
          artist_code: { type: 'string', maxLength: 20 },
          contact_qq: { type: 'string', maxLength: 15 },
          weibo_url: { type: 'string', maxLength: 300 },
          bilibili_url: { type: 'string', maxLength: 300 },
          notify_enabled: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const a = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!a) return reply.code(404).send({ error: '画师不存在' })
    // F1 补全：写路径回显同样走 DTO——updateArtist 内部返回完整行（含 totp_secret）
    return publicArtistDTO(artistService.updateArtist(a.id, request.body as Record<string, unknown>))
  })

  // SPEC-PRICE-2（v50）：旧档位 CRUD 端点已随 price_tiers 表清退移除（画师价格统一走画风/尺寸/增项模型）

  /** GET /api/admin/artists/:id/pricing-overview — 价格概览（SPEC-PRICE-2：画风/尺寸只读；旧档位 CRUD 已退役） */
  fastify.get('/api/admin/artists/:id/pricing-overview', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest) => {
    const artistId = Number((request.params as { id: string }).id)
    const styles = styleService.getArtStyles(artistId)
    return styles.map(s => ({
      id: s.id,
      name: s.name,
      is_active: s.is_active,
      sizes: (s.sizes || []).map(sz => ({ id: sz.id, name: sz.name, base_price: sz.base_price, display_status: sz.display_status }))
    }))
  })

  /** GET /api/admin/artists/:id/artworks — 作品列表（管理端：含已下架行，透出 takedown_at 供打标） */
  fastify.get('/api/admin/artists/:id/artworks', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest) => {
    return artistService.getArtistArtworks(Number((request.params as { id: string }).id))
  })

  /** POST /api/admin/artists/:id/artworks — 添加作品（P1-3） */
  fastify.post('/api/admin/artists/:id/artworks', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['imagePath'], additionalProperties: false,
        properties: {
          imagePath: { type: 'string', minLength: 1, maxLength: 300 },
          title: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request: FastifyRequest) => {
    // H-3 修复：路径归属校验（对齐画师端 POST /api/artist/artworks）
    const { imagePath, title } = (request.body as { imagePath: string; title?: string | null })
    if (imagePath.includes('..') || !imagePath.startsWith(`images/${(request.params as { id: string }).id}/`)) {
      throw new AppError(E.ILLEGAL_PATH)
    }
    return artistService.createArtwork(Number((request.params as { id: string }).id), { imagePath, title })
  })

  /**
   * DELETE /api/admin/artists/:id/artworks/:aid — 管理端处置作品
   * v76 语义变更：不再是物理删，而是**下架**（置 takedown_at，行保留、可经
   * POST /api/admin/content/artwork/:id/restore 恢复），并写 admin_actions 留痕
   */
  fastify.delete('/api/admin/artists/:id/artworks/:aid', { preHandler: requireAdmin, schema: intIdAid }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artistId = Number((request.params as { id: string }).id)
    const artworkId = Number((request.params as { aid: string }).aid)
    // 归属校验走未过滤的管理端读函数（已下架的作品也要能被管理员继续处置/复查，不能因过滤而 404）
    const artworks = artistService.getArtistArtworks(artistId)
    if (!artworks.some(a => a.id === artworkId)) return reply.code(404).send({ error: '作品不属于该画师' })
    // reason 可选（DELETE 无 body schema，防御式取；管理页要能记「为什么下架这件作品」）
    const { reason } = ((request.body as { reason?: string | null } | undefined) ?? {})
    const result = complianceService.removeContent('artwork', artworkId, request.artist.id, reason, request.ip)
    if (!result.success) return reply.code(404).send({ error: '作品不存在' })
    return { success: true }
  })

  /** GET /api/admin/artists/:id/rules — 须知 */
  fastify.get('/api/admin/artists/:id/rules', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest) => {
    return artistService.getRules(Number((request.params as { id: string }).id))
  })

  /** PUT /api/admin/artists/:id/rules — 更新须知 */
  fastify.put('/api/admin/artists/:id/rules', {
    // BUG-8 修复：补画师存在性校验（不存在时 404，而非静默 0 行 UPDATE 返回 200 空 body）
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object', required: ['content'], additionalProperties: false,
        properties: { content: { type: 'string', maxLength: 10000 } }
      }
    }
  }, async (request: FastifyRequest) => {
    return artistService.updateRules(Number((request.params as { id: string }).id), (request.body as { content: string }).content)
  })
}
