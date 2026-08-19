// datetime 工具函数测试（P2-1 时区工具）
// 确定性策略：期望值用与实现相同的 Date + toLocaleString 计算，
// 不依赖运行环境的具体时区/locale，任何机器上都成立。
import { describe, it, expect } from 'vitest'
import { formatDateTime, formatDateTimeShort } from '../datetime.js'

const FULL_OPTS: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }

/** 与实现相同的方式把 UTC 字符串转本地时间字符串 */
const local = (isoUtc: string, opts: Intl.DateTimeFormatOptions = FULL_OPTS): string => new Date(isoUtc).toLocaleString(undefined, opts)

describe('formatDateTime', () => {
  it('空值返回空串', () => {
    expect(formatDateTime(null as unknown as string)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime(undefined as unknown as string)).toBe('')
  })

  it('非法日期字符串原样返回（不崩溃）', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
    expect(formatDateTime('9999-99-99 99:99:99')).toBe('9999-99-99 99:99:99')
  })

  it('SQLite UTC 空格格式正确转本地时间（核心场景）', () => {
    // SQLite CURRENT_TIMESTAMP 存 'YYYY-MM-DD HH:MM:SS'（UTC），
    // 实现须补 T 和 Z 再解析，否则被当成本地时间产生时区偏差
    const input = '2026-08-01 10:30:00'
    expect(formatDateTime(input)).toBe(local('2026-08-01T10:30:00Z'))
  })

  it('ISO 8601 T 格式不重复追加 Z（按原样解析）', () => {
    const input = '2026-08-01T10:30:00'
    expect(formatDateTime(input)).toBe(local('2026-08-01T10:30:00'))
  })

  it('options 可覆盖默认格式', () => {
    const input = '2026-08-01 10:30:00'
    const expected = local('2026-08-01T10:30:00Z', { ...FULL_OPTS, year: undefined })
    expect(formatDateTime(input, { year: undefined })).toBe(expected)
  })
})

describe('formatDateTimeShort', () => {
  it('短格式不含年份', () => {
    const input = '2026-08-01 10:30:00'
    const expected = local('2026-08-01T10:30:00Z', { ...FULL_OPTS, year: undefined })
    expect(formatDateTimeShort(input)).toBe(expected)
  })

  it('空值返回空串', () => {
    expect(formatDateTimeShort(null as unknown as string)).toBe('')
  })
})
