// 2026-11-27 报障回归：Edge Dev 无法注册 Passkey
// 实测基线（Edge Dev 160.0.4416.0 / Edge 158.0.4370.33 / Chromium 159，三端一致）：
//   · https + 域名源，rp.id = 当前域名            → 注册成功
//   · https + 域名源，rp.id = 不相关的域名        → SecurityError（旧前端报成「浏览器不支持」）
//   · https + 127.0.0.1 源，rp.id 缺省或 = IP 串  → SecurityError「This is an invalid domain.」
// 本文件把前置归因（checkRpId）的行为锁死，防止提示再次退化。
import { describe, it, expect } from 'vitest'
import { checkRpId, isIpHostname, isRpIdSuffixOfHost, isWebAuthnSecurityError, isWebAuthnUnsupported } from '../webauthn'

describe('isIpHostname', () => {
  it('IPv4 判为 IP', () => {
    expect(isIpHostname('127.0.0.1')).toBe(true)
    expect(isIpHostname('192.168.3.4')).toBe(true)
  })

  it('域名与 localhost 不算 IP', () => {
    expect(isIpHostname('localhost')).toBe(false)
    expect(isIpHostname('shihui.example.com')).toBe(false)
  })
})

describe('isRpIdSuffixOfHost', () => {
  it('同名域通过', () => {
    expect(isRpIdSuffixOfHost('example.com', 'example.com')).toBe(true)
  })

  it('父域通过（子域访问 apex 配置）', () => {
    expect(isRpIdSuffixOfHost('example.com', 'shihui.example.com')).toBe(true)
  })

  it('后缀相似但非父域拒绝', () => {
    expect(isRpIdSuffixOfHost('example.com', 'notexample.com')).toBe(false)
    expect(isRpIdSuffixOfHost('example.com', 'example.com.evil.net')).toBe(false)
  })
})

describe('checkRpId（仪式前置归因）', () => {
  it('IP 源访问 → ip-host（浏览器一律拒绝，实测三端一致）', () => {
    expect(checkRpId('127.0.0.1', '127.0.0.1')).toBe('ip-host')
    expect(checkRpId(undefined, '192.168.3.4')).toBe('ip-host')
  })

  it('rp.id 与本域不符 → rp-id-mismatch（生产最常见成因：WEBAUTHN_ORIGIN/RP_ID 配错）', () => {
    expect(checkRpId('example.com', 'shihui.other.cfd')).toBe('rp-id-mismatch')
  })

  it('rp.id 带端口/协议等非法写法 → rp-id-invalid', () => {
    expect(checkRpId('example.com:443', 'example.com')).toBe('rp-id-invalid')
    expect(checkRpId('https://example.com', 'example.com')).toBe('rp-id-invalid')
  })

  it('rp.id 被配成 IP（反代没传对 Host 的典型症状）→ rp-id-invalid', () => {
    expect(checkRpId('127.0.0.1', 'shihui.example.com')).toBe('rp-id-invalid')
  })

  it('rp.id 为空串 → rp-id-empty', () => {
    expect(checkRpId('', 'example.com')).toBe('rp-id-empty')
  })

  it('匹配时通过（含 localhost 单标签域名与子域访问）', () => {
    expect(checkRpId('shihui.example.com', 'shihui.example.com')).toBeNull()
    expect(checkRpId('example.com', 'shihui.example.com')).toBeNull()
    expect(checkRpId('localhost', 'localhost')).toBeNull()
  })

  it('缺省 rp.id → 通过（认证选项 rpId 可选，浏览器回落当前域名）', () => {
    expect(checkRpId(undefined, 'example.com')).toBeNull()
  })
})

describe('错误分类（SecurityError 不得再被当成「浏览器不支持」）', () => {
  it('SecurityError 只由 isWebAuthnSecurityError 命中', () => {
    const err = Object.assign(new Error('This is an invalid domain.'), { name: 'SecurityError' })
    expect(isWebAuthnSecurityError(err)).toBe(true)
    expect(isWebAuthnUnsupported(err)).toBe(false)
  })

  it('NotSupportedError 仍由 isWebAuthnUnsupported 命中', () => {
    const err = Object.assign(new Error('no webauthn'), { name: 'NotSupportedError' })
    expect(isWebAuthnUnsupported(err)).toBe(true)
    expect(isWebAuthnSecurityError(err)).toBe(false)
  })
})
