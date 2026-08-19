import { describe, it, expect } from 'vitest'
import {
  base32Encode,
  base32Decode,
  generateSecret,
  computeTotp,
  computeTotpAtCounter,
  verifyTotp,
  buildOtpAuthUri,
  TOTP_STEP_SECONDS
} from '../src/features/auth/totp.js'

describe('TOTP 核心（RFC 6238 / RFC 4226 / RFC 4648）', () => {

  // ─── Base32（RFC 4648） ───

  it('TC-TOTP-01: RFC 4648 标准向量 — ASCII "12345678901234567890" → Base32', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii')
    expect(base32Encode(buf)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('TC-TOTP-02: Base32 解码是编码的逆运算', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii')
    const encoded = base32Encode(buf)
    expect(base32Decode(encoded)!.toString('ascii')).toBe('12345678901234567890')
  })

  it('TC-TOTP-03: Base32 解码容错 — 小写 / 空格 / 连字符', () => {
    const buf = Buffer.from('Hello!', 'ascii')
    const encoded = base32Encode(buf)
    expect(base32Decode(encoded.toLowerCase())).toEqual(buf)
    expect(base32Decode(encoded.replace(/(.{4})/g, '$1 ').trim())).toEqual(buf)
    expect(base32Decode(encoded.replace(/(.{4})/g, '$1-').replace(/-$/, ''))).toEqual(buf)
  })

  it('TC-TOTP-04: Base32 解码非法字符返回 null', () => {
    expect(base32Decode('GEZDGNB!')).toBeNull()
    expect(base32Decode('')).toBeNull()
    expect(base32Decode('1234')).toBeNull() // 1 不是 Base32 字符
  })

  // ─── RFC 6238 官方测试向量（附录 B，SHA1） ───

  // 官方向量密钥：ASCII "12345678901234567890"（20 字节）
  const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  // [时间戳（秒）, 8 位官方码 → 6 位截断]
  const RFC_VECTORS: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130']
  ]

  it('TC-TOTP-05: RFC 6238 官方测试向量全部通过（6 位）', () => {
    for (const [ts, expected] of RFC_VECTORS) {
      expect(computeTotp(RFC_SECRET, ts * 1000)).toBe(expected)
    }
  })

  it('TC-TOTP-06: computeTotpAtCounter 与 computeTotp 等价', () => {
    const ts = 1234567890
    const counter = Math.floor(ts / TOTP_STEP_SECONDS)
    expect(computeTotpAtCounter(RFC_SECRET, counter)).toBe(computeTotp(RFC_SECRET, ts * 1000))
  })

  // ─── 密钥生成 ───

  it('TC-TOTP-07: generateSecret 生成 32 字符合法 Base32', () => {
    const secret = generateSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    // 解码不抛错
    expect(base32Decode(secret)).not.toBeNull()
  })

  it('TC-TOTP-08: 两次生成密钥不同（160 bit 随机）', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })

  // ─── ±1 窗口校验 ───

  it('TC-TOTP-09: 当前窗口码验证通过', () => {
    const secret = generateSecret()
    const now = Date.now()
    const code = computeTotp(secret, now)
    expect(verifyTotp(secret, code, now)).toBe(true)
  })

  it('TC-TOTP-10: ±1 窗口容忍（前后各 30 秒）', () => {
    const secret = generateSecret()
    const now = Date.now()
    // 前一个窗口的码（30 秒前）
    const prevCode = computeTotp(secret, now - 30_000)
    expect(verifyTotp(secret, prevCode, now)).toBe(true)
    // 后一个窗口的码（30 秒后）
    const nextCode = computeTotp(secret, now + 30_000)
    expect(verifyTotp(secret, nextCode, now)).toBe(true)
  })

  it('TC-TOTP-11: 超出 ±1 窗口（60 秒前）拒绝', () => {
    const secret = generateSecret()
    const now = Date.now()
    const oldCode = computeTotp(secret, now - 60_000)
    expect(verifyTotp(secret, oldCode, now)).toBe(false)
  })

  it('TC-TOTP-12: 错误码拒绝；非 6 位数字不崩溃', () => {
    const secret = generateSecret()
    const now = Date.now()
    expect(verifyTotp(secret, '000000', now)).toBe(false)
    expect(verifyTotp(secret, '', now)).toBe(false)
    expect(verifyTotp(secret, '12345', now)).toBe(false)
    expect(verifyTotp(secret, '1234567', now)).toBe(false)
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false)
  })

  // ─── otpauth URI ───

  it('TC-TOTP-13: otpauth URI 格式正确（可被验证器 App 解析）', () => {
    const uri = buildOtpAuthUri('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '12345')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(uri).toContain('issuer=')
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })

  it('TC-TOTP-14: otpauth URI 对特殊字符做编码', () => {
    const uri = buildOtpAuthUri('AAAA', '12345', '绘约/测试')
    expect(uri).toContain(encodeURIComponent('绘约/测试'))
  })
})
