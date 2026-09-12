import { requireAdmin } from '../../shared/middleware/auth.js'
import * as artistService from '../artist/artist.service.js'
import db from '../../db/connection.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { intId, intIdGid, requireExistingArtist } from './admin-route-utils.js'

// ============================================
// 管理员路由 - 问候语库与特别日（从 admin.routes.ts 拆出）
// F-09 巨型文件清偿；纯搬移，端点与行为零变更
// ============================================

export async function adminGreetingRoutes(fastify: FastifyInstance) {

  // ─── 问候语管理 ───

  const greetingService = await import('../artist/greeting.service.js')

  /** GET /api/admin/greetings — 通用库列表 */
  fastify.get('/api/admin/greetings', { preHandler: requireAdmin }, async (request: FastifyRequest) => {
    return greetingService.getGlobalGreetings((request.query as { slot?: string }).slot)
  })

  /** POST /api/admin/greetings — 添加通用模板（E5：可挂特别日 specialDayId） */
  fastify.post('/api/admin/greetings', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['early', 'morning', 'noon', 'afternoon', 'evening', 'midnight', 'any'] },
          specialDayId: { type: 'integer' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { text: string; timeSlot?: string; specialDayId?: number }
    // E5：特别日存在性校验（不存在 404，防 FK 裸抛 500）
    if (body.specialDayId !== undefined && !greetingService.getSpecialDay(body.specialDayId)) {
      return reply.code(404).send({ error: '特别日不存在' })
    }
    return greetingService.createGlobalGreeting(body)
  })

  /** PUT /api/admin/greetings/:id — 编辑通用模板 */
  fastify.put('/api/admin/greetings/:id', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['early', 'morning', 'noon', 'afternoon', 'evening', 'midnight', 'any'] },
          isEnabled: { type: 'boolean' },
          specialDayId: { type: ['integer', 'null'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // d2 猎杀修复（2026-08-14）：归属校验对齐同文件 DELETE——全局端点只许改通用模板（artist_id IS NULL），
    // 此前缺失导致可绕过归属直接改画师专属模板（画师级 PUT /api/admin/artists/:id/greetings/:gid 另有归属链）
    const id = Number((request.params as { id: string }).id)
    const existing = db.prepare('SELECT id FROM greeting_templates WHERE id = ? AND artist_id IS NULL').get(id)
    if (!existing) return reply.code(404).send({ error: '模板不存在' })
    const body = request.body as { text?: string; timeSlot?: string; isEnabled?: boolean; specialDayId?: number | null }
    // E5：换挂/清挂特别日前的存在性校验（null=解除关联）
    if (typeof body.specialDayId === 'number' && !greetingService.getSpecialDay(body.specialDayId)) {
      return reply.code(404).send({ error: '特别日不存在' })
    }
    const result = greetingService.updateGreeting(id, body)
    if (!result) return reply.code(404).send({ error: '模板不存在' })
    return result
  })

  /** DELETE /api/admin/greetings/:id — 删除通用模板 */
  fastify.delete('/api/admin/greetings/:id', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    // audit-a P3-7: 不存在 → 404（对齐同文件 PUT 分支），不再恒返回 success
    const id = Number((request.params as { id: string }).id)
    const existing = db.prepare('SELECT id FROM greeting_templates WHERE id = ? AND artist_id IS NULL').get(id)
    if (!existing) return reply.code(404).send({ error: '模板不存在' })
    greetingService.deleteGreeting(id)
    return { success: true }
  })

  /** GET /api/admin/artists/:id/greetings — 画师专属库 */
  // BUG-8 修复：补画师存在性校验（与 POST 的 requireExistingArtist 对齐，不存在时 404 而非空列表）
  fastify.get('/api/admin/artists/:id/greetings', { preHandler: [requireAdmin, requireExistingArtist], schema: intId }, async (request: FastifyRequest) => {
    return greetingService.getArtistGreetings(Number((request.params as { id: string }).id))
  })

  /** POST /api/admin/artists/:id/greetings — 为画师添加专属模板（E5：可挂特别日 specialDayId） */
  fastify.post('/api/admin/artists/:id/greetings', {
    preHandler: [requireAdmin, requireExistingArtist],
    schema: {
      ...intId,
      body: {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['early', 'morning', 'noon', 'afternoon', 'evening', 'midnight', 'any'] },
          specialDayId: { type: 'integer' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { text: string; timeSlot?: string; specialDayId?: number }
    if (body.specialDayId !== undefined && !greetingService.getSpecialDay(body.specialDayId)) {
      return reply.code(404).send({ error: '特别日不存在' })
    }
    return greetingService.createArtistGreeting(Number((request.params as { id: string }).id), body)
  })

  /** PUT /api/admin/artists/:id/greetings/:gid — 编辑专属模板 */
  fastify.put('/api/admin/artists/:id/greetings/:gid', {
    preHandler: requireAdmin,
    schema: {
      ...intIdGid,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 200 },
          timeSlot: { type: 'string', enum: ['early', 'morning', 'noon', 'afternoon', 'evening', 'midnight', 'any'] },
          isEnabled: { type: 'boolean' },
          specialDayId: { type: ['integer', 'null'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // H-6 修复：校验问候语归属 — 必须属于该画师
    const gid = Number((request.params as { gid: string }).gid)
    const artistId = Number((request.params as { id: string }).id)
    const existing = db.prepare('SELECT id, artist_id FROM greeting_templates WHERE id = ?').get(gid) as { id: number; artist_id: number } | undefined
    if (!existing || existing.artist_id !== artistId) {
      return reply.code(404).send({ error: '模板不存在或不属于该画师' })
    }
    const body = request.body as { text?: string; timeSlot?: string; isEnabled?: boolean; specialDayId?: number | null }
    if (typeof body.specialDayId === 'number' && !greetingService.getSpecialDay(body.specialDayId)) {
      return reply.code(404).send({ error: '特别日不存在' })
    }
    const result = greetingService.updateGreeting(gid, body)
    if (!result) return reply.code(404).send({ error: '模板不存在' })
    return result
  })

  /** DELETE /api/admin/artists/:id/greetings/:gid — 删除专属模板 */
  fastify.delete('/api/admin/artists/:id/greetings/:gid', { preHandler: requireAdmin, schema: intIdGid }, async (request: FastifyRequest, reply: FastifyReply) => {
    // H-6 修复：校验问候语归属 — 必须属于该画师
    const gid = Number((request.params as { gid: string }).gid)
    const artistId = Number((request.params as { id: string }).id)
    const existing = db.prepare('SELECT id, artist_id FROM greeting_templates WHERE id = ?').get(gid) as { id: number; artist_id: number } | undefined
    if (!existing || existing.artist_id !== artistId) {
      return reply.code(404).send({ error: '模板不存在或不属于该画师' })
    }
    greetingService.deleteGreeting(gid)
    return { success: true }
  })

  // ─── 问候特别日管理（E5 波 4；step-up 由 registerAdminStepUpHooks onRoute 自动覆盖） ───

  /** GET /api/admin/special-days — 特别日列表（含关联文案数） */
  fastify.get('/api/admin/special-days', { preHandler: requireAdmin }, async () => {
    return greetingService.listSpecialDays()
  })

  /** POST /api/admin/special-days — 创建特别日（name/dateKey 必填，artistId 空=全平台） */
  fastify.post('/api/admin/special-days', {
    preHandler: requireAdmin,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'dateKey'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 50 },
          dateKey: { type: 'string', pattern: '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' },
          artistId: { type: ['integer', 'null'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, dateKey, artistId } = (request.body as { name: string; dateKey: string; artistId?: number | null }) || {}
    const scope = artistId ?? null
    // 指定画师范围时校验画师存在（不存在 404，防 FK 裸抛 500）
    if (scope !== null && !artistService.getArtistById(scope)) {
      return reply.code(404).send({ error: '画师不存在' })
    }
    const day = greetingService.createSpecialDay({ name, dateKey, artistId: scope })
    if (!day) return reply.code(400).send({ error: '日期格式无效（需 MM-DD）' })
    return day
  })

  /** PUT /api/admin/special-days/:id — 启停特别日（停用当天即退出抽取链） */
  fastify.put('/api/admin/special-days/:id', {
    preHandler: requireAdmin,
    schema: {
      ...intId,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['isEnabled'],
        properties: {
          isEnabled: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const id = Number((request.params as { id: string }).id)
    const { isEnabled } = (request.body as { isEnabled: boolean }) || {}
    const day = greetingService.setSpecialDayEnabled(id, isEnabled)
    if (!day) return reply.code(404).send({ error: '特别日不存在' })
    return day
  })

  /** DELETE /api/admin/special-days/:id — 删除特别日（关联文案 FK 级联删除） */
  fastify.delete('/api/admin/special-days/:id', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const id = Number((request.params as { id: string }).id)
    if (!greetingService.getSpecialDay(id)) return reply.code(404).send({ error: '特别日不存在' })
    greetingService.deleteSpecialDay(id)
    return { success: true }
  })

  /** GET /api/admin/special-days/:id/greetings — 某特别日关联文案列表 */
  fastify.get('/api/admin/special-days/:id/greetings', { preHandler: requireAdmin, schema: intId }, async (request: FastifyRequest, reply: FastifyReply) => {
    const id = Number((request.params as { id: string }).id)
    if (!greetingService.getSpecialDay(id)) return reply.code(404).send({ error: '特别日不存在' })
    return greetingService.getSpecialDayGreetings(id)
  })
}
