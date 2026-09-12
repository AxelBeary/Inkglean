// API 边界 DTO · REQ-040 WebAuthn Passkey + TOTP 自助重绑（F-09 自 web/src/api/types.ts 按域纯搬移拆分，原段落文字一字未改）
// 形状以后端 routes/service 代码为唯一事实源；本文件经 api/types.ts（barrel）再导出，下游 import 路径不变

// ─── REQ-040: WebAuthn Passkey ───

/** WebAuthn 凭据行 */
export interface WebAuthnCredential {
  id: number
  artist_id: number
  credential_id: string
  public_key: string
  counter: number
  device_name: string | null
  created_at: string
  last_used_at: string | null
}

/** POST /api/auth/webauthn/register-options 响应（PublicKeyCredentialCreationOptions 镜像） */
export interface WebAuthnRegisterOptions {
  challenge: string
  rp: { name: string; id: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ type: string; alg: number }>
  timeout?: number
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>
  authenticatorSelection?: { authenticatorAttachment?: string; residentKey?: string; userVerification?: string }
  attestation?: string
}

/** POST /api/auth/webauthn/register-verify 响应 */
export interface WebAuthnRegisterVerifyResult {
  credential: WebAuthnCredential
}

/** POST /api/auth/webauthn/login-options 响应（PublicKeyCredentialRequestOptions 镜像） */
export interface WebAuthnLoginOptions {
  challenge: string
  timeout?: number
  rpId?: string
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>
  userVerification?: string
}

/** POST /api/auth/webauthn/login-verify 响应 */
export interface WebAuthnLoginVerifyResult {
  isAdmin: boolean
  artist: { id: number; name: string; subdomain: string; qqNumber: string }
}

/** GET /api/auth/webauthn/credentials 响应 */
export interface WebAuthnCredentialsResult {
  credentials: WebAuthnCredential[]
}

/** PATCH /api/auth/webauthn/credentials/:id 响应 */
export interface WebAuthnUpdateCredentialResult {
  credential: WebAuthnCredential
}

// ─── REQ-040: TOTP 自助重绑 ───

/** POST /api/auth/totp/rebind-init 响应（有 Passkey 路径）
 * a1 猎杀修复：身份验证走登录仪式（前端自行 loginOptions+credentials.get）；
 * 815 审计 P1-1 修复：init 阶段即下发 tempKey + 新密钥二维码，confirm 消费暂存值 */
export interface RebindInitPasskeyResult {
  verifyMethod: 'passkey'
  tempKey: string
  qrDataUrl: string | null
  otpauthUri: string
}

/** POST /api/auth/totp/rebind-init 响应（无 Passkey 路径） */
export interface RebindInitCodeResult {
  verifyMethod: 'code'
  tempKey: string
  qrDataUrl: string | null
  otpauthUri: string
}

export type RebindInitResult = RebindInitPasskeyResult | RebindInitCodeResult

/** POST /api/auth/totp/rebind-confirm 响应 */
export interface RebindConfirmResult {
  success: boolean
  message: string
}
