// F0310: 散单收入页金额换算回归（元→整数分）
import { describe, it, expect } from 'vitest'
import { toStandaloneAmountCents } from '../standaloneAmount'

describe('toStandaloneAmountCents（F0310）', () => {
  it('正常金额元→分', () => {
    expect(toStandaloneAmountCents(8.21)).toBe(821)
    expect(toStandaloneAmountCents('100')).toBe(10000)
  })
  it('非法/非正金额返回 0（由上游校验拦截）', () => {
    expect(toStandaloneAmountCents(null)).toBe(0)
    expect(toStandaloneAmountCents('')).toBe(0)
    expect(toStandaloneAmountCents(0)).toBe(0)
    expect(toStandaloneAmountCents(-5)).toBe(0)
    expect(toStandaloneAmountCents('abc')).toBe(0)
  })
})
