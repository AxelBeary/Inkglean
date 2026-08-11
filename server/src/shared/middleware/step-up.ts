// ============================================
// REQ-041 管理后台二次验证（会话升级）中间件
// - requireAdminStepUp：管理后台读/写路由前置（在 requireAdmin 之后），
//   auth_level=admin_verified 且 admin_verified_at 距今 ≤30 分钟，否则 401 STEP_UP_REQUIRED
// - requireAdminReauth：仅「更换管理员」（/api/admin/transfer），强制最近 60 秒内验证过
// - registerAdminStepUpHooks：onRoute 批量挂载，确保追加在 requireAdmin 之后；
//   后续新增 /api/admin 路由自动受保护，避免漏挂
// 踢下线联动：bumpTokenVersion 使 token_version 失配后旧 token 整体失效，
// auth_level/admin_verified_at 随重签自然重置为 basic（无额外代码，语义见 auth.service）
// ============================================
import { verifySession } from '../../features/auth/auth.service.js'
import type { SessionPayload } from '../../features/auth/auth.service.js'
import { requireAdmin } from './auth.js'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

/** REQ-041：需要管理员二次验证（前端据此弹 StepUpDialog） */
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED'

/** 入口级免验窗口：验证通过后 30 分钟内进 /admin 免弹（用户拍板 2026-08-11） */
export const STEP_UP_WINDOW_MS = 30 * 60 * 1000

/** 动作级强制窗口：「更换管理员」无视 30 分钟窗口，必须刚刚验证过（60 秒内） */
export const ACTION_REAUTH_WINDOW_MS = 60 * 1000

/**
 * 提取 token：httpOnly cookie 优先，Authorization: Bearer *** 兜底
 * 与 shared/middleware/auth.ts 的 extractToken 同规则（该函数未导出，此处镜像保持一致）
 */
function extractToken(request: FastifyRequest): string | null {
  const cookieToken = request.cookies?.artist_token
  if (cookieToken) return cookieToken
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return null
}

/**
 * 解析当前会话的 step-up 状态（不区分入口/动作窗口，只算验证年龄）
 * 旧 token（无 auth_level/admin_verified_at）按未升级处理
 */
function resolveStepUpState(request: FastifyRequest): { session: SessionPayload | null; ageMs: number | null } {
  const token = extractToken(request)
  const session = token ? verifySession(token) : null
  if (!session || session.auth_level !== 'admin_verified') {
    return { session, ageMs: null }
  }
  const verifiedAt = session.admin_verified_at ? new Date(session.admin_verified_at).getTime() : 0
  if (!verifiedAt || Number.isNaN(verifiedAt)) return { session, ageMs: null }
  return { session, ageMs: Date.now() - verifiedAt }
}

/** 未满足时统一响应（前端只认 401 + STEP_UP_REQUIRED 码） */
function rejectStepUp(reply: FastifyReply) {
  return reply.code(401).send({ code: STEP_UP_REQUIRED, error: '管理员验证已过期，请重新验证' })
}

/**
 * 入口级守卫：管理后台读/写路由前置（挂在 requireAdmin 之后）
 * auth_level != admin_verified 或 admin_verified_at 距今 >30 分钟 → 401 STEP_UP_REQUIRED
 */
export async function requireAdminStepUp(request: FastifyRequest, reply: FastifyReply) {
  const { ageMs } = resolveStepUpState(request)
  if (ageMs === null || ageMs > STEP_UP_WINDOW_MS) {
    return rejectStepUp(reply)
  }
}

/**
 * 动作级守卫：仅「更换管理员」（改 admin_qq）
 * 强制 admin_verified_at 距今 ≤60 秒（刚刚验证过，无视 30 分钟窗口），否则 401 STEP_UP_REQUIRED
 */
export async function requireAdminReauth(request: FastifyRequest, reply: FastifyReply) {
  const { ageMs } = resolveStepUpState(request)
  if (ageMs === null || ageMs > ACTION_REAUTH_WINDOW_MS) {
    return rejectStepUp(reply)
  }
}

/**
 * 批量挂载：在本插件内所有 /api/admin 路由的 preHandler 中，把 step-up 守卫
 * 插入 requireAdmin 之后（其他 preHandler 之后不再追加，保证 401/403 语义顺序稳定）。
 * transfer 单独使用 requireAdminReauth（动作级强制再验）。
 */
export function registerAdminStepUpHooks(fastify: FastifyInstance): void {
  fastify.addHook('onRoute', (routeOptions) => {
    if (!routeOptions.url.startsWith('/api/admin')) return
    const extra = routeOptions.url === '/api/admin/transfer' ? requireAdminReauth : requireAdminStepUp
    const existing = routeOptions.preHandler
    const list = Array.isArray(existing) ? [...existing] : existing ? [existing] : []
    const adminIdx = list.findIndex(h => h === requireAdmin)
    if (adminIdx >= 0) {
      // 契约：step-up 必须紧随 requireAdmin（在现有 requireAdmin 之后）
      list.splice(adminIdx + 1, 0, extra)
    } else {
      list.push(extra)
    }
    routeOptions.preHandler = list as typeof routeOptions.preHandler
  })
}
