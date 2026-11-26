// ============================================
// 815 审计拍板 #12：弱会话密钥判定回归
// 生产 fail-fast 的共享口径（auth.service / file-sign / app.ts cookie 三处复用）
// ============================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { isWeakSessionSecret } from '../src/shared/secrets.js'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src')

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

  // F0156（B6）: 32 位以上的低熵可预测密钥必须判弱——只看长度会放行
  it('低熵长串判弱：单一字符重复（原判强，F0156 修正）', () => {
    expect(isWeakSessionSecret('a'.repeat(64))).toBe(true)
  })

  it('低熵长串判弱：去重字符不足 4（ab/abc 循环）', () => {
    expect(isWeakSessionSecret('ab'.repeat(32))).toBe(true)
    expect(isWeakSessionSecret('abc'.repeat(22) + 'a')).toBe(true)
  })

  it('低熵长串判弱：≤16 字符短周期整串重复', () => {
    expect(isWeakSessionSecret('abcd'.repeat(16))).toBe(true)
    expect(isWeakSessionSecret('12345678'.repeat(8))).toBe(true)
  })

  it('PR114 MINOR-8: 非整除周期的低熵形态不再漏判（长度 43、周期 2 覆盖 40 位）', () => {
    // 旧判据只在 length % period === 0 时比对整串 → 43 % 2 != 0 漏判强
    expect(isWeakSessionSecret('A'.repeat(40) + 'bcd')).toBe(true)
    expect(isWeakSessionSecret('ab'.repeat(20) + 'cd')).toBe(true)
  })

  it('强随机值（install.mjs 生成的 64 位 hex 形态）判强（低熵检测不得误伤）', () => {
    // 去重字符 ≥4 且无短周期的混合 hex——真实随机形态
    expect(isWeakSessionSecret('6949ef3a1c7d5b0f8e2a4c6d9b1f3e5a7c0d8b2f4e6a1c9d3b5f7e2a4c0d8b6f')).toBe(false)
    // '6949ef' 前缀 + 尾零的合成 hex 形态：6 种字符、无短周期整串重复，维持原判强口径不回归
    expect(isWeakSessionSecret('6949ef' + '0'.repeat(58))).toBe(false)
  })

  it('四处判据统一：三处生产 fail-fast + admin health 自检都调用共享谓词', () => {
    const sites = [
      'features/auth/auth.service.ts',
      'app.ts',
      'shared/idempotency.ts',
      'features/admin/health.service.ts'
    ]
    for (const site of sites) {
      const text = readFileSync(resolve(SRC, site), 'utf8')
      expect(text, `${site} 必须复用 isWeakSessionSecret`).toContain('isWeakSessionSecret')
    }
    // health 不得再保留各自为政的旧三口径
    const health = readFileSync(resolve(SRC, 'features/admin/health.service.ts'), 'utf8')
    expect(health).not.toContain('DEFAULTS.includes(secret)')
  })
})
