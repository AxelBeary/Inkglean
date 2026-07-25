import { describe, it, expect } from 'vitest'
import { clamp, isValidQq } from '../src/shared/validate.js'

describe('输入校验 (Validate)', () => {
  // TC-V-01: clamp 截断
  it('TC-V-01: 超长字符串被截断到限制长度', () => {
    const result = clamp('a'.repeat(100), 'qq')
    expect(result).toHaveLength(15)
  })

  // TC-V-02: clamp null 安全
  it('TC-V-02: null 输入返回 null', () => {
    expect(clamp(null, 'name')).toBeNull()
    expect(clamp(undefined, 'name')).toBeNull()
  })

  // TC-V-03: isValidQq 合法
  it('TC-V-03: 合法QQ号返回 true', () => {
    expect(isValidQq('12345')).toBe(true)
    expect(isValidQq('123456789012345')).toBe(true)
  })

  // TC-V-04: isValidQq 非法
  it('TC-V-04: 非法QQ号返回 false', () => {
    expect(isValidQq('1234')).toBe(false)
    expect(isValidQq('abc')).toBe(false)
    expect(isValidQq('')).toBe(false)
    expect(isValidQq(null)).toBe(false)
  })
})
