/**
 * R-2（2026-11-28）：shared/csv.ts 单元测试
 *
 * 本文件钉住「抽取后的 CSV 口径与抽取前逐字一致」——这批把 csvEscape 从
 * features/artist/tools.routes.ts 的私有函数提到 shared，算法一字未改，
 * 故下列断言同时是两份导出（收入 / 留痕）的公共契约。
 */
import { describe, it, expect } from 'vitest'
import { csvEscape, csvLine, csvHeader, CSV_BOM, CSV_CONTENT_TYPE, CSV_CRLF } from '../src/shared/csv.js'

describe('csvEscape 公式注入中和', () => {
  it('= + - @ 开头的非数值 → 前置单引号', () => {
    expect(csvEscape('=1+1')).toBe("'=1+1")
    expect(csvEscape('=cmd|/C calc!A0')).toBe("'=cmd|/C calc!A0")
    expect(csvEscape('+1')).toBe("'+1")
    expect(csvEscape('-1+cmd')).toBe("'-1+cmd")
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)")
  })

  it('\\t 与 \\r 开头同样中和（Excel 会跳过前导空白执行后续公式）', () => {
    expect(csvEscape('\tfoo')).toBe("'\tfoo")
    expect(csvEscape('\rfoo')).toBe("\"'\rfoo\"")
  })

  it('纯数值（含负退款）用双引号包裹保留数值语义，不前置单引号', () => {
    expect(csvEscape('-1')).toBe('"-1"')
    expect(csvEscape('-5000')).toBe('"-5000"')
    expect(csvEscape('-1.25')).toBe('"-1.25"')
    // 正数不以危险字符开头，原样输出
    expect(csvEscape('30000')).toBe('30000')
  })

  it('非首位的危险字符不中和（1+2 是普通文本）', () => {
    expect(csvEscape('1+2')).toBe('1+2')
    expect(csvEscape('a=b')).toBe('a=b')
  })
})

describe('csvEscape 常规转义', () => {
  it('逗号/引号/换行 → 双引号包裹 + 内部引号翻倍', () => {
    expect(csvEscape('张,三')).toBe('"张,三"')
    expect(csvEscape('说"好"')).toBe('"说""好"""')
    expect(csvEscape('第一行\n第二行')).toBe('"第一行\n第二行"')
  })

  it('普通值原样返回', () => {
    expect(csvEscape('artist_ban')).toBe('artist_ban')
    expect(csvEscape('')).toBe('')
    expect(csvEscape('2026-09-13 10:00:00')).toBe('2026-09-13 10:00:00')
  })

  it('注入中和与转义叠加时顺序正确（先加引号，再因含逗号/引号被包起来）', () => {
    expect(csvEscape('=SUM(A1,B1)')).toBe('"\'=SUM(A1,B1)"')
  })
})

describe('csvLine / csvHeader', () => {
  it('null/undefined → 空单元格（不渲染成 "null"）', () => {
    expect(csvLine([null, undefined, 'a'])).toBe(',,a')
  })

  it('数值 / 布尔 直接字符串化后再转义', () => {
    expect(csvLine([1, true, 'x'])).toBe('1,true,x')
    expect(csvLine([-5])).toBe('"-5"')
  })

  it('每一格都走 csvEscape（不因某列"非用户可控"就跳过）', () => {
    expect(csvLine(['=1+1', 'ok'])).toBe("'=1+1,ok")
  })

  it('表头与数据行同一套转义', () => {
    expect(csvHeader(['a', 'b'])).toBe('a,b')
  })
})

describe('常量口径', () => {
  it('BOM / Content-Type / CRLF 与两份导出一致', () => {
    expect(CSV_BOM).toBe('\uFEFF')
    expect(CSV_CONTENT_TYPE).toBe('text/csv; charset=utf-8')
    expect(CSV_CRLF).toBe('\r\n')
  })
})
