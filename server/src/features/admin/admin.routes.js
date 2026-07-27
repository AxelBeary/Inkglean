import { requireAdmin, getAdminQq } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import * as adminService from './admin.service.js'
import * as orderService from '../order/order.service.js'
import { verifyLoginCode } from '../auth/auth.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { clamp } from '../../shared/validate.js'
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
  fastify.post('/api/admin/artists', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'name', 'subdomain'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          name: { type: 'string', minLength: 1, maxLength: 50 },
          subdomain: { type: 'string', minLength: 2, maxLength: 20, pattern: '^[a-z0-9-]+$' },
          bio: { type: ['string', 'null'], maxLength: 500 },
          artistCode: { type: ['string', 'null'], maxLength: 10 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { qqNumber, name, subdomain, bio, artistCode } = request.body || {}

    // 子域名保留词黑名单（防止与系统路径冲突）
    const RESERVED = ['admin', 'api', 'www', 'uploads', 'static', 'login', 'assets', 'dashboard', 'app']
    if (RESERVED.includes(subdomain)) {
      return reply.code(400).send({ error: `子域名「${subdomain}」为系统保留词，请换一个` })
    }

    try {
      const artist = artistService.createArtist({
        qqNumber,
        name: clamp(name, 'name'),
        subdomain,
        bio: clamp(bio, 'bio'),
        artistCode
      })
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
   * 查看指定画师的订单列表（支持分页）
   */
  fastify.get('/api/admin/artists/:id/orders', { preHandler: requireAdmin }, async (request, reply) => {
    const artist = artistService.getArtistById(request.params.id)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })
    const { page, pageSize } = request.query || {}
    return orderService.getArtistOrders(artist.id, undefined, {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.max(1, Math.min(parseInt(pageSize, 10) || 50, 200))
    })
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
   * P1-F: 前置检查 + 整体事务化，任意一步失败全部回滚（码也不消耗）
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

    // P1-F: 限流 + 画师存在性 + 不等于自己 —— 全部无副作用，放在验码前
    if (!rateLimit(`transfer:${newQq}`, 3, 15 * 60_000)) {
      return reply.code(429).send({ error: '操作过于频繁，请稍后再试' })
    }

    const newArtist = artistService.getArtistByQq(String(newQq))
    if (!newArtist) {
      return reply.code(404).send({ error: '该QQ号未注册为画师，请先添加画师' })
    }

    // P1-F: 两次验码 + 更新配置整体包进事务
    //   任意一步失败 → 事务回滚 → 码不消耗、配置不变
    try {
      db.transaction(() => {
        const currentResult = verifyLoginCode(currentAdminQq, String(currentCode))
        if (!currentResult.valid) {
          throw new Error(`当前管理员验证失败：${currentResult.error}`)
        }
        const newResult = verifyLoginCode(String(newQq), String(newCode))
        if (!newResult.valid) {
          throw new Error(`新管理员验证失败：${newResult.error}`)
        }
        db.prepare("UPDATE platform_config SET value = ? WHERE key = 'admin_qq'").run(String(newQq))
      })()
    } catch (err) {
      return reply.code(401).send({ error: '验证失败，请确认登录码' })
    }

    return { success: true, newAdminName: newArtist.name, newAdminQq: String(newQq) }
  })

  // ─── 问候语管理 ───

  const greetingService = await import('../artist/greeting.service.js')

  /** GET /api/admin/greetings — 通用库列表 */
  fastify.get('/api/admin/greetings', { preHandler: requireAdmin }, async (request) => {
    return greetingService.getGlobalGreetings(request.query.slot)
  })

  /** POST /api/admin/greetings — 添加通用模板 */
  fastify.post('/api/admin/greetings', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] }
        }
      }
    }
  }, async (request) => {
    return greetingService.createGlobalGreeting(request.body)
  })

  /** PUT /api/admin/greetings/:id — 编辑通用模板 */
  fastify.put('/api/admin/greetings/:id', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] },
          isEnabled: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const result = greetingService.updateGreeting(parseInt(request.params.id), request.body)
    if (!result) return reply.code(404).send({ error: '模板不存在' })
    return result
  })

  /** DELETE /api/admin/greetings/:id — 删除通用模板 */
  fastify.delete('/api/admin/greetings/:id', { preHandler: requireAdmin }, async (request) => {
    greetingService.deleteGreeting(parseInt(request.params.id))
    return { success: true }
  })

  /** GET /api/admin/artists/:id/greetings — 画师专属库 */
  fastify.get('/api/admin/artists/:id/greetings', { preHandler: requireAdmin }, async (request) => {
    return greetingService.getArtistGreetings(parseInt(request.params.id))
  })

  /** POST /api/admin/artists/:id/greetings — 为画师添加专属模板 */
  fastify.post('/api/admin/artists/:id/greetings', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] }
        }
      }
    }
  }, async (request) => {
    return greetingService.createArtistGreeting(parseInt(request.params.id), request.body)
  })

  /** PUT /api/admin/artists/:id/greetings/:gid — 编辑专属模板 */
  fastify.put('/api/admin/artists/:id/greetings/:gid', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night', 'any'] },
          isEnabled: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    const result = greetingService.updateGreeting(parseInt(request.params.gid), request.body)
    if (!result) return reply.code(404).send({ error: '模板不存在' })
    return result
  })

  /** DELETE /api/admin/artists/:id/greetings/:gid — 删除专属模板 */
  fastify.delete('/api/admin/artists/:id/greetings/:gid', { preHandler: requireAdmin }, async (request) => {
    greetingService.deleteGreeting(parseInt(request.params.gid))
    return { success: true }
  })
}
