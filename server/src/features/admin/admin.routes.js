import { requireAdmin } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as adminService from './admin.service.js'

// ============================================
// 管理员路由 - 多画师管理
// ============================================

export default async function adminRoutes(fastify) {

  /**
   * GET /api/admin/artists
   * 获取所有画师列表
   */
  fastify.get('/api/admin/artists', { preHandler: requireAdmin }, async () => {
    return artistService.getAllArtists()
  })

  /**
   * POST /api/admin/artists
   * 添加新画师
   */
  fastify.post('/api/admin/artists', { preHandler: requireAdmin }, async (request, reply) => {
    const { qqNumber, name, subdomain, bio } = request.body || {}

    if (!qqNumber || !name || !subdomain) {
      return reply.code(400).send({ error: 'QQ号、昵称和子域名为必填项' })
    }

    try {
      const artist = artistService.createArtist({ qqNumber, name, subdomain, bio })
      return artist
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  /**
   * DELETE /api/admin/artists/:id
   * 移除画师（级联删除所有数据）
   */
  fastify.delete('/api/admin/artists/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    artistService.deleteArtist(request.params.id)
    return { success: true, message: `已移除画师 ${artist.name}` }
  })

  /**
   * GET /api/admin/stats
   * 系统全局统计
   */
  fastify.get('/api/admin/stats', { preHandler: requireAdmin }, async () => {
    return adminService.getGlobalStats()
  })
}
