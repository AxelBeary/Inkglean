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
 * 全部转 Base64URL（axios JSON 序列化不会丢失二进制字段）。
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

/** 浏览器侧 WebAuthn 不支持类错误 */
export function isWebAuthnUnsupported(err: unknown): boolean {
  const name = err instanceof Error ? err.name : ''
  return name === 'NotSupportedError' || name === 'SecurityError'
}

/** 后端 ApiError 类型守卫（带 code，message 已经 i18n 拦截器翻译） */
export function isBackendError(
  err: unknown
): err is { code: string; message?: string; detail?: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string'
}
