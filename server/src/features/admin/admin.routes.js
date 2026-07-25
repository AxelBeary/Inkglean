import { requireAdmin } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as adminService from './admin.service.js'

// ============================================
// 管理员路由 - 多画师管理
// ============================================

export default async function adminRoutes(fastify) {

  /**
   * GET /api/admin/artists
   */
  fastify.get('/api/admin/artists', { preHandler: requireAdmin }, async () => {
    return artistService.getAllArtists()
  })

  /**
   * POST /api/admin/artists
   * 添加新画师（可指定身份码）
   */
  fastify.post('/api/admin/artists', { preHandler: requireAdmin }, async (request, reply) => {
    const { qqNumber, name, subdomain, bio, artistCode } = request.body || {}

    if (!qqNumber || !name || !subdomain) {
      return reply.code(400).send({ error: 'QQ号、昵称和子域名为必填项' })
    }

    try {
      const artist = artistService.createArtist({ qqNumber, name, subdomain, bio, artistCode })
      return artist
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * DELETE /api/admin/artists/:id
   */
  fastify.delete('/api/admin/artists/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    artistService.deleteArtist(request.params.id)
    return { success: true, message: `已移除画师 ${artist.name}` }
  })

  /**
   * GET /api/admin/stats
   */
  fastify.get('/api/admin/stats', { preHandler: requireAdmin }, async () => {
    return adminService.getGlobalStats()
  })
}
