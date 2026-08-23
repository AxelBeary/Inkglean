// ============================================
// WebAuthn / Passkey 认证核心（REQ-040）
// Challenge 存储：内存 Map（单实例部署可接受，注释说明）
// 依赖：@simplewebauthn/server（仅服务端验证）
// 前端：浏览器原生 navigator.credentials API，零依赖
// ============================================
import db from '../../db/connection.js'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  GenerateRegistrationOptionsOpts,
  RegistrationResponseJSON,
  VerifyRegistrationResponseOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyAuthenticationResponseOpts
} from '@simplewebauthn/server'
import { AppError, E } from '../../shared/errors.js'
import type { Artist } from '../../types/entities.js'

// ─── Challenge 存储 ───

interface ChallengeEntry {
  /** 关联的画师 ID（注册流程必填，认证流程可空） */
  artistId?: number
  /** challenge 用途 */
  purpose: 'register' | 'login'
  /** 过期时间戳 */
  expiresAt: number
  /** 附加数据（如 TOTP 重绑新 secret） */
  meta?: Record<string, unknown>
}

/**
 * 内存 Challenge Map（单实例部署可接受）
 * 多实例部署需迁移到 Redis/DB。TTL 5 分钟，惰性清理。
 * 容量上限 10,000 条，超限淘汰最早条目。
 */
const challengeStore = new Map<string, ChallengeEntry>()
const CHALLENGE_TTL_MS = 5 * 60 * 1000
const MAX_CHALLENGES = 10_000

/** 存储 challenge（由 @simplewebauthn/server 生成后调用） */
function storeChallenge(challenge: string, purpose: ChallengeEntry['purpose'], artistId?: number, meta?: Record<string, unknown>): void {
  // 惰性清理：每次写入前清理一部分过期条目
  const now = Date.now()
  let cleaned = 0
  for (const [key, entry] of challengeStore) {
    if (entry.expiresAt <= now) {
      challengeStore.delete(key)
      cleaned++
      if (cleaned > 100) break
    }
  }
  // 超限淘汰
  if (challengeStore.size >= MAX_CHALLENGES) {
    const oldestKey = challengeStore.keys().next().value
    if (oldestKey) challengeStore.delete(oldestKey)
  }
  challengeStore.set(challenge, { artistId, purpose, expiresAt: now + CHALLENGE_TTL_MS, meta })
}

/** 验证并消费 challenge（一次性，防重放） */
function consumeChallenge(challenge: string, purpose: ChallengeEntry['purpose'], artistId?: number): ChallengeEntry | null {
  const entry = challengeStore.get(challenge)
  if (!entry) return null
  challengeStore.delete(challenge) // 一次性消费
  if (entry.expiresAt <= Date.now()) return null // 已过期
  if (entry.purpose !== purpose) return null
  if (artistId !== undefined && entry.artistId !== artistId) return null
  return entry
}

// ─── 凭据数据库操作 ───

export interface WebAuthnCredentialRow {
  id: number
  artist_id: number
  credential_id: string
  public_key: string
  counter: number
  device_name: string | null
  created_at: string
  last_used_at: string | null
}

/** 获取画师的所有凭据 */
export function getCredentials(artistId: number): WebAuthnCredentialRow[] {
  return db.prepare(
    'SELECT * FROM webauthn_credentials WHERE artist_id = ? ORDER BY created_at DESC'
  ).all(artistId) as WebAuthnCredentialRow[]
}

/** 获取单条凭据（按 credential_id 即 base64url 字符串） */
function getCredentialByCredId(credentialId: string): WebAuthnCredentialRow | undefined {
  return db.prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?').get(credentialId) as WebAuthnCredentialRow | undefined
}

/** 获取画师已有凭据 ID 列表 */
export function getExistingCredentialIds(artistId: number): string[] {
  const rows = db.prepare('SELECT credential_id FROM webauthn_credentials WHERE artist_id = ?').all(artistId) as Pick<WebAuthnCredentialRow, 'credential_id'>[]
  return rows.map(r => r.credential_id)
}

/** 检查画师是否有 Passkey 凭据 */
export function hasPasskeyCredentials(artistId: number): boolean {
  const row = db.prepare('SELECT COUNT(*) AS c FROM webauthn_credentials WHERE artist_id = ?').get(artistId) as { c: number }
  return row.c > 0
}

// ─── RP 配置 ───

function getRpId(requestHostname?: string): string {
  // rpId 必须是裸域名（WebAuthn 规范不允许带端口），入参可能含端口，统一剥掉
  const bare = (requestHostname || 'localhost').replace(/:\d+$/, '')
  return process.env.WEBAUTHN_RP_ID || bare
}

function getRpName(): string {
  // 品牌名统一（拾绘 Inkglean）；rpName 仅影响系统弹窗显示文案，不影响凭据绑定（rpId 才绑定）
  return '拾绘 Inkglean'
}

function getRpOrigin(requestHostname?: string, requestScheme?: string): string {
  if (process.env.WEBAUTHN_ORIGIN) return process.env.WEBAUTHN_ORIGIN
  const hostname = requestHostname || 'localhost'
  // 812 OOBE 实测修复：生产经 Caddy 反代以 https 提供，旧逻辑把 localhost 硬编码为 http
  // 导致 origin 校验失败（浏览器报 https://localhost）。协议以请求实际 scheme 为准（路由层传入，含 X-Forwarded-Proto）
  const scheme = requestScheme || ((hostname.includes('localhost') || hostname.includes('127.0.0.1')) ? 'http' : 'https')
  // 812-e2e 验收抓出：浏览器 origin 非默认端口时带端口（http://localhost:3999），
  // 而路由层 request.hostname 是裸域名，拼出的 origin 丢端口导致直连端口场景校验失配；
  // hostname 保留入参原样（路由层改传带端口的 host），Caddy 443 默认端口场景不受影响
  return `${scheme}://${hostname}`
}

// ─── 注册流程（登录态） ───

/**
 * 生成注册选项（POST /api/auth/webauthn/register-options）
 * 前端用返回的 options 调用 navigator.credentials.create()
 */
export async function generateRegisterOptions(artist: Artist, requestHostname?: string) {
  const rpId = getRpId(requestHostname)
  const rpName = getRpName()

  const opts: GenerateRegistrationOptionsOpts = {
    rpName,
    rpID: rpId,
    userName: artist.qq_number,
    userDisplayName: artist.name,
    excludeCredentials: getExistingCredentialIds(artist.id).map(cid => ({
      id: cid,
      type: 'public-key' as const,
      transports: ['internal', 'hybrid', 'usb', 'nfc', 'ble'] as const
    })),
    attestationType: 'none',
    authenticatorSelection: {
      // 公网 Passkey 报障修复（2026-08-19）：验证侧 requireUserVerification 默认强制，
      // 下发侧却写 preferred（可做可不做）——无 UV 能力的验证器下发侧放行、验证侧拒绝。
      // 两侧统一 required：浏览器提前拦截给出明确失败，不再往返服务器才报错。
      userVerification: 'required',
      residentKey: 'preferred',
    }
  }

  const options = await generateRegistrationOptions(opts)
  // 存储 challenge
  storeChallenge(options.challenge, 'register', artist.id)
  return options
}

/**
 * 验证注册响应（POST /api/auth/webauthn/register-verify）
 */
export async function verifyRegistration(
  artist: Artist,
  credential: unknown,
  requestHostname?: string,
  requestScheme?: string
): Promise<WebAuthnCredentialRow> {
  const rpId = getRpId(requestHostname)
  const origin = getRpOrigin(requestHostname, requestScheme)

  // 从 credential 提取 challenge
  const cred = credential as Record<string, unknown>
  const response = cred.response as Record<string, unknown> | undefined
  const clientDataJSON = response?.clientDataJSON as string | undefined
  let challengeFromClient = ''
  if (clientDataJSON) {
    try {
      const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString())
      challengeFromClient = parsed.challenge
    } catch { /* 解析失败，后续验证会拒绝 */ }
  }

  // 消费 challenge
  if (!challengeFromClient || !consumeChallenge(challengeFromClient, 'register', artist.id)) {
    throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
  }

  const verificationOpts: VerifyRegistrationResponseOpts = {
    response: credential as RegistrationResponseJSON,
    expectedChallenge: challengeFromClient,
    expectedOrigin: origin,
    expectedRPID: rpId,
    // 显式声明（库默认即 true）：Passkey 登录/注册替代 QQ+TOTP 强因子，必须用户验证；
    // 与下发侧 authenticatorSelection.userVerification='required' 两侧一致
    requireUserVerification: true,
  }

  const verification = await verifyRegistrationResponse(verificationOpts)
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError(E.WEBAUTHN_REGISTRATION_FAILED, 400)
  }

  // @simplewebauthn/server v13：registrationInfo.credential.id 已是 Base64URLString 直接用；
  // publicKey 为 Uint8Array 需转 base64url（旧版顶层 credentialID/credentialPublicKey 字段已移除）。
  // 注：对 id 再包 Buffer.from(...).toString('base64url') 会把字符串当 UTF-8 二次编码，是错的
  const registered = verification.registrationInfo
  const credentialIdBase64 = registered.credential.id
  const publicKeyBase64 = Buffer.from(registered.credential.publicKey).toString('base64url')
  const counter = registered.credential.counter

  // 检查是否已存在（幂等防护）
  const existing = db.prepare('SELECT id FROM webauthn_credentials WHERE credential_id = ?').get(credentialIdBase64)
  if (existing) {
    throw new AppError(E.WEBAUTHN_CREDENTIAL_EXISTS, 409)
  }

  const result = db.prepare(`
    INSERT INTO webauthn_credentials (artist_id, credential_id, public_key, counter, device_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(artist.id, credentialIdBase64, publicKeyBase64, counter, null)

  return db.prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(Number(result.lastInsertRowid)) as WebAuthnCredentialRow
}

// ─── 认证流程（公开） ───

/**
 * counter 防克隆回归判定（812 OOBE 实测修复）：
 * 平台验证器（Windows Hello TPM / 手机生物识别）按 WebAuthn 规范永远上报 counter=0，
 * 若强制"新值必须大于旧值"则 0<=0 永久拒绝登录。规则：双侧均为 0 = 平台验证器，不判回归；
 * 任一侧非零 = 验证器实现了计数器，强制递增（防克隆）。
 */
export function isCounterRegression(newCounter: number, storedCounter: number): boolean {
  if (newCounter === 0 && storedCounter === 0) return false
  return newCounter <= storedCounter
}

/**
 * 生成认证选项（POST /api/auth/webauthn/login-options）
 * 防枚举：未注册 QQ 与正常同响应结构（仅返回 options 骨架）
 */
export async function generateLoginOptions(requestHostname?: string) {
  const rpId = getRpId(requestHostname)

  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: rpId,
    // 与验证侧 requireUserVerification:true 一致（见 generateRegisterOptions 同批修复注释）
    userVerification: 'required',
  }

  const options = await generateAuthenticationOptions(opts)
  storeChallenge(options.challenge, 'login')
  return options
}

/**
 * 验证认证响应（POST /api/auth/webauthn/login-verify）
 * 成功返回画师信息和凭据行
 * REQ-041 step-up 扩展：expectedArtistId 传入时校验凭据归属（必须属于当前登录管理员），
 * 不传则保持公开认证语义（既有调用不变）
 */
export async function verifyLogin(
  credential: unknown,
  requestHostname?: string,
  expectedArtistId?: number,
  requestScheme?: string
): Promise<{ artist: Artist; credentialRow: WebAuthnCredentialRow }> {
  const rpId = getRpId(requestHostname)
  const origin = getRpOrigin(requestHostname, requestScheme)

  // 提取 credential_id
  const cred = credential as Record<string, unknown>
  const credId = cred.id as string

  // 从 clientDataJSON 提取 challenge
  const response = cred.response as Record<string, unknown> | undefined
  const clientDataJSON = response?.clientDataJSON as string | undefined
  let challengeFromClient = ''
  if (clientDataJSON) {
    try {
      const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString())
      challengeFromClient = parsed.challenge
    } catch { /* 解析失败，后续验证会拒绝 */ }
  }

  // 消费 challenge（不检查 artistId，认证是公开的）
  if (!challengeFromClient || !consumeChallenge(challengeFromClient, 'login')) {
    throw new AppError(E.WEBAUTHN_CHALLENGE_INVALID, 400)
  }

  // 查找凭据
  const credentialRow = getCredentialByCredId(credId)
  if (!credentialRow) {
    // 防枚举：与凭据无效同响应
    throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
  }
  // REQ-041：step-up 校验对象 = 当前登录管理员的凭据（他人凭据与无效同响应，防枚举）
  if (expectedArtistId !== undefined && credentialRow.artist_id !== expectedArtistId) {
    throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
  }

  // 查找画师
  const { getArtistById } = await import('../../features/artist/artist.service.js')
  const artist = getArtistById(credentialRow.artist_id) as Artist | undefined
  if (!artist || artist.deleted_at) {
    throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
  }
  // REQ-042: Passkey 登录同样拦截封禁画师（明确错误码，前端可读）
  if (artist.is_banned) {
    throw new AppError(E.ARTIST_BANNED, 403)
  }
  // 会话门禁批：动态口令未绑定（被重置/未完成绑定）的画师禁止 Passkey 登录——
  // 与 requireAuth/requireAdmin 门禁同语义：未绑定不允许持有/获得任何有效会话。
  // 抛 TOTP_BIND_REQUIRED 而非 WEBAUTHN_*：login-verify 路由只吞 WEBAUTHN_* 两码，本码原样透传给前端。
  if (!artist.totp_verified) {
    throw new AppError(E.TOTP_BIND_REQUIRED, 401)
  }

  // 验证认证响应
  const verificationOpts: VerifyAuthenticationResponseOpts = {
    response: credential as AuthenticationResponseJSON,
    expectedChallenge: challengeFromClient,
    expectedOrigin: origin,
    expectedRPID: rpId,
    // 显式声明（库默认即 true）：与下发侧 userVerification='required' 两侧一致
    requireUserVerification: true,
    credential: {
      id: credentialRow.credential_id,
      publicKey: Buffer.from(credentialRow.public_key, 'base64url'),
      counter: credentialRow.counter,
      transports: ['internal', 'hybrid', 'usb', 'nfc', 'ble'] as const
    }
  }

  const verification = await verifyAuthenticationResponse(verificationOpts)
  if (!verification.verified) {
    throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
  }

  const { authenticationInfo } = verification
  // counter 递增校验（防克隆）——平台验证器永远上报 0 时跳过（见 isCounterRegression 注释）
  if (isCounterRegression(authenticationInfo.newCounter, credentialRow.counter)) {
    throw new AppError(E.WEBAUTHN_AUTHENTICATION_FAILED, 401)
  }

  // 更新 counter 和 last_used_at
  db.prepare(`
    UPDATE webauthn_credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?
  `).run(authenticationInfo.newCounter, credentialRow.id)

  return { artist, credentialRow }
}

// ─── 凭据管理（登录态） ───

/** 更新凭据设备名 */
export function updateCredentialName(credentialPkId: number, artistId: number, deviceName: string): WebAuthnCredentialRow {
  const row = db.prepare('SELECT * FROM webauthn_credentials WHERE id = ? AND artist_id = ?').get(credentialPkId, artistId) as WebAuthnCredentialRow | undefined
  if (!row) throw new AppError(E.WEBAUTHN_CREDENTIAL_NOT_FOUND, 404)
  db.prepare('UPDATE webauthn_credentials SET device_name = ? WHERE id = ?').run(deviceName, credentialPkId)
  return db.prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(credentialPkId) as WebAuthnCredentialRow
}

/** 删除凭据 */
export function deleteCredential(credentialPkId: number, artistId: number): void {
  const row = db.prepare('SELECT * FROM webauthn_credentials WHERE id = ? AND artist_id = ?').get(credentialPkId, artistId)
  if (!row) throw new AppError(E.WEBAUTHN_CREDENTIAL_NOT_FOUND, 404)
  db.prepare('DELETE FROM webauthn_credentials WHERE id = ?').run(credentialPkId)
}

// ─── 设备名生成 ───

export function generateDeviceNameFromUA(ua?: string): string {
  if (!ua) return '设备 ' + crypto.randomUUID().slice(0, 8)
  const browser = extractBrowser(ua)
  const os = extractOS(ua)
  return `${browser} · ${os}`
}

function extractBrowser(ua: string): string {
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/')) return 'Safari'
  return '浏览器'
}

function extractOS(ua: string): string {
  if (ua.includes('Windows NT 10')) return 'Windows 10'
  if (ua.includes('Windows NT 11')) return 'Windows 11'
  if (ua.includes('Mac OS X')) return 'macOS'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('Linux')) return 'Linux'
  return '桌面'
}
