/**
 * CSV 出口单一事实源（R-2 抽取：原为 features/artist/tools.routes.ts 的文件内私有函数）
 *
 * 为什么住 server/src/shared 而不是 @inkglean/shared：
 * 同 shared/money.ts 的理由——server/package.json 不依赖 @inkglean/shared（该包 peerDependency 是 vue、
 * 入口导出 .vue 组件），且生产 Dockerfile Stage 2 只 COPY server/，容器里没有 ../shared 源码，
 * 相对路径导入会在运行时 404。故服务端 CSV 口径住本文件，跨端（web/desktop）不共用。
 *
 * 转义规则（P2-9 原样搬移，逐字未改）：
 * 1) 公式注入——值以 = + - @ 或 \t \r 开头时前置单引号，Excel 按纯文本显示；
 * 2) 含逗号/引号/换行时用双引号包裹，内部引号翻倍；
 * 3) 9-8：负退款（-<整数>）是合法数值——用双引号包裹而非前置单引号，
 *    Excel 打开 CSV 时仍按数字解析可求和，同时不进入公式执行路径。
 *
 * 调用方（2026-11-28 起两处）：features/artist/tools.routes.ts 收入导出、features/compliance 留痕导出。
 * 新增 CSV 出口一律走本文件，禁止在路由里各写一份转义。
 */

/** 合法数值形态（含负数/小数）：命中即用双引号包裹保留数值语义，不走前置单引号 */
const SAFE_NUMERIC_RE = /^-?\d+(?:\.\d+)?$/

/**
 * CSV 字段转义（公式注入防护 + 引号/逗号/换行转义）
 * @param value 已字符串化的单元格值
 */
export function csvEscape(value: string): string {
  let out = value
  if (/^[=+\-@\t\r]/.test(out)) {
    // 纯数字（含负数）用双引号包住保留数值语义；非数字公式前缀仍前置单引号
    if (SAFE_NUMERIC_RE.test(out)) {
      return `"${out}"`
    }
    out = `'${out}`
  }
  if (/[",\n\r]/.test(out)) {
    out = `"${out.replace(/"/g, '""')}"`
  }
  return out
}

/** 单元格值宽类型：调用方直接透传行字段，null/undefined 一律出空单元格 */
export type CsvCell = string | number | boolean | null | undefined

/**
 * 一行 CSV（不含行尾换行）
 * 所有单元格统一走 csvEscape——哪怕某字段当下非用户可控，也防将来加字段漏网（P2-9 口径）。
 */
export function csvLine(cells: ReadonlyArray<CsvCell>): string {
  return cells.map(c => (c === null || c === undefined ? '' : csvEscape(String(c)))).join(',')
}

/** 表头行（与数据行同一套转义，列名将来含逗号也不炸） */
export function csvHeader(columns: ReadonlyArray<string>): string {
  return csvLine(columns)
}

/** UTF-8 BOM：Excel 打开中文不乱码（两份导出同口径） */
export const CSV_BOM = '\uFEFF'

/** CSV 响应 Content-Type（RFC 4180 + 显式 charset） */
export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8'

/** CSV 行尾（CRLF，Excel 兼容） */
export const CSV_CRLF = '\r\n'
