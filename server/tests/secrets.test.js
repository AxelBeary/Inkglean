// ============================================
// 815 审计拍板 #12：弱会话密钥判定回归
// 生产 fail-fast 的共享口径（auth.service / file-sign / app.ts cookie 三处复用）
// ============================================
import { describe, it, expect } from 'vitest'
import { isWeakSessionSecret } from '../src/shared/secrets.js'

describe('弱会话密钥判定 (拍板 #12)', () => {
  it('dev- 前缀一律判弱（本机事故的弱值形态）', () => {
    expect(isWeakSessionSecret('dev-secret-abcdef0123456789abcdef0123456789abcdef')).toBe(true)
    expect(isWeakSessionSecret('dev-')).toBe(true)
  })

  it('已知默认值与空值判弱', () => {
    expect(isWeakSessionSecret('dev-cookie-secret-change-in-production')).toBe(true)
    expect(isWeakSessionSecret('')).toBe(true)
  })

  it('长度不足 32 判弱（即使非 dev 前缀）', () => {
    expect(isWeakSessionSecret('a'.repeat(31))).toBe(true)
  })

  it('强随机值（install.mjs 生成的 64 位 hex 形态）判强', () => {
    expect(isWeakSessionSecret('a'.repeat(64))).toBe(false)
    expect(isWeakSessionSecret('6949ef' + '0'.repeat(58))).toBe(false)
  })
})
