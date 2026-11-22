// ============================================
// Fastify 请求类型扩展（A3 TS 迁移）
// 认证中间件在 request 上挂载 artist 对象
// ============================================
import type { Artist, Multiplier, OrderDetail } from './entities.js'
import type { ArtStyle, AddonTemplate } from '../features/pricing/style.service.js'

declare module 'fastify' {
  // F0161（已知类型局限，low）: 以下注入属性声明为必填是为免去 200+ 处调用点的非空断言，
  // 但运行时仅在对应 preHandler（requireAuth / requireOwnOrder / requireOwnStyle 等）挂载后才存在。
  // 未挂载这些 preHandler 的公开路由上访问会得到 undefined；写新路由时务必确认已挂对应 preHandler。
  // 真修需按路由拆分认证/非认证请求类型，属大规模类型重构，不在本次分级修复范围。
  interface FastifyRequest {
    /** 认证中间件挂载的画师对象（requireAuth 后可用） */
    artist: Artist
    /** 管理员标记（requireAdmin 后可用） */
    isAdmin?: boolean
    /** requireOwnOrder preHandler 挂载的订单对象 */
    order: OrderDetail
    /** requireOwnMultiplier preHandler 挂载的倍率对象 */
    multiplier: Multiplier
    /** requireExistingArtist preHandler 挂载的画师对象（admin 路由） */
    targetArtist: Artist
    /** requireOwnStyle preHandler 挂载的画风对象（多画风路由） */
    artStyle: ArtStyle
    /** requireOwnTemplate preHandler 挂载的增项模板对象（多画风路由） */
    addonTemplate: AddonTemplate
  }
}
