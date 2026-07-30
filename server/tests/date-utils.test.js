import { describe, it, expect } from 'vitest'
import { toSqliteDate, nowSqlite, localDayStartSqlite, localDayEndSqlite, localMonthStartSqlite } from '../src/utils/date.js'

// ============================================
// 日期工具函数测试（技术债 B3）
// 时区敏感，需覆盖边界情况
// ============================================

describe('日期工具 (utils/date.js)', () => {

  it('TC-DU-01: toSqliteDate 输出 YYYY-MM-DD HH:MM:SS 格式', () => {
    const d = new Date('2026-08-01T14:30:00.000Z')
    expect(toSqliteDate(d)).toBe('2026-08-01 14:30:00')
  })

  it('TC-DU-02: toSqliteDate 无 T 分隔符（空格格式）', () => {
    const result = toSqliteDate(new Date('2026-01-15T00:00:00.000Z'))
    expect(result).not.toContain('T')
    expect(result).toBe('2026-01-15 00:00:00')
  })

  it('TC-DU-03: nowSqlite 返回当前时间字符串', () => {
    const result = nowSqlite()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('TC-DU-04: localDayStartSqlite 返回本地零点', () => {
    const now = new Date(2026, 7, 15, 14, 30, 0) // 2026-08-15 14:30 本地
    const result = localDayStartSqlite(now)
    // 本地零点对应的 UTC 时间（取决于时区偏移）
    const expected = toSqliteDate(new Date(2026, 7, 15, 0, 0, 0))
    expect(result).toBe(expected)
  })

  it('TC-DU-05: localDayEndSqlite 返回本地次日零点', () => {
    const now = new Date(2026, 7, 15, 23, 59, 59) // 接近午夜
    const result = localDayEndSqlite(now)
    const expected = toSqliteDate(new Date(2026, 7, 16, 0, 0, 0))
    expect(result).toBe(expected)
  })

  it('TC-DU-06: localMonthStartSqlite 返回本地月初', () => {
    const now = new Date(2026, 7, 15, 10, 0, 0) // 2026-08-15
    const result = localMonthStartSqlite(now)
    const expected = toSqliteDate(new Date(2026, 7, 1, 0, 0, 0))
    expect(result).toBe(expected)
  })

  it('TC-DU-07: 跨年边界——12月31日的 localDayEndSqlite 是次年1月1日', () => {
    const now = new Date(2026, 11, 31, 23, 0, 0) // 2026-12-31 23:00
    const result = localDayEndSqlite(now)
    const expected = toSqliteDate(new Date(2027, 0, 1, 0, 0, 0))
    expect(result).toBe(expected)
  })

  it('TC-DU-08: 跨月边界——1月31日的 localMonthStartSqlite 是1月1日', () => {
    const now = new Date(2026, 0, 31, 12, 0, 0) // 2026-01-31
    const result = localMonthStartSqlite(now)
    const expected = toSqliteDate(new Date(2026, 0, 1, 0, 0, 0))
    expect(result).toBe(expected)
  })
})
