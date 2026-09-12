import * as artistService from '../artist/artist.service.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

// ============================================
// 管理端路由共享件（从 admin.routes.ts 拆出，对齐 order-route-utils.ts 范式）
// 统一 params schema 与画师存在性守卫，供各资源域子路由模块复用
// ============================================

// P2-7 + F-3（P3-22）: 统一 params schema（AJV 自动把路径参数强转为整数，非法值 400）
export const intId = { params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } }
export const intIdAid = { params: { type: 'object', properties: { id: { type: 'integer' }, aid: { type: 'integer' } }, required: ['id', 'aid'] } }
export const intIdGid = { params: { type: 'object', properties: { id: { type: 'integer' }, gid: { type: 'integer' } }, required: ['id', 'gid'] } }
export const intIdSid = { params: { type: 'object', properties: { id: { type: 'integer' }, sid: { type: 'integer' } }, required: ['id', 'sid'] } }

// 桌面端设备管理（REQ-014）用：/api/admin/artists/:id/devices/:deviceId
export const intIdDid = { params: { type: 'object', properties: { id: { type: 'integer' }, deviceId: { type: 'integer' } }, required: ['id', 'deviceId'] } }

// H-5 修复：画师存在性校验 preHandler（4 个 POST 路由共用）
export async function requireExistingArtist(request: FastifyRequest, reply: FastifyReply) {
  const a = artistService.getArtistById(Number((request.params as { id: string }).id))
  if (!a || a.deleted_at) return reply.code(404).send({ error: '画师不存在' })
  request.targetArtist = a
}
