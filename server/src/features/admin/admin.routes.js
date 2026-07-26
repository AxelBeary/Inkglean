import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as adminService from './admin.service.js'
import * as orderService from '../order/order.service.js'
import { verifyLoginCode } from '../auth/auth.service.js'
import db from '../../db/connection.js'

// ============================================
// 管理员路由 - 多画师管理
// ============================================

export default async function adminRoutes(fastify) {

  /**
   * GET /api/admin/artists
   * 获取所有画师（含 isAdmin 标记）
   */
  fastify.get('/api/admin/artists', { preHandler: requireAdmin }, async () => {
    const adminQq = getAdminQq()
    return artistService.getAllArtists().map(a => ({
      ...a,
      isAdmin: a.qq_number === adminQq
    }))
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
   * 移除画师（不能删除管理员账号）
   */
  fastify.delete('/api/admin/artists/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    if (artist.qq_number === getAdminQq()) {
      return reply.code(403).send({ error: '不能删除管理员账号。如需更换管理员，请使用「更换管理员」功能。' })
    }

    artistService.deleteArtist(request.params.id)
    return { success: true, message: `已移除画师 ${artist.name}` }
  })

  /**
   * GET /api/admin/artists/:id/orders
   * 查看指定画师的订单列表
   */
  fastify.get('/api/admin/artists/:id/orders', { preHandler: requireAdmin }, async (request, reply) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    return orderService.getArtistOrders(artist.id)
  })

  /**
   * PUT /api/admin/artists/:id/status
   * 修改画师主页状态
   */
  fastify.put('/api/admin/artists/:id/status', { preHandler: requireAdmin }, async (request, reply) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

    const { status } = request.body || {}
    if (!['open', 'full', 'break'].includes(status)) {
      return reply.code(400).send({ error: '无效状态' })
    }

    return artistService.updateArtist(artist.id, { status })
  })

  /**
   * GET /api/admin/stats
   */
  fastify.get('/api/admin/stats', { preHandler: requireAdmin }, async () => {
    return adminService.getGlobalStats()
  })

  /**
   * POST /api/admin/transfer
   * 更换管理员账号（需要连续两次 QQ 短码验证）
   * 1. 验证当前管理员的登录码（证明你是管理员）
   * 2. 验证新管理员的登录码（证明对方接受）
   */
  fastify.post('/api/admin/transfer', { preHandler: requireAdmin }, async (request, reply) => {
    const { newQq, currentCode, newCode } = request.body || {}
    if (!newQq || !currentCode || !newCode) {
      return reply.code(400).send({ error: '缺少必要参数' })
    }

    const currentAdminQq = getAdminQq()
    if (String(newQq) === currentAdminQq) {
      return reply.code(400).send({ error: '新管理员不能与当前管理员相同' })
    }

    // 第一次验证：当前管理员身份
    const currentResult = verifyLoginCode(currentAdminQq, String(currentCode))
    if (!currentResult.valid) {
      return reply.code(401).send({ error: `当前管理员验证失败：${currentResult.error}` })
    }

    // 第二次验证：新管理员身份
    const newResult = verifyLoginCode(String(newQq), String(newCode))
    if (!newResult.valid) {
      return reply.code(401).send({ error: `新管理员验证失败：${newResult.error}` })
    }

    // 新管理员必须是已注册画师
    const newArtist = artistService.getArtistByQq(String(newQq))
    if (!newArtist) {
      return reply.code(404).send({ error: '该QQ号未注册为画师，请先添加画师' })
    }

    // 更新平台配置（运行时生效，无需重启）
    db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(String(newQq))

    return { success: true, newAdminName: newArtist.name, newAdminQq: String(newQq) }
  })
}
