// 本地核心环波16 测试：工时明细 CSV 纯函数（口径哨兵）。
import { describe, it, expect } from 'vitest'
import { secsToHours, csvEscape, buildWorklogCsv } from '../tools/worklogCsv'

describe('secsToHours（工时列口径）', () => {
  it('秒转小时两位小数', () => {
    expect(secsToHours(3600)).toBe('1.00')
    expect(secsToHours(5400)).toBe('1.50')
    expect(secsToHours(0)).toBe('0.00')
  })

  it('非法值落 0', () => {
    expect(secsToHours(-5)).toBe('0.00')
    expect(secsToHours(Number.NaN)).toBe('0.00')
  })
})

describe('csvEscape（Excel 兼容 + 公式注入防护）', () => {
  it('普通值原样', () => {
    expect(csvEscape('张三')).toBe('张三')
  })

  it('含逗号/引号包双引号且内部引号翻倍', () => {
    expect(csvEscape('张,三')).toBe('"张,三"')
    expect(csvEscape('说"好"')).toBe('"说""好"""')
  })

  it('公式注入前缀 = + - @ 加单引号中和（GHSA-6pf3-g4xq-854w）', () => {
    expect(csvEscape('=cmd|/C calc!A0')).toBe("'=cmd|/C calc!A0")
    expect(csvEscape('+1')).toBe("'+1")
    expect(csvEscape('-1')).toBe("'-1")
    expect(csvEscape('@x')).toBe("'@x")
  })

  it('TAB 开头加单引号中和', () => {
    expect(csvEscape('\tfoo')).toBe("'\tfoo")
  })

  it('公式前缀 + 含逗号：先中和再 RFC 转义（两层叠加不冲突）', () => {
    // =SUM(A1,B1) 含逗号，先加 ' 变 '=SUM(A1,B1)，再包双引号
    expect(csvEscape('=SUM(A1,B1)')).toBe("\"'=SUM(A1,B1)\"")
  })

  it('非公式前缀开头（数字、中文）不受影响', () => {
    expect(csvEscape('2026-08-26')).toBe('2026-08-26')
    expect(csvEscape('1+2')).toBe('1+2') // 以数字开头，+ 不在首位
  })
})

describe('buildWorklogCsv（行结构）', () => {
  it('两段结构 + BOM 开头 + CRLF 行尾', () => {
    const csv = buildWorklogCsv(
      [{ date: '2026-08-26', paint_secs: 7200, idle_secs: 1800, other_secs: 900 }],
      [{ client: '张三', title: '头像', total_secs: 5400 }]
    )
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv).toContain('【按日工时】')
    expect(csv).toContain('2026-08-26,2.00,0.25,0.50')
    expect(csv).toContain('【按单工时】')
    expect(csv).toContain('张三,头像,1.50')
    expect(csv).toContain('\r\n')
  })

  it('空数据也有表头骨架（不炸）', () => {
    const csv = buildWorklogCsv([], [])
    expect(csv).toContain('日期,在画小时,其他小时,离开小时')
    expect(csv).toContain('客户,内容,已画小时')
  })

  it('客户/内容含公式前缀时被中和（GHSA-6pf3-g4xq-854w）', () => {
    const csv = buildWorklogCsv(
      [{ date: '2026-09-01', paint_secs: 3600, idle_secs: 0, other_secs: 0 }],
      [{ client: '=SUM(A1,B1)', title: '@evil', total_secs: 7200 }]
    )
    // 客户 =SUM(A1,B1) 含逗号 → 先加 ' 再包双引号 → "'=SUM(A1,B1)"
    // 内容 @evil → 加 ' → '@evil（无特殊字符，不包双引号）
    expect(csv).toContain("\"'=SUM(A1,B1)\",'@evil,2.00")
  })
})
