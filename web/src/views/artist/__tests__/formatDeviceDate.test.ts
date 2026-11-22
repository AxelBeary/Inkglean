// F0287 返工（复核 PART2 FAIL）：formatDate 对 ISO-Z 串的正确解析回归。
// 核心断言用 toISOString() 校验归一化后解析出的「绝对时刻」，与时区无关：
// 旧实现先剥 Z 再判 includes('T') → ISO-Z 串被当本地时间，UTC+8 下解析成前一日 22:00Z（错）。
import { describe, it, expect } from 'vitest'
import { normalizeDeviceDate, formatDeviceDate } from '../formatDeviceDate'

describe('F0287 formatDate ISO 口径（复核返工）', () => {
  it('ISO-Z 串（后端 toISOString 写入）：保留 Z，解析为当日 06:00Z 而非前一日 22:00Z', () => {
    const isoZ = '2026-11-22T06:00:00.000Z'
    expect(normalizeDeviceDate(isoZ)).toBe(isoZ) // 含 T 原样保留，不剥 Z
    expect(new Date(normalizeDeviceDate(isoZ)).toISOString()).toBe('2026-11-22T06:00:00.000Z')
  })

  it('SQLite 空格格式 UTC 串：补 T+Z 按 UTC 解析（原问题口径不回退）', () => {
    const sqlite = '2026-11-22 06:00:00'
    expect(normalizeDeviceDate(sqlite)).toBe('2026-11-22T06:00:00Z')
    expect(new Date(normalizeDeviceDate(sqlite)).toISOString()).toBe('2026-11-22T06:00:00.000Z')
  })

  it('带时区偏移的 ISO 串：原样解析并归一到同一 UTC 时刻', () => {
    expect(new Date(normalizeDeviceDate('2026-11-22T14:00:00+08:00')).toISOString()).toBe('2026-11-22T06:00:00.000Z')
  })

  it('非法串原样返回，空串返回空', () => {
    expect(formatDeviceDate('not-a-date')).toBe('not-a-date')
    expect(formatDeviceDate('')).toBe('')
  })

  it('合法串格式化为非空本地展示文本（含时分）', () => {
    const out = formatDeviceDate('2026-11-22T06:00:00.000Z')
    expect(out).toBeTruthy()
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })
})
