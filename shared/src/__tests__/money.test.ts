// GIT-4 元 → 分半分误差回归：十进制字符串移位取分，非法/非有限输入归 0
import { describe, it, expect } from 'vitest'
import { yuanToCents } from '../utils/money'

describe('yuanToCents 元 → 分（十进制移位）', () => {
  it('TC-B2-MONEY-01: 半分误差向量不再少 1 分', () => {
    expect(yuanToCents(1.005)).toBe(101)
    expect(yuanToCents(0.145)).toBe(15)
    expect(yuanToCents(8.205)).toBe(821)
    expect(yuanToCents(8.21)).toBe(821)
  })

  it('TC-B2-MONEY-02: 负数取回符号，非法/非有限输入归 0', () => {
    expect(yuanToCents('abc')).toBe(0)
    expect(yuanToCents(-1.005)).toBe(-101)
    expect(yuanToCents(1e-7)).toBe(0)
    expect(yuanToCents(Infinity)).toBe(0)
  })
})
