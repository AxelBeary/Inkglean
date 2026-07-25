import * as artistService from './artist.service.js'
import { requireAuth } from '../../shared/middleware/auth.js'
import { clamp } from '../../shared/validate.js'

// ============================================
// 画师路由 - 公开主页 + 后台管理
// ============================================

export default async function artistRoutes(fastify) {

  // ─── 公开接口（客户端） ───

  /**
   * GET /api/artists
   * 获取所有画师公开信息（首页列表）
   */
  fastify.get('/api/artists', async () => {
    return artistService.getAllArtists().map(a => ({
      id: a.id, name: a.name, subdomain: a.subdomain,
      avatar: a.avatar, bio: a.bio, status: a.status,
      weiboUrl: a.weibo_url, bilibiliUrl: a.bilibili_url
    }))
  })

  /**
   * GET /api/artists/:subdomain
   * 获取画师公开主页信息（作品、价格、状态、须知）
   */
  fastify.get('/api/artists/:subdomain', async (request, reply) => {
    const artist = artistService.getArtistBySubdomain(request.params.subdomain)
    if (!artist) return reply.code(404).send({ error: '画师不存在' })

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
      weiboUrl: artist.weibo_url,
      bilibiliUrl: artist.bilibili_url,
      notifyEnabled: !!artist.notify_enabled,
      contactQq: artist.contact_qq || artist.qq_number,
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
   */
  fastify.put('/api/artist/profile', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const body = request.body || {}
      // 截断所有字符串字段
      const sanitized = {}
      for (const [k, v] of Object.entries(body)) {
        sanitized[k] = typeof v === 'string' ? clamp(v, k === 'artist_code' ? 'artistCode' : k) : v
      }
      const updated = artistService.updateArtist(request.artist.id, sanitized)
      return updated
    } catch (err) {
      return reply.code(400).send({ error: err.message })
    }
  })

  // ─── 价格档位 CRUD ───

  fastify.get('/api/artist/tiers', { preHandler: requireAuth }, async (request) => {
    return artistService.getTiers(request.artist.id)
  })

  fastify.post('/api/artist/tiers', { preHandler: requireAuth }, async (request, reply) => {
    const { name, price, description, exampleImage, workDays } = request.body || {}
    if (!name || price == null) return reply.code(400).send({ error: '名称和价格为必填项' })
    return artistService.createTier(request.artist.id, { name, price, description, exampleImage, workDays })
  })

  fastify.put('/api/artist/tiers/:id', { preHandler: requireAuth }, async (request, reply) => {
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

  fastify.post('/api/artist/artworks', { preHandler: requireAuth }, async (request, reply) => {
    const { imagePath, title } = request.body || {}
    if (!imagePath) return reply.code(400).send({ error: '图片路径为必填项' })
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
}
