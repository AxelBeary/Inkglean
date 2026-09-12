import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as orderService from '../order/order.service.js'
import { publicArtistDTO } from '../../shared/dto.js'
import { clamp } from '../../shared/validate.js'
import { RESERVED_SUBDOMAINS } from '../../shared/validate.js'
import { AppError } from '../../shared/errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { ArtistOrderRow } from '../../types/entities.js'
import { intId } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 画师管理（在册清单 / 建号 / 移除与恢复 / 订单 / 主页状态）
// （从 admin.routes.ts 拆出，F-09 巨型文件清偿；纯搬移，端点与行为零变更）
// ============================================

export async function adminArtistRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/admin/artists
   * 获取所有画师（含 isAdmin 标记）
   */
  fastify.get('/api/admin/artists', { preHandler: requireAdmin }, async () => {
    const adminQq = getAdminQq()
    // 安全加固批 F1: getAllArtists 已显式列（不含密钥），再经 DTO 双重防御；
    // 登录留痕批（v72）：last_login_at/last_login_ip 被 DTO 剔除，此处显式重新附带（仅管理端可见）
    return artistService.getAllArtists().map(a => ({
      ...publicArtistDTO(a),
      isAdmin: a.qq_number === adminQq,
      last_login_at: a.last_login_at,
      last_login_ip: a.last_login_ip
    }))
  })

  /**
   * POST /api/admin/artists
   * 添加新画师（可指定身份码）
   */
  fastify.post('/api/admin/artists', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'name', 'subdomain'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          subdomain: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[a-z0-9]+$' },
          bio: { type: ['string', 'null'], maxLength: 500 },
          // 823 规则对齐批：上限 10→20（与主页标识同长，身份码由标识大写派生）
          artistCode: { type: ['string', 'null'], maxLength: 20 }
        },
        additionalProperties: false
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { qqNumber, name, subdomain, bio, artistCode } = (request.body as { qqNumber: string; name: string; subdomain: string; bio?: string | null; artistCode?: string | null }) || {}

    // 子域名保留词黑名单（防止与系统路径冲突；与 setup/invite 共用 validate.ts 常量）
    if (RESERVED_SUBDOMAINS.includes(subdomain)) {
      return reply.code(400).send({ error: `主页标识「${subdomain}」为系统保留词，请换一个` })
    }

    try {
      const artist = await artistService.createArtist({
        qqNumber,
        name: clamp(name, 'name')!,
        subdomain,
        bio: clamp(bio, 'bio'),
        artistCode
      })
      // F1 补全：createArtist 内部同样返回完整行（SELECT *）——响应壳走 DTO（前端零消费响应体）
      return publicArtistDTO(artist)
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /**
   * DELETE /api/admin/artists/:id
   * 移除画师（不能删除管理员账号）
   */
  fastify.delete('/api/admin/artists/:id', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    if (artist.qq_number === getAdminQq()) {
      return reply.code(403).send({ error: '不能删除管理员账号。如需更换管理员，请使用「更换管理员」功能。' })
    }

    artistService.deleteArtist(Number((request.params as { id: string }).id))
    return { success: true, message: `已移除画师 ${artist.name}` }
  })

  /**
   * GET /api/admin/artists/deleted
   * 0817 用户拍板：已移除画师清单（软删兜底，可恢复）——仅回管理所需字段，DTO 口径同列表
   */
  fastify.get('/api/admin/artists/deleted', { preHandler: requireAdmin }, async () => {
    return artistService.getDeletedArtists().map(a => ({
      id: a.id,
      name: a.name,
      subdomain: a.subdomain,
      qqNumber: a.qq_number,
      isBanned: !!a.is_banned,
      deletedAt: a.deleted_at
    }))
  })

  /**
   * POST /api/admin/artists/:id/restore
   * 恢复已移除画师（子域名/QQ 被占用时 400 拒绝；恢复后需重新登录）
   */
  fastify.post('/api/admin/artists/:id/restore', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const artist = artistService.restoreArtist(Number((request.params as { id: string }).id))
      if (!artist) return reply.code(404).send({ error: '画师不存在或未被移除' })
      return { success: true, message: `已恢复画师 ${artist.name}` }
    } catch (err) {
      if (err instanceof AppError) return reply.code(err.statusCode).send({ code: err.code, error: err.message })
      throw err
    }
  })

  /**
   * GET /api/admin/artists/:id/orders
   * 查看指定画师的订单列表（支持分页）
   */
  fastify.get('/api/admin/artists/:id/orders', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 200 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    const { page, pageSize } = (request.query as { page?: number; pageSize?: number }) || {}
    const result = orderService.getArtistOrders(artist.id, undefined, {
      page: page ?? 1,
      pageSize: pageSize ?? 50
    })
    // B7: 补充 camelCase 付款字段 + 分期三态（管理端行展开用）
    // 815 P-2: 批量预取分期——一次 IN 取全部分期/已付额度，内存按 order_id 分组，替代逐单 N+1
    const installmentsByOrder = orderService.getOrdersInstallments(result.items.map((o: ArtistOrderRow) => o.id))
    result.items = result.items.map((o: ArtistOrderRow) => ({
      ...o,
      paidTotalCents: o.paid_total_cents ?? 0,
      finalPriceCents: o.final_price_cents ?? 0,
      installments: installmentsByOrder.get(o.id) ?? []
    }))
    return result
  })

  /**
   * PUT /api/admin/artists/:id/status
   * 修改画师主页状态
   */
  fastify.put('/api/admin/artists/:id/status', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: ['open', 'full', 'break', 'hidden'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const artist = artistService.getArtistById(Number((request.params as { id: string }).id))
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    const { status } = (request.body as { status?: string }) || {}

    // F1 补全：写路径回显同样走 DTO——updateArtist 内部返回完整行（含 totp_secret）
    return publicArtistDTO(artistService.updateArtist(artist.id, { status: status! }))
  })
}
