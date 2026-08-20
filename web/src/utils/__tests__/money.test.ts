// 817 科学计数法消毒回归：money.js 展示函数绝不输出 e/E 形态，非法输入归 0
import { describe, it, expect } from 'vitest'
import {
  formatCents, formatYuan, formatYuanValue, formatAddonPrice, formatYuanTrimmed, yuanToCents
} from '../money'

describe('money.js 科学计数法消毒（817）', () => {
  it('TC-MONEY-01: formatYuanValue 极大值不走科学计数法', () => {
    expect(formatYuanValue(1e21)).toBe('¥1000000000000000000000')
    expect(formatYuanValue(1.5e22)).toBe('¥15000000000000000000000')
    expect(formatYuanValue('1e5')).toBe('¥100000')
  })

  it('TC-MONEY-02: formatYuanValue 常规口径不变（整数裁剪/两位小数/负数）', () => {
    expect(formatYuanValue(80)).toBe('¥80')
    expect(formatYuanValue(80.5)).toBe('¥80.50')
    expect(formatYuanValue(-12)).toBe('¥-12.00')
    expect(formatYuanValue(null)).toBe('¥0')
    expect(formatYuanValue('abc')).toBe('¥0')
    expect(formatYuanValue(Infinity)).toBe('¥0')
  })

  it('TC-MONEY-03: formatAddonPrice 三形态均消毒', () => {
    expect(formatAddonPrice(20, 'percent')).toBe('+20%')
    expect(formatAddonPrice(1e21, 'percent')).toBe('+1000000000000000000000%')
    expect(formatAddonPrice(80, 'fixed', { controlType: 'quantity', unitLabel: '位' })).toBe('¥80/位')
    expect(formatAddonPrice('1e3', 'fixed')).toBe('¥1000')
    expect(formatAddonPrice(NaN, 'fixed')).toBe('¥0')
  })

  it('TC-MONEY-04: formatYuanTrimmed 分值极大/非法均消毒（无 e/E，浮点真值直出）', () => {
    expect(formatYuanTrimmed(8000)).toBe('¥80')
    expect(formatYuanTrimmed(8050)).toBe('¥80.50')
    const huge = formatYuanTrimmed(1e23)
    expect(huge).not.toMatch(/e/i)
    expect(huge.startsWith('¥999999999999999')).toBe(true) // 1e23/100 的浮点真值普通定点展开
    expect(formatYuanTrimmed('abc')).toBe('¥0')
    expect(formatYuanTrimmed(null)).toBe('¥0')
  })

  it('TC-MONEY-05: formatCents/formatYuan 极大分值消毒（无 e/E）', () => {
    expect(formatCents(8050)).toBe('80.50')
    const hugeCents = formatCents(1e23)
    expect(hugeCents).not.toMatch(/e/i)
    expect(hugeCents.endsWith('.00')).toBe(true)
    expect(formatCents(NaN)).toBe('0.00')
    expect(formatYuan(1e23)).toBe(`¥${hugeCents}`)
  })

  it('TC-MONEY-06: yuanToCents 口径不变', () => {
    expect(yuanToCents('8.21')).toBe(821)
    expect(yuanToCents('abc')).toBe(0)
  })
})
