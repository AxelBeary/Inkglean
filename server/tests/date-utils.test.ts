import { describe, it, expect } from 'vitest'
import { toSqliteDate, localDayStartSqlite, localDayEndSqlite, localMonthStartSqlite, localDateRangeToUtc, isValidLocalDateString, parseSqliteUtcDate } from '../src/utils/date.js'

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

  it('TC-DU-09: d3 P2——历法回读拒绝 2026-02-31，localDateRangeToUtc 同步抛 400', () => {
    expect(isValidLocalDateString('2026-02-31')).toBe(false)
    expect(() => localDateRangeToUtc('2026-02-31', '2026-03-01')).toThrow('VALIDATION')
  })

  it('TC-DU-10: d3 P2——0099 年不再被 JS 映射到 1999 年代', () => {
    expect(isValidLocalDateString('0099-01-01')).toBe(true)
    const r = localDateRangeToUtc('0099-01-01', '0099-01-02')
    expect(r.startUtc.startsWith('1999-')).toBe(false)
    expect(r.endUtcExclusive.startsWith('1999-')).toBe(false)
  })

  // F0160: parseSqliteUtcDate 支撑 TOTP 重绑冷却与本地日分组，补单测钉死 UTC 解析口径
  it('TC-DU-11 (F0160): parseSqliteUtcDate 按 UTC 解析 SQLite 空格格式', () => {
    const d = parseSqliteUtcDate('2026-08-01 14:30:00')
    expect(d.toISOString()).toBe('2026-08-01T14:30:00.000Z')
  })

  it('TC-DU-12 (F0160): parseSqliteUtcDate 兼容 T 分隔符与小数秒', () => {
    expect(parseSqliteUtcDate('2026-08-01T14:30:00').toISOString()).toBe('2026-08-01T14:30:00.000Z')
    expect(parseSqliteUtcDate('2026-08-01 14:30:00.123').toISOString()).toBe('2026-08-01T14:30:00.123Z')
  })

  // F0158: 非字符串 / 非 SQLite 形态返回 Invalid Date，不再抛 TypeError 或静默产出非法 Date
  it('TC-DU-13 (F0158): 非法输入返回 Invalid Date 而非抛错', () => {
    expect(Number.isNaN(parseSqliteUtcDate('garbage').getTime())).toBe(true)
    expect(Number.isNaN(parseSqliteUtcDate(null as unknown as string).getTime())).toBe(true)
    expect(Number.isNaN(parseSqliteUtcDate('').getTime())).toBe(true)
  })

  // F0159: 反向区间显式拒绝
  it('TC-DU-14 (F0159): from > to 抛 VALIDATION', () => {
    expect(() => localDateRangeToUtc('2026-03-02', '2026-03-01')).toThrow('VALIDATION')
  })
})
