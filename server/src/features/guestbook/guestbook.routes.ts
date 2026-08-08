import { requireAuth, requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import * as guestbookService from './guestbook.service.js'
import * as artistService from '../artist/artist.service.js'
import type { FastifyInstance } from 'fastify'
import type { Artist } from '../../types/entities.js'

// ============================================
// 留言板路由（F4）
// ============================================

export default async function guestbookRoutes(fastify: FastifyInstance) {

  // ─── 公开接口 ───

  /** POST /api/public/artist/:subdomain/messages — 客户提交留言（限流：同 IP 每分钟 2 条） */
  fastify.post('/api/public/artist/:subdomain/messages', {
    schema: {
      body: {
        type: 'object',
        required: ['nickname', 'content'],
        properties: {
          nickname: { type: 'string', minLength: 1, maxLength: 20 },
          content: { type: 'string', minLength: 1, maxLength: 200 },
          language: { type: 'string', maxLength: 10, default: 'zh-CN' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    // T2: 同 IP 每分钟 2 条
    if (!rateLimit(`guestbook:${request.ip}`, 2, 60_000)) {
      return reply.code(429).send({ code: 'RATE_LIMITED', error: '操作过于频繁，请稍后再试' })
    }
    const artist = artistService.getArtistBySubdomain((request.params as { subdomain: string }).subdomain) as Artist | undefined
    if (!artist || artist.qq_number === getAdminQq() || artist.status === 'hidden') {
      return reply.code(404).send({ error: '画师不存在' })
    }
    const body = request.body as { nickname: string; content: string; language?: string }
    const msg = guestbookService.createMessage(artist.id, body.nickname, body.content, body.language || 'zh-CN')
    return reply.code(201).send({ id: msg?.id })
  })

  /** GET /api/public/artist/:subdomain/messages — 已审核留言（分页，v0.31: 可选 ?language= 过滤） */
  fastify.get('/api/public/artist/:subdomain/messages', async (request, reply) => {
    const artist = artistService.getArtistBySubdomain((request.params as { subdomain: string }).subdomain) as Artist | undefined
    if (!artist || artist.qq_number === getAdminQq() || artist.status === 'hidden') {
      return reply.code(404).send({ error: '画师不存在' })
    }
    const query = request.query as { page?: string; pageSize?: string; language?: string }
    const page = Math.max(parseInt(query.page as string) || 1, 1)
    const pageSize = Math.min(Math.max(parseInt(query.pageSize as string) || 20, 1), 50)
    const language = query.language && /^[a-zA-Z-]{2,10}$/.test(query.language) ? query.language : undefined
    const result = guestbookService.getPublicMessages(artist.id, page, pageSize, language)
    return {
      messages: result.messages.map(m => ({
        id: m.id,
        nickname: m.nickname,
        content: m.content,
        language: m.language,
        artistReply: m.artist_reply,
        repliedAt: m.replied_at,
        createdAt: m.created_at
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    }
  })

  // ─── 画师后台接口（需登录） ───

  /** GET /api/artist/messages — 画师获取自己所有留言（含 pending） */
  fastify.get('/api/artist/messages', { preHandler: requireAuth }, async (request) => {
    return guestbookService.getArtistMessages(request.artist.id)
  })

  /** PUT /api/artist/messages/:id/approve — 通过 */
  fastify.put('/api/artist/messages/:id/approve', { preHandler: requireAuth }, async (request, reply) => {
    const msg = guestbookService.approveMessage(request.artist.id, parseInt((request.params as { id: string }).id))
    if (!msg) return reply.code(404).send({ error: '留言不存在' })
    return msg
  })

  /** PUT /api/artist/messages/:id/reject — 拒绝（静默） */
  fastify.put('/api/artist/messages/:id/reject', { preHandler: requireAuth }, async (request, reply) => {
    const msg = guestbookService.rejectMessage(request.artist.id, parseInt((request.params as { id: string }).id))
    if (!msg) return reply.code(404).send({ error: '留言不存在' })
    return { success: true }
  })

  /** PUT /api/artist/messages/:id/reply — 回复 */
  fastify.put('/api/artist/messages/:id/reply', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['reply'],
        properties: {
          reply: { type: 'string', minLength: 1, maxLength: 500 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const body = request.body as { reply: string }
    const msg = guestbookService.replyMessage(request.artist.id, parseInt((request.params as { id: string }).id), body.reply)
    if (!msg) return reply.code(404).send({ error: '留言不存在' })
    return msg
  })

  // ─── 管理员接口 ───

  /** GET /api/admin/messages — 管理员查看全部留言（跨画师，含 artist_name）；REQ-022 F5：可选 ?artistId=&status=&replied= 筛选 */
  fastify.get('/api/admin/messages', { preHandler: requireAdmin }, async (request) => {
    const query = request.query as { artistId?: string; status?: string; replied?: string }
    const filters: guestbookService.AdminMessageFilters = {}
    // 严格数字串校验（'12abc'→NaN 而非 12；'1.9'→NaN 而非 1）
    const artistId = /^\d+$/.test(query.artistId ?? '') ? Number(query.artistId) : NaN
    if (!Number.isNaN(artistId)) filters.artistId = artistId
    // 枚举白名单：非法值忽略（与全站列表惯例一致）
    if (query.status && ['pending', 'approved', 'rejected'].includes(query.status)) filters.status = query.status
    if (query.replied === '1') filters.replied = 1
    else if (query.replied === '0') filters.replied = 0
    return guestbookService.getAdminMessages(filters)
  })

  /** DELETE /api/admin/messages/:id — 管理员强制删除（软删除） */
  fastify.delete('/api/admin/messages/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const msg = guestbookService.adminDeleteMessage(parseInt((request.params as { id: string }).id))
    if (!msg) return reply.code(404).send({ error: '留言不存在' })
    return { success: true }
  })
}
