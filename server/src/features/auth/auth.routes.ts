import { verifyTotpLogin, createSession } from './auth.service.js'
import type { CreateSessionOptions } from './auth.service.js'
import { registerDesktopDevice } from './devices.service.js'
import { requireAuth, getAdminQq } from '../../shared/middleware/auth.js'
import { bumpTokenVersion, recordLastLogin, getArtistById } from '../artist/artist.service.js'
import { rateLimit } from '../../shared/middleware/rate-limit.js'
import { AppError, E } from '../../shared/errors.js'
import { publicArtistDTO } from '../../shared/dto.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Artist } from '../../types/entities.js'

// ============================================
// 认证路由 - TOTP 动态口令登录（REQ-027）+ WebAuthn Passkey（REQ-040）
// + 管理后台二次验证（REQ-041）
// ============================================

/** 823 公网事故加固：协议一律以 request.protocol 为准。
 *  fastify 仅在直连来源落入 trustProxy 白名单（app.ts 统一配置）时才解析 X-Forwarded-Proto，
 *  堵掉 812 旧实现「无条件信任转发头」的窟窿——公网事故实测非回源链路的请求可用该头谎报协议。
 *  生产反代经内网段（可信）透传不受影响；生产另有 WEBAUTHN_ORIGIN 环境变量钉死双保险 */
function reqScheme(request: FastifyRequest): string {
  return request.protocol
}

/** 812-e2e 修复：带端口的 host（浏览器 origin 非默认端口含端口，request.hostname 会丢）——WebAuthn origin 校验用；
 *  默认端口（http:80/https:443）浏览器 origin 不带，需剥掉；非标端口保留。
 *  rpId 侧由 webauthn.ts 自行剥端口 */
function reqHost(request: FastifyRequest): string {
  const scheme = reqScheme(request)
  let host = request.headers['x-forwarded-host'] || request.headers.host
  if (typeof host !== 'string' || host.length === 0) return request.hostname
  host = host.split(',')[0].trim()
  if (host.endsWith(':80') && scheme === 'http') return host.slice(0, -3)
  if (host.endsWith(':443') && scheme === 'https') return host.slice(0, -4)
  return host
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
    // 旁路报告修复（2026-08-13）：verifyAuthenticationResponse 首道检查 id===rawId 且 type 必为 'public-key'，
    // 此前拼装漏 rawId/type 导致该分支必 500；WebAuthn 规范中 rawId 与 id 为同一份数据（base64url）
    const { verifyLogin } = await import('./webauthn.js')
    const credential = {
      id: body.credentialId,
      rawId: body.credentialId,
      type: 'public-key',
      response: {
        authenticatorData: body.authenticatorData,
        clientDataJSON: body.clientDataJSON,
        signature: body.signature
      }
    }
    try {
      const { artist } = await verifyLogin(credential, reqHost(request), request.artist.id, reqScheme(request))
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
      // 加固（旁路报告）：验证库抛出的非受控错误（如凭据形状异常）兼容为 401，避免裸 500 穿透
      if (!(err instanceof AppError)) {
        request.log.warn({ err }, 'step-up passkey 验证库异常，已兼容为 401')
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

    // 登录留痕批（v72）：刷新上次登录时间+来源 IP（仅管理后台可见）
    recordLastLogin(result.artist.id, request.ip)

    return signSession(result.artist, reply)
  })

  /**
   * POST /api/auth/desktop/login
   * REQ-014 桌面端登录（首发仅 TOTP，与网页同款）+ 记账式会话（安全口径一/方案 A，v73）：
   * - 复用 verifyTotpLogin（重放防护/防爆破/锁定/封禁拒绝全套语义与网页登录一致）
   * - 登录成功=记账：首次插新账 / 同设备（deviceUuid）重登改账，过期时间刷新至 90 天
   * - 下发 Bearer token（client='desktop' + device_id），不下发 cookie；
   *   客户端按拍板强制存 Windows 系统保险箱（凭据保管柜），不存明文文件（客户端职责，见 desktop/）
   * - 登录留痕复用：桌面登录同样刷新 last_login_at/last_login_ip
   * deviceUuid：客户端首次启动生成的稳定设备标识（存系统保险箱），账本键，防重复记账；
   * 伪造它最多让他人重登时改到自己的账上，不构成越权（登录本身靠 TOTP）。
   */
  fastify.post('/api/auth/desktop/login', {
    schema: {
      body: {
        type: 'object',
        required: ['qqNumber', 'code', 'deviceUuid'],
        properties: {
          qqNumber: { type: 'string', minLength: 5, maxLength: 15, pattern: '^[0-9]+$' },
          code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          deviceUuid: { type: 'string', minLength: 8, maxLength: 64, pattern: '^[0-9a-fA-F-]+$' },
          deviceName: { type: 'string', minLength: 1, maxLength: 100 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    guardRateLimit(`desktop-login:${request.ip}`, 10, 5 * 60_000)

    const { qqNumber, code, deviceUuid, deviceName } = request.body as {
      qqNumber: string; code: string; deviceUuid: string; deviceName?: string
    }

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

    // 记账（登录=记账）：同设备重登走改账不重复记账；随后再验账本行存在性无需重复（register 返回即权威）
    const device = registerDesktopDevice(result.artist.id, deviceUuid, deviceName?.trim() || null, request.ip)
    // 登录留痕批（v72）复用：桌面登录同样刷新上次登录时间+来源 IP（仅管理后台可见）
    recordLastLogin(result.artist.id, request.ip)

    const token = createSession(result.artist.id, result.artist.token_version, { client: 'desktop', deviceId: device.id })
    return {
      token,
      expiresAt: device.expires_at,
      artist: {
        id: result.artist.id,
        name: result.artist.name,
        subdomain: result.artist.subdomain,
        qqNumber: result.artist.qq_number
      }
    }
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
    const options = generateRegisterOptions(request.artist, reqHost(request))
    return options
  })

  /**
   * POST /api/auth/webauthn/register-verify
   * 验证注册并保存凭据（登录态）
   */
  fastify.post('/api/auth/webauthn/register-verify', { preHandler: requireAuth }, async (request) => {
    const { verifyRegistration, generateDeviceNameFromUA } = await import('./webauthn.js')
    const credential = request.body as Record<string, unknown>
    const credentialRow = await verifyRegistration(request.artist, credential, reqHost(request), reqScheme(request))

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
    const options = generateLoginOptions(reqHost(request))
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
      const { artist } = await verifyLogin(credential, reqHost(request), undefined, reqScheme(request))
      // 登录留痕批（v72）：刷新上次登录时间+来源 IP（仅管理后台可见）
      recordLastLogin(artist.id, request.ip)
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
   * 有 Passkey → 返回 verifyMethod: 'passkey' + tempKey + 二维码（init 阶段即生成新 secret 暂存，
   *               身份验证仍由前端走登录仪式，confirm 携带 credential 经 verifyLogin 校验后消费暂存 secret）
   * 无 Passkey → 生成新 secret 暂存 totpRebindStore（5 分钟过期），返回 tempKey + 二维码
   * 都无 → 拒绝
   * 冷却期 24h 内拒绝（管理员豁免）
   */
  fastify.post('/api/auth/totp/rebind-init', { preHandler: requireAuth }, async (request) => {
    // P2-F6: 补限流（同 step-up 同款：10 次/5 分钟）
    guardRateLimit(`totp-rebind-init:${request.ip}`, 10, 5 * 60_000)

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

    const { hasPasskeyCredentials } = await import('./webauthn.js')
    const { generateSecret, buildOtpAuthUri } = await import('./totp.js')

    // 生成新 secret + 二维码并暂存（两条验证路径共用；challenge store 存的是 webauthn challenge，
    // 此处单独存 totp secret；5 分钟过期、一次性消费）
    const stageNewSecret = async () => {
      const newSecret = generateSecret()
      const otpauthUri = buildOtpAuthUri(newSecret, artist.qq_number, '拾绘')
      const { default: crypto } = await import('crypto')
      const tempKey = 'rebind:' + crypto.randomUUID()
      getTotpRebindStore().set(tempKey, {
        newSecret,
        artistId: artist.id,
        expiresAt: Date.now() + 5 * 60 * 1000
      })
      return {
        tempKey,
        otpauthUri,
        qrDataUrl: await (async () => {
          // 生成二维码 data URL
          try {
            const QRCode = await import('qrcode')
            return await QRCode.default.toDataURL(otpauthUri)
          } catch {
            return null
          }
        })()
      }
    }

    const hasPasskey = hasPasskeyCredentials(artist.id)

    if (hasPasskey) {
      // a1 猎杀修复（2026-08-13）：身份验证走登录仪式——前端自行 loginOptions+credentials.get，
      // confirm 携带 credential 由 verifyLogin 校验。
      // 815 审计 P1-1 修复：新 secret 改在 init 阶段生成并下发二维码——此前 confirm 才现场生成，
      // passkey 用户永远拿不到二维码、任何新码都无法匹配，重绑 100% 不可用。
      return {
        verifyMethod: 'passkey',
        ...(await stageNewSecret())
      }
    }

    // 无 Passkey：要求当前 6 位码
    // 检查是否有 TOTP 绑定
    if (!artist.totp_secret || !artist.totp_verified) {
      // 都没有 → 拒绝，引导联系管理员
      throw new AppError(E.REBIND_NO_CREDENTIAL, 400)
    }

    return {
      verifyMethod: 'code',
      ...(await stageNewSecret())
    }
  })

  /**
   * POST /api/auth/totp/verify-current
   * 轻量校验当前 6 位码（重绑流程 Step1「验证」按钮用，前端质量战役审计修复：
   * 原 verifyWithCode 虚实现直接进步骤，错码要到最终 confirm 才暴露）。
   * 只验证不发放任何凭据；真实换绑仍由 rebind-confirm 强制复核。
   */
  fastify.post('/api/auth/totp/verify-current', { preHandler: requireAuth }, async (request) => {
    // P2-F6: 补限流（同 step-up 同款：10 次/5 分钟）
    guardRateLimit(`totp-verify-current:${request.ip}`, 10, 5 * 60_000)

    const artist = request.artist
    if (!artist.totp_secret || !artist.totp_verified) {
      throw new AppError(E.TOTP_NOT_BOUND, 400)
    }
    const body = request.body as { code?: string }
    const code = body.code
    if (!code || !/^\d{6}$/.test(code)) throw new AppError(E.VALIDATION, 400, { field: 'code' })
    const { verifyTotp } = await import('./totp.js')
    if (!verifyTotp(artist.totp_secret, code, Date.now())) {
      throw new AppError(E.TOTP_INVALID, 401)
    }
    return { ok: true }
  })

  /**
   * POST /api/auth/totp/rebind-confirm
   * TOTP 自助重绑确认
   * 验证凭据 + 新码 → 生效 + bumpTokenVersion（踢其他设备）+ 重签本人会话 + 写冷却期
   */
  fastify.post('/api/auth/totp/rebind-confirm', { preHandler: requireAuth }, async (request, reply) => {
    // P2-F6: 补限流（同 step-up 同款：10 次/5 分钟）
    guardRateLimit(`totp-rebind-confirm:${request.ip}`, 10, 5 * 60_000)

    const artist = request.artist
    const body = request.body as Record<string, unknown>

    const { verifyTotp, verifyTotpWithCounter, hashTotpCode } = await import('./totp.js')
    const { hasPasskeyCredentials } = await import('./webauthn.js')

    const hasPasskey = hasPasskeyCredentials(artist.id)

    let newSecret: string

    if (hasPasskey) {
      // Passkey 路径：认证验证（复用 login-verify 同款 verifyLogin 链路，counter 递增与 challenge 校验一并完成）
      const credential = body.credential as Record<string, unknown> | undefined
      if (!credential) throw new AppError(E.VALIDATION, 400, { field: 'credential' })

      const { verifyLogin } = await import('./webauthn.js')
      try {
        // d1-F2 猎杀修复：传 expectedArtistId 校验凭据归属——此前 undefined 导致任意 passkey
        // 可冒充当前凭据完成重绑（受害 TOTP 被随机覆写+全端踢线，2FA 锁定 DoS）
        await verifyLogin(credential, reqHost(request), artist.id, reqScheme(request))
      } catch {
        throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
      }

      // 815 审计 P1-1 修复：消费 init 阶段暂存的新 secret（与旧码路径同款校验）——
      // 此前 confirm 才现场生成，前端无码可扫、任何新码都无法匹配
      const tempKey = body.tempKey as string | undefined
      const tempStore = getTotpRebindStore()
      if (!tempKey || !tempStore.has(tempKey)) {
        throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
      }
      const entry = tempStore.get(tempKey) as TotpRebindEntry | undefined
      tempStore.delete(tempKey) // 一次性消费
      if (!entry || entry.expiresAt <= Date.now() || entry.artistId !== artist.id) {
        throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
      }
      newSecret = entry.newSecret
    } else {
      // 旧码路径：验证当前 6 位码
      if (!artist.totp_secret) throw new AppError(E.TOTP_NOT_BOUND, 400)
      const code = body.code as string | undefined
      if (!code || !/^\d{6}$/.test(code)) throw new AppError(E.VALIDATION, 400, { field: 'code' })

      // P2-F6: 旧码复用登录同款重放防护——验证通过即消费写 totp_used_codes，
      // 唯一约束冲突 = 该码已被用过 = 拒绝（不再允许同一旧码反复重放重绑）
      const hitCounter = verifyTotpWithCounter(artist.totp_secret, code, Date.now())
      if (hitCounter === null) {
        throw new AppError(E.TOTP_INVALID, 401)
      }
      const codeHash = hashTotpCode(artist.id, code, hitCounter)
      try {
        db.prepare('INSERT INTO totp_used_codes (artist_id, code_hash) VALUES (?, ?)').run(artist.id, codeHash)
      } catch {
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

    // 踢其他设备下线（bumpTokenVersion）；注意紧接下面重签本人会话——
    // 自助重绑保护：bump 只作废其他设备持有的旧 token，绝不能把发起重绑的画师自己踢下线。
    bumpTokenVersion(artist.id)

    // 自助重绑保护（会话门禁批）：新门禁下未绑定/被 bump 的会话会被 requireAuth 拒掉，
    // 故用新 token_version 重签会话并下发新 cookie（同登录路径 signSession 用法），
    // 保证重绑完成后画师当前会话无缝续接（新密钥已生效，totp_verified=1）。
    const freshArtist = getArtistById(artist.id)
    if (freshArtist) signSession(freshArtist, reply)

    // 审计日志（走 Fastify logger，结构化最小实现）
    request.log.info({ artistId: artist.id, qq: artist.qq_number, ip: request.ip }, 'AUDIT TOTP rebind')

    return { success: true, message: 'TOTP 已重绑，请重新登录' }
  })
}

// TOTP 重绑的重放防护需要直接写 totp_used_codes，故在本文件底部保留 db 引用
//（该写路径与 top-level 认证流程无共用，独立注释便于后续维护时收敛）
import db from '../../db/connection.js'
