// F0170：金额工具单一事实源回归——非有限值消毒 + 精确十进制舍入
import { describe, it, expect } from 'vitest'
import { yuanToCents, formatCents, formatYuan } from '../utils/money'

describe('yuanToCents 非有限值消毒与精确舍入（F0168/F0169/F0170）', () => {
  it('TC-MONEY-07: ±Infinity / NaN / 非法字符串 / null / undefined 一律归 0', () => {
    expect(yuanToCents(Infinity)).toBe(0)
    expect(yuanToCents(-Infinity)).toBe(0)
    expect(yuanToCents(NaN)).toBe(0)
    expect(yuanToCents('abc')).toBe(0)
    expect(yuanToCents(null)).toBe(0)
    expect(yuanToCents(undefined)).toBe(0)
    expect(yuanToCents('')).toBe(0)
  })

  it('TC-MONEY-08: 三位小数不因 IEEE754 截断少算 1 分', () => {
    expect(yuanToCents(1.005)).toBe(101)
    expect(yuanToCents(8.215)).toBe(822)
    expect(yuanToCents(2.675)).toBe(268)
    expect(yuanToCents('1.005')).toBe(101)
    expect(yuanToCents('8.215')).toBe(822)
  })

  it('TC-MONEY-09: 常规口径与整数/负数保持一致', () => {
    expect(yuanToCents('8.21')).toBe(821)
    expect(yuanToCents(80)).toBe(8000)
    expect(yuanToCents(0)).toBe(0)
    expect(yuanToCents(-12.5)).toBe(-1250)
  })

  it('TC-MONEY-10: 指数记法金额仍按十进制移位（整数末尾 0 不被吞）', () => {
    expect(yuanToCents('1e5')).toBe(10000000)
    expect(yuanToCents(1e21)).toBe(1e23)
    expect(yuanToCents(1e-7)).toBe(0)
  })

  it('TC-MONEY-11: 展示函数与转换共用同一消毒事实源', () => {
    expect(formatCents(Infinity)).toBe('0.00')
    expect(formatYuan(NaN)).toBe('¥0.00')
  })
})
