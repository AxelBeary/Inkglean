// WebAuthn Base64URL 编解码测试（RFC 4648 §5 边界）
// 覆盖：无填充、URL-safe 字母表（- _）、空输入、ArrayBuffer 反向、往返一致
import { describe, it, expect } from 'vitest'
import {
  base64UrlToBuffer,
  arrayBufferToBase64Url,
  toCredentialRequestOptions,
  toCredentialCreationOptions
} from '../webauthn'

function bytesToArrayBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

describe('base64UrlToBuffer（RFC 4648 §5）', () => {
  it('空输入返回空 ArrayBuffer', () => {
    expect(base64UrlToBuffer('').byteLength).toBe(0)
  })

  it('无填充输入正确解码', () => {
    // 'hello' → base64 'aGVsbG8=' → base64url 去填充 'aGVsbG8'
    expect(new TextDecoder().decode(base64UrlToBuffer('aGVsbG8'))).toBe('hello')
  })

  it('含 - 字符（base64 的 +）正确解码', () => {
    // [0xFB, 0xEF, 0xBE] → base64 '++++' → base64url '----'
    expect(base64UrlToBuffer('----')).toEqual(bytesToArrayBuffer([0xFB, 0xEF, 0xBE]))
  })

  it('含 _ 字符（base64 的 /）正确解码', () => {
    // [0xFF, 0xFF, 0xFF] → base64 '////' → base64url '____'
    expect(base64UrlToBuffer('____')).toEqual(bytesToArrayBuffer([0xFF, 0xFF, 0xFF]))
  })

  it('容忍带 = 填充的输入（与去填充输入等价）', () => {
    expect(base64UrlToBuffer('aGVsbG8=')).toEqual(base64UrlToBuffer('aGVsbG8'))
  })
})

describe('arrayBufferToBase64Url（反向）', () => {
  it('空输入返回空字符串', () => {
    expect(arrayBufferToBase64Url(new ArrayBuffer(0))).toBe('')
  })

  it('无填充输出（去除 = 填充）', () => {
    expect(arrayBufferToBase64Url(new TextEncoder().encode('hello').buffer)).toBe('aGVsbG8')
  })

  it('输出 URL-safe 字母表（- 与 _）', () => {
    expect(arrayBufferToBase64Url(bytesToArrayBuffer([0xFB, 0xEF, 0xBE]))).toBe('----')
    expect(arrayBufferToBase64Url(bytesToArrayBuffer([0xFF, 0xFF, 0xFF]))).toBe('____')
  })

  it('接受 Uint8Array 入参', () => {
    expect(arrayBufferToBase64Url(new TextEncoder().encode('foo'))).toBe('Zm9v')
  })
})

describe('base64url 往返一致', () => {
  it('任意字节序列 解码→编码 后不变', () => {
    const source = new Uint8Array([0, 1, 2, 3, 4, 5, 0xFB, 0xEF, 0xBE, 0xFF, 0xFE, 0xFD])
    const encoded = arrayBufferToBase64Url(source)
    expect(new Uint8Array(base64UrlToBuffer(encoded))).toEqual(source)
  })
})

describe('toCredentialRequestOptions（get 下发方向）', () => {
  it('challenge/allowCredentials[].id 转为 ArrayBuffer，其余字段透传', () => {
    const opts = toCredentialRequestOptions({
      challenge: 'aGVsbG8',
      timeout: 60000,
      rpId: 'localhost',
      userVerification: 'preferred',
      allowCredentials: [{ id: 'Zm9v', type: 'public-key', transports: ['internal'] }]
    })
    expect(opts.challenge).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(opts.challenge)).toBe('hello')
    expect(opts.allowCredentials?.[0].id).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(opts.allowCredentials![0].id)).toBe('foo')
    expect(opts.allowCredentials?.[0].type).toBe('public-key')
    expect(opts.allowCredentials?.[0].transports).toEqual(['internal'])
    expect(opts.rpId).toBe('localhost')
    expect(opts.timeout).toBe(60000)
    expect(opts.userVerification).toBe('preferred')
  })

  it('缺省字段不写入', () => {
    const opts = toCredentialRequestOptions({ challenge: '' })
    expect(opts.allowCredentials).toBeUndefined()
    expect(opts.rpId).toBeUndefined()
    expect(opts.timeout).toBeUndefined()
    expect(opts.userVerification).toBeUndefined()
  })
})

describe('toCredentialCreationOptions（create 下发方向）', () => {
  it('challenge/user.id/excludeCredentials[].id 转为 ArrayBuffer，策略字段透传', () => {
    const opts = toCredentialCreationOptions({
      challenge: 'aGVsbG8',
      rp: { name: '绘约', id: 'localhost' },
      user: { id: 'dXNlcg', name: '123', displayName: '测试' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [{ id: 'Zm9v', type: 'public-key', transports: ['internal'] }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      attestation: 'none'
    })
    expect(opts.challenge).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(opts.challenge)).toBe('hello')
    expect(opts.user.id).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(opts.user.id)).toBe('user')
    expect(opts.excludeCredentials?.[0].id).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(opts.excludeCredentials![0].id)).toBe('foo')
    expect(opts.authenticatorSelection?.residentKey).toBe('preferred')
    expect(opts.authenticatorSelection?.userVerification).toBe('preferred')
    expect(opts.attestation).toBe('none')
  })

  it('缺省字段不写入', () => {
    const opts = toCredentialCreationOptions({
      challenge: '',
      rp: { name: 'x', id: 'localhost' },
      user: { id: '', name: '', displayName: '' },
      pubKeyCredParams: []
    })
    expect(opts.excludeCredentials).toBeUndefined()
    expect(opts.authenticatorSelection).toBeUndefined()
    expect(opts.attestation).toBeUndefined()
  })
})
