import { verifyTotpLogin, createSession } from './auth.service.js'
import type { CreateSessionOptions } from './auth.service.js'
import { requireAuth, getAdminQq } from '../../shared/middleware/auth.js'
import { bumpTokenVersion } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import { publicArtistDTO } from '../../shared/dto.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Artist } from '../../types/entities.js'

// ============================================
// 认证路由 - TOTP 动态口令登录（REQ-027）+ WebAuthn Passkey（REQ-040）
// + 管理后台二次验证（REQ-041）
// ============================================

/** 812 OOBE 修复：请求实际协议（反代下优先 X-Forwarded-Proto）——WebAuthn origin 校验用 */
function reqScheme(request: FastifyRequest): string {
  const fwd = request.headers['x-forwarded-proto']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim()
  return request.protocol
}

/** REQ-040 TOTP 自助重绑：challenge 之外的临时新 secret 暂存（单实例内存） */
interface TotpRebindEntry {
  newSecret: string
  artistId: number
  expiresAt: number
}

type TotpRebindStore = Map<string, TotpRebindEntry>

/** 读取/创建临时重绑存储（globalThis 扩展，避免 any） */
function getTotpRebindStore(): TotpRebindStore {
  const g = globalThis as { __totpRebindStore?: TotpRebindStore }
  if (!g.__totpRebindStore) g.__totpRebindStore = new Map()
  return g.__totpRebindStore
}

/** 限流守卫：不通过则抛 429 */
function guardRateLimit(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) throw new AppError(E.RATE_LIMITED, 429)
}

export default async function authRoutes(fastify: FastifyInstance) {

  // ─── 签发会话 cookie 辅助函数 ───
  // REQ-041：options.authLevel/adminVerifiedAt 缺省 = basic 会话（既有调用语义不变）；
  // step-up 验证通过后传入升级参数重签 token 覆盖 cookie
  function signSession(artist: Artist, reply: FastifyReply, options: CreateSessionOptions = {}) {
    const token = createSession(artist.id, artist.token_version, options)
    const isAdmin = artist.qq_number === getAdminQq()
    reply.setCookie('artist_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 // 7 天
    })
    return {
      isAdmin,
      artist: {
        id: artist.id,
        name: artist.name,
        subdomain: artist.subdomain,
        qqNumber: artist.qq_number
      }
    }
  }

  /** REQ-041 step-up 请求体（totp 与 passkey 二选一） */
  type StepUpBody =
    | { method: 'totp'; code: string }
    | { method: 'passkey'; credentialId: string; authenticatorData: string; signature: string; clientDataJSON: string }

  /**
   * POST /api/auth/step-up
   * REQ-041：管理后台二次验证（登录态，仅管理员可用，非管理员 403）
   * - totp：验证管理员本人 TOTP（复用 verifyTotpLogin：重放防护 + 失败计数/锁定语义）
   * - passkey：复用 webauthn 认证校验（counter 递增），校验对象 = 当前登录管理员的凭据
   * 验证通过 → 重新签发升级 token（auth_level=admin_verified + admin_verified_at=now）覆盖 cookie；失败不升级
   */
  fastify.post('/api/auth/step-up', {
    preHandler: requireAuth,
    schema: {
      body: {
        type: 'object',
        required: ['method'],
        additionalProperties: false,
        properties: {
          method: { type: 'string', enum: ['totp', 'passkey'] },
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          credentialId: { type: 'string', minLength: 1, maxLength: 500 },
          authenticatorData: { type: 'string', minLength: 1, maxLength: 5000 },
          signature: { type: 'string', minLength: 1, maxLength: 5000 },
          clientDataJSON: { type: 'string', minLength: 1, maxLength: 10000 }
        },
        if: { properties: { method: { const: 'totp' } }, required: ['method'] },
        // eslint-disable-next-line unicorn/no-thenable -- JSON Schema if/then/else 关键字，非 thenable 对象
        then: { required: ['code'] },
        else: { required: ['credentialId', 'authenticatorData', 'signature', 'clientDataJSON'] }
      }
    }
  }, async (request, reply) => {
    guardRateLimit(`step-up:${request.ip}`, 10, 5 * 60_000)

    // 仅管理员可用（非管理员 403，与 requireAdmin 同语义；画师无 step-up 能力）
    if (request.artist.qq_number !== getAdminQq()) {
      throw new AppError(E.ADMIN_REQUIRED, 403)
    }

    const body = request.body as StepUpBody

    if (body.method === 'totp') {
      // 复用登录校验（verifyTotpWithCounter + 重放防护 + 防爆破计数/锁定），失败语义与登录一致
      const result = verifyTotpLogin(request.artist.qq_number, body.code)
      if (!result.valid) {
        return reply.code(401).send({
          code: result.code,
          error: result.error,
          ...(result.remainingLockMs != null ? { detail: { remainingLockMs: result.remainingLockMs } } : {})
        })
      }
      if (!result.artist) {
        return reply.code(500).send({ code: 'INTERNAL', error: '登录会话状态异常' })
      }
      const verifiedAt = new Date().toISOString()
      signSession(result.artist, reply, { authLevel: 'admin_verified', adminVerifiedAt: verifiedAt })
      return { success: true, verifiedAt }
    }

    // passkey 分支：flat body → simplewebauthn credential 形状（verifyLogin 内部消费 challenge + 递增 counter）
    const { verifyLogin } = await import('./webauthn.js')
    const credential = {
      id: body.credentialId,
      response: {
        authenticatorData: body.authenticatorData,
        clientDataJSON: body.clientDataJSON,
        signature: body.signature
      }
    }
    try {
      const { artist } = await verifyLogin(credential, request.hostname, request.artist.id, reqScheme(request))
      const verifiedAt = new Date().toISOString()
      signSession(artist, reply, { authLevel: 'admin_verified', adminVerifiedAt: verifiedAt })
      return { success: true, verifiedAt }
    } catch (err) {
      // 防枚举：认证失败/challenge 无效统一为认证失败响应（与登录一致）
      if (err instanceof AppError && (
        err.code === E.WEBAUTHN_AUTHENTICATION_FAILED || err.code === E.WEBAUTHN_CHALLENGE_INVALID
      )) {
        return reply.code(401).send({ code: E.WEBAUTHN_AUTHENTICATION_FAILED, error: '身份验证失败，请重试' })
      }
      throw err
    }
  })

  /**
   * POST /api/auth/verify
   * QQ 号 + TOTP 动态口令登录
   */
  fastify.post('/api/auth/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'code'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    guardRateLimit(`verify:${request.ip}`, 10, 5 * 60_000)

    const { qqNumber, code } = request.body as { qqNumber: string; code: string }

    const result = verifyTotpLogin(qqNumber, code)
    if (!result.valid) {
      return reply.code(401).send({
        code: result.code,
        error: result.error,
        ...(result.remainingLockMs != null ? { detail: { remainingLockMs: result.remainingLockMs } } : {})
      })
    }

    if (!result.artist) {
      return reply.code(500).send({ code: 'INTERNAL', error: '登录会话状态异常' })
    }

    return signSession(result.artist, reply)
  })

  /**
   * GET /api/auth/me
   * 返回当前画师信息 + isAdmin 标记
   */
  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    const isAdmin = request.artist.qq_number === getAdminQq()
    return { ...publicArtistDTO(request.artist), isAdmin }
  })

  /**
   * POST /api/auth/logout
   * 登出 — 递增 token_version 使所有旧 token 失效
   */
  fastify.post('/api/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    bumpTokenVersion(request.artist.id)
    reply.clearCookie('artist_token', { path: '/' })
    return { message: '已登出' }
  })

  // ═══════════════════════════════════════════════════
  // WebAuthn Passkey 注册（登录态）
  // ═══════════════════════════════════════════════════

  /**
   * POST /api/auth/webauthn/register-options
   * 生成注册选项（登录态）
   */
  fastify.post('/api/auth/webauthn/register-options', { preHandler: requireAuth }, async (request) => {
    const { generateRegisterOptions } = await import('./webauthn.js')
    const options = generateRegisterOptions(request.artist, request.hostname)
    return options
  })

  /**
   * POST /api/auth/webauthn/register-verify
   * 验证注册并保存凭据（登录态）
   */
  fastify.post('/api/auth/webauthn/register-verify', { preHandler: requireAuth }, async (request) => {
    const { verifyRegistration, generateDeviceNameFromUA } = await import('./webauthn.js')
    const credential = request.body as Record<string, unknown>
    const credentialRow = await verifyRegistration(request.artist, credential, request.hostname, reqScheme(request))

    // 设置设备名（UA 摘要）
    if (credentialRow) {
      const { updateCredentialName } = await import('./webauthn.js')
      const ua = request.headers['user-agent']
      updateCredentialName(credentialRow.id, request.artist.id, generateDeviceNameFromUA(ua))
    }

    return { credential: credentialRow }
  })

  // ═══════════════════════════════════════════════════
  // WebAuthn Passkey 认证（公开）
  // ═══════════════════════════════════════════════════

  /**
   * POST /api/auth/webauthn/login-options
   * 生成认证选项（公开）
   * 防枚举：未注册 QQ 与正常同响应
   */
  fastify.post('/api/auth/webauthn/login-options', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    guardRateLimit(`webauthn-login-options:${request.ip}`, 10, 5 * 60_000)

    // 防枚举：login-options 不依赖 QQ 号是否注册，总是返回相同的 options 结构
    const { generateLoginOptions } = await import('./webauthn.js')
    const options = generateLoginOptions(request.hostname)
    return options
  })

  /**
   * POST /api/auth/webauthn/login-verify
   * 验证认证响应并签发会话（公开，限流）
   */
  fastify.post('/api/auth/webauthn/login-verify', async (request, reply) => {
    guardRateLimit(`webauthn-login-verify:${request.ip}`, 5, 5 * 60_000)

    const { verifyLogin } = await import('./webauthn.js')
    const credential = request.body as Record<string, unknown>

    try {
      const { artist } = await verifyLogin(credential, request.hostname, undefined, reqScheme(request))
      return signSession(artist, reply)
    } catch (err) {
      // 防枚举：统一认证失败响应
      if (err instanceof AppError && (
        err.code === E.WEBAUTHN_AUTHENTICATION_FAILED || err.code === E.WEBAUTHN_CHALLENGE_INVALID
      )) {
        return reply.code(401).send({ code: E.WEBAUTHN_AUTHENTICATION_FAILED, error: '身份验证失败，请重试' })
      }
      throw err
    }
  })

  // ═══════════════════════════════════════════════════
  // WebAuthn 凭据管理（登录态）
  // ═══════════════════════════════════════════════════

  /**
   * GET /api/auth/webauthn/credentials
   * 获取当前画师所有 Passkey 凭据
   */
  fastify.get('/api/auth/webauthn/credentials', { preHandler: requireAuth }, async (request) => {
    const { getCredentials } = await import('./webauthn.js')
    return { credentials: getCredentials(request.artist.id) }
  })

  /**
   * PATCH /api/auth/webauthn/credentials/:id
   * 修改凭据设备名
   */
  fastify.patch('/api/auth/webauthn/credentials/:id', { preHandler: requireAuth }, async (request) => {
    const { updateCredentialName } = await import('./webauthn.js')
    const { id } = request.params as { id: string }
    const { deviceName } = request.body as { deviceName: string }
    if (!deviceName || deviceName.trim().length === 0) {
      throw new AppError(E.VALIDATION, 400, { field: 'deviceName' })
    }
    const credential = updateCredentialName(Number(id), request.artist.id, deviceName.trim())
    return { credential }
  })

  /**
   * DELETE /api/auth/webauthn/credentials/:id
   * 删除凭据
   */
  fastify.delete('/api/auth/webauthn/credentials/:id', { preHandler: requireAuth }, async (request) => {
    const { deleteCredential } = await import('./webauthn.js')
    const { id } = request.params as { id: string }
    deleteCredential(Number(id), request.artist.id)
    return { success: true }
  })

  // ═══════════════════════════════════════════════════
  // TOTP 自助重绑（登录态）
  // ═══════════════════════════════════════════════════

  /**
   * POST /api/auth/totp/rebind-init
   * TOTP 自助重绑初始化（分层验证）
   * 有 Passkey → 返回 Passkey challenge 要求确认
   * 无 Passkey → 返回要求当前 6 位码
   * 都无 → 拒绝
   * 冷却期 24h 内拒绝（管理员豁免）
   */
  fastify.post('/api/auth/totp/rebind-init', { preHandler: requireAuth }, async (request) => {
    const artist = request.artist
    const isAdmin = artist.qq_number === getAdminQq()

    // 冷却期检查（管理员豁免）
    if (!isAdmin && artist.totp_rebound_at) {
      const reboundTime = new Date(artist.totp_rebound_at).getTime()
      if (Date.now() - reboundTime < 24 * 60 * 60 * 1000) {
        const remainingMs = 24 * 60 * 60 * 1000 - (Date.now() - reboundTime)
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000))
        throw new AppError(E.REBIND_COOLDOWN, 429, { remainingMs, remainingHours })
      }
    }

    const { hasPasskeyCredentials, generateRegisterOptions } = await import('./webauthn.js')
    const { generateSecret, buildOtpAuthUri } = await import('./totp.js')

    const hasPasskey = hasPasskeyCredentials(artist.id)

    if (hasPasskey) {
      // 有 Passkey：要求 Passkey 确认
      // 生成一个注册挑战（复用注册流程，但实际是验证现有 Passkey）
      const options = generateRegisterOptions(artist, request.hostname)
      return {
        verifyMethod: 'passkey',
        options,
        // 暂存新 secret（不落库，等 confirm 时验证通过再写入）
        // 新 secret 已随 challenge 存储
      }
    }

    // 无 Passkey：要求当前 6 位码
    // 检查是否有 TOTP 绑定
    if (!artist.totp_secret || !artist.totp_verified) {
      // 都没有 → 拒绝，引导联系管理员
      throw new AppError(E.REBIND_NO_CREDENTIAL, 400)
    }

    // 生成新 secret 并暂存
    const newSecret = generateSecret()
    const otpauthUri = buildOtpAuthUri(newSecret, artist.qq_number, '拾绘')

    // 用临时映射存储新 secret（challenge store 存的是 webauthn challenge，此处单独存 totp secret）
    const { default: crypto } = await import('crypto')
    const tempKey = 'rebind:' + crypto.randomUUID()
    // 存入临时映射（5 分钟过期，一次性消费）
    getTotpRebindStore().set(tempKey, {
      newSecret,
      artistId: artist.id,
      expiresAt: Date.now() + 5 * 60 * 1000
    })

    return {
      verifyMethod: 'code',
      tempKey,
      qrDataUrl: await (async () => {
        // 生成二维码 data URL
        try {
          const QRCode = await import('qrcode')
          return await QRCode.default.toDataURL(otpauthUri)
        } catch {
          return null
        }
      })(),
      otpauthUri
    }
  })

  /**
   * POST /api/auth/totp/rebind-confirm
   * TOTP 自助重绑确认
   * 验证凭据 + 新码 → 生效 + bumpTokenVersion + 写冷却期
   */
  fastify.post('/api/auth/totp/rebind-confirm', { preHandler: requireAuth }, async (request) => {
    const artist = request.artist
    const body = request.body as Record<string, unknown>

    const { verifyTotp } = await import('./totp.js')
    const { hasPasskeyCredentials } = await import('./webauthn.js')

    const hasPasskey = hasPasskeyCredentials(artist.id)

    let newSecret: string

    if (hasPasskey) {
      // Passkey 路径：认证验证（复用 login-verify 同款 verifyLogin 链路，counter 递增与 challenge 校验一并完成）
      const credential = body.credential as Record<string, unknown> | undefined
      if (!credential) throw new AppError(E.VALIDATION, 400, { field: 'credential' })

      const { verifyLogin } = await import('./webauthn.js')
      try {
        await verifyLogin(credential, request.hostname, undefined, reqScheme(request))
      } catch {
        throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
      }

      // 生成新 secret
      newSecret = (await import('./totp.js')).generateSecret()
    } else {
      // 旧码路径：验证当前 6 位码
      if (!artist.totp_secret) throw new AppError(E.TOTP_NOT_BOUND, 400)
      const code = body.code as string | undefined
      if (!code || !/^\d{6}$/.test(code)) throw new AppError(E.VALIDATION, 400, { field: 'code' })

      if (!verifyTotp(artist.totp_secret, code, Date.now())) {
        throw new AppError(E.TOTP_INVALID, 401)
      }

      // 从 tempKey 获取新 secret
      const tempKey = body.tempKey as string | undefined
      const tempStore = getTotpRebindStore()
      if (!tempKey || !tempStore.has(tempKey)) {
        throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
      }
      const entry = tempStore.get(tempKey) as TotpRebindEntry | undefined
      if (!entry) throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
      tempStore.delete(tempKey) // 一次性消费

      if (!entry || entry.expiresAt <= Date.now() || entry.artistId !== artist.id) {
        throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
      }
      newSecret = entry.newSecret
    }

    // 验证新 6 位码
    const newCode = body.newCode as string | undefined
    if (!newCode || !/^\d{6}$/.test(newCode)) throw new AppError(E.VALIDATION, 400, { field: 'newCode' })

    if (!verifyTotp(newSecret, newCode, Date.now())) {
      throw new AppError(E.TOTP_BIND_INVALID, 400)
    }

    // 生效：写入新密钥 + totp_verified = 1
    db.prepare(`
      UPDATE artists SET totp_secret = ?, totp_verified = 1, totp_failed_attempts = 0, totp_locked_until = NULL, totp_rebound_at = datetime('now')
      WHERE id = ?
    `).run(newSecret, artist.id)

    // 全局踢下线（bumpTokenVersion）
    bumpTokenVersion(artist.id)

    // 审计日志（走 Fastify logger，结构化最小实现）
    request.log.info({ artistId: artist.id, qq: artist.qq_number, ip: request.ip }, 'AUDIT TOTP rebind')

    return { success: true, message: 'TOTP 已重绑，请重新登录' }
  })
}

// 在外部引用 db（用于 TOTP rebind）
import db from '../../db/connection.js'
