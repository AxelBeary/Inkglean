/**
 * WebAuthn / Passkey 二进制字段编解码（REQ-040，812-B5）
 *
 * 后端 @simplewebauthn/server 以下发/接收 Base64URL 字符串（RFC 4648 §5：
 * URL-safe 字母表 + 去填充），浏览器原生 navigator.credentials API 则要求
 * BufferSource（ArrayBuffer / TypedArray）。本模块是两端口径的唯一转换点。
 */

import type { WebAuthnLoginOptions, WebAuthnRegisterOptions } from '../api/types'

/** Base64URL 字符串 → ArrayBuffer（浏览器 WebAuthn 要求的 BufferSource） */
export function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return buffer
}

/** ArrayBuffer（或 Uint8Array）→ Base64URL 字符串（后端 verify 口径，无填充） */
export function arrayBufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 后端下发登录选项（Base64URL 字符串）→ navigator.credentials.get 可用的请求选项 */
export function toCredentialRequestOptions(options: WebAuthnLoginOptions): PublicKeyCredentialRequestOptions {
  const request: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToBuffer(options.challenge)
  }
  if (options.timeout !== undefined) request.timeout = options.timeout
  if (options.rpId !== undefined) request.rpId = options.rpId
  if (options.userVerification !== undefined) {
    request.userVerification = options.userVerification as UserVerificationRequirement
  }
  if (options.allowCredentials?.length) {
    request.allowCredentials = options.allowCredentials.map((cred) => {
      const descriptor: PublicKeyCredentialDescriptor = {
        id: base64UrlToBuffer(cred.id),
        type: cred.type as PublicKeyCredentialType
      }
      if (cred.transports?.length) descriptor.transports = cred.transports as AuthenticatorTransport[]
      return descriptor
    })
  }
  return request
}

/** 后端下发注册选项（Base64URL 字符串）→ navigator.credentials.create 可用的创建选项 */
export function toCredentialCreationOptions(options: WebAuthnRegisterOptions): PublicKeyCredentialCreationOptions {
  const creation: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToBuffer(options.challenge),
    rp: { name: options.rp.name, id: options.rp.id },
    user: {
      id: base64UrlToBuffer(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName
    },
    pubKeyCredParams: options.pubKeyCredParams.map((param) => ({
      type: param.type as PublicKeyCredentialType,
      alg: param.alg
    }))
  }
  if (options.timeout !== undefined) creation.timeout = options.timeout
  if (options.excludeCredentials?.length) {
    creation.excludeCredentials = options.excludeCredentials.map((cred) => {
      const descriptor: PublicKeyCredentialDescriptor = {
        id: base64UrlToBuffer(cred.id),
        type: cred.type as PublicKeyCredentialType
      }
      if (cred.transports?.length) descriptor.transports = cred.transports as AuthenticatorTransport[]
      return descriptor
    })
  }
  if (options.authenticatorSelection) {
    const sel = options.authenticatorSelection
    const selection: AuthenticatorSelectionCriteria = {}
    if (sel.authenticatorAttachment !== undefined) {
      selection.authenticatorAttachment = sel.authenticatorAttachment as AuthenticatorAttachment
    }
    if (sel.residentKey !== undefined) selection.residentKey = sel.residentKey as ResidentKeyRequirement
    if (sel.userVerification !== undefined) {
      selection.userVerification = sel.userVerification as UserVerificationRequirement
    }
    creation.authenticatorSelection = selection
  }
  if (options.attestation !== undefined) {
    creation.attestation = options.attestation as AttestationConveyancePreference
  }
  return creation
}

/** 上报后端的凭据 JSON 形状（与 @simplewebauthn/server 的 JSON 输入口径一致） */
export interface WebAuthnCredentialJSON {
  id: string
  rawId: string
  type: string
  response: Record<string, string | null>
  clientExtensionResults: AuthenticationExtensionsClientOutputs
}

/**
 * 原生 PublicKeyCredential → 后端 JSON 形状。
 * id 直接用浏览器给出的 Base64URL DOMString；rawId / response.* 的 ArrayBuffer
 * 全部转 Base64URL（请求体走 JSON 文本，字符串字段不会在序列化中丢二进制内容）。
 */
export function publicKeyCredentialToJSON(credential: PublicKeyCredential): WebAuthnCredentialJSON {
  const response: Record<string, string | null> = {}
  const nativeResponse = credential.response
  if (nativeResponse instanceof AuthenticatorAttestationResponse) {
    response.attestationObject = arrayBufferToBase64Url(nativeResponse.attestationObject)
    response.clientDataJSON = arrayBufferToBase64Url(nativeResponse.clientDataJSON)
  } else if (nativeResponse instanceof AuthenticatorAssertionResponse) {
    response.authenticatorData = arrayBufferToBase64Url(nativeResponse.authenticatorData)
    response.clientDataJSON = arrayBufferToBase64Url(nativeResponse.clientDataJSON)
    response.signature = arrayBufferToBase64Url(nativeResponse.signature)
    response.userHandle = nativeResponse.userHandle
      ? arrayBufferToBase64Url(nativeResponse.userHandle)
      : null
  }
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response,
    clientExtensionResults: credential.getClientExtensionResults()
  }
}

/** 浏览器侧 WebAuthn 取消类错误（用户主动取消 / AbortError） */
export function isWebAuthnCancellation(err: unknown): boolean {
  const name = err instanceof Error ? err.name : ''
  return name === 'NotAllowedError' || name === 'AbortError'
}

/**
 * 浏览器侧 WebAuthn 真·能力缺失（NotSupportedError）。
 *
 * 2026-11-27 报障修复（Edge Dev 无法注册 Passkey）：旧实现把 SecurityError 一并算作
 * 「浏览器不支持」，于是 rp.id 与访问域名不一致 / rp.id 非法时，用户看到的是
 * 「当前浏览器不支持 Passkey（需 HTTPS 或 localhost）」——而该页面本就运行在 HTTPS 下
 * 且 PublicKeyCredential 可用（否则注册按钮根本不会渲染）。提示指错了排查方向。
 * SecurityError 归因独立走 isWebAuthnSecurityError / checkRpId。
 */
export function isWebAuthnUnsupported(err: unknown): boolean {
  return err instanceof Error && err.name === 'NotSupportedError'
}

/** 浏览器侧 WebAuthn 安全域拒绝（SecurityError：rp.id 非法或与当前域名不匹配等） */
export function isWebAuthnSecurityError(err: unknown): boolean {
  return err instanceof Error && err.name === 'SecurityError'
}

/** rp.id 与访问域名的问题类型（null = 无问题） */
export type WebAuthnRpIdProblem = 'ip-host' | 'rp-id-empty' | 'rp-id-invalid' | 'rp-id-mismatch' | null

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * 访问域名是否为「不能用 Passkey 的裸 IP」。
 * 实测（Edge Dev 160 / Edge 158 / Chromium 159 三端一致）：https + 127.0.0.1 源上
 * rp.id=127.0.0.1 与缺省 rp.id 均抛 SecurityError「This is an invalid domain.」——
 * 浏览器不接受 IP 形式的 rp.id，裸 IP 源上 Passkey 不可能成功，必须换域名访问。
 */
export function isIpHostname(hostname: string): boolean {
  const host = (hostname || '').trim().toLowerCase()
  return IPV4_RE.test(host) || host.startsWith('[') || host.includes(':')
}

/**
 * rp.id 必须是当前域名的父域或同名域（WebAuthn 规范的 registrable domain suffix 关系）。
 * 例：rp.id=example.com 对 host=a.example.com 成立；对 host=a.example.net 不成立。
 */
export function isRpIdSuffixOfHost(rpId: string, hostname: string): boolean {
  const rp = (rpId || '').trim().toLowerCase().replace(/\.$/, '')
  const host = (hostname || '').trim().toLowerCase().replace(/\.$/, '')
  if (!rp || !host) return false
  return host === rp || host.endsWith(`.${rp}`)
}

/**
 * 仪式前置校验：在调用 navigator.credentials 之前先判 rp.id 与当前访问域名，
 * 把「浏览器只会给一句 SecurityError」变成可执行的归因。
 * 返回 null 表示通过；否则返回具体问题类型。
 */
export function checkRpId(rpId: string | undefined, hostname: string): WebAuthnRpIdProblem {
  // IP 源优先判：浏览器不接受 IP 形式的 rp.id，缺省回落当前主机同样立即失败，与 rp.id 有无无关
  if (isIpHostname(hostname)) return 'ip-host'
  // 未下发 rp.id/rpId 时浏览器回落「当前域名」，此时无需再校验（认证侧 rpId 本就可选）
  if (rpId === undefined) return null
  const rp = (rpId || '').trim().toLowerCase().replace(/\.$/, '')
  if (!rp) return 'rp-id-empty'
  // rp.id 被配成 IP（常见成因：反向代理没传对 Host，服务端按 request.host 推导出 127.0.0.1）
  if (isIpHostname(rp)) return 'rp-id-invalid'
  // 只接受裸域名：带协议/端口/路径或 IP 的写法浏览器一律判 invalid domain。
  // 单标签域名（localhost）合法——实测 rp.id=localhost 在 https://localhost 源上可注册成功
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(rp)) return 'rp-id-invalid'
  if (!isRpIdSuffixOfHost(rp, hostname)) return 'rp-id-mismatch'
  return null
}

/**
 * 归因 → i18n 键（单源映射，避免各调用点各写一份三元）。
 * 只分两类是因为「谁来处理」不同，而非技术细节不同：
 * - ip-host：访客自己换域名访问即可解决
 * - 其余三项：服务端 rp.id 配置有误，需管理员改配置（空值/非法/IP 形/与域名不符，对用户而言都是同一件事）
 * 与 http.ts 的 `errors.${code}` 同口径：键的拼装收敛在就近的一层，调用点只负责展示。
 */
export function rpIdProblemKey(problem: Exclude<WebAuthnRpIdProblem, null>): string {
  return problem === 'ip-host' ? 'account.passkeyDomainIpHost' : 'account.passkeyDomainMisconfigured'
}

/** 后端 ApiError 类型守卫（带 code，message 已经 i18n 拦截器翻译） */
export function isBackendError(
  err: unknown
): err is { code: string; message?: string; detail?: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string'
}
