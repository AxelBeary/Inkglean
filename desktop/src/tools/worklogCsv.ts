// 工时明细 CSV（本地核心环波16）：REQ-014 §F8 输出件「导出含工时列」。
// 两段：按日工时（日期/在画/其他/离开）+ 按单工时（客户/内容/已画）。
// 纯函数可测；UTF-8 BOM + CRLF（Excel 中文兼容口径）。
export interface WorklogDayRow {
  date: string
  paint_secs: number
  idle_secs: number
  other_secs: number
}

export interface WorklogOrderRow {
  client: string
  title: string
  total_secs: number
}

/** 秒 → 小时两位小数（工时列口径） */
export function secsToHours(secs: number): string {
  const v = Number.isFinite(secs) && secs > 0 ? secs / 3600 : 0
  return v.toFixed(2)
}

/** CSV 字段转义：先中和公式注入前缀（GHSA-6pf3-g4xq-854w），再做 RFC 4180 引号转义。
 *  若值以 = + - @ 或 TAB 开头，先加单引号使 Excel 当文本处理（通行做法）；
 *  然后再检查引号/逗号/换行，按 RFC 4180 决定是否用双引号包裹。*/
export function csvEscape(v: string): string {
  const neutralized = /^[=+\-@\t]/.test(v) ? `'${v}` : v
  if (/[",\r\n]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`
  return neutralized
}

/** 组 CSV 全文（UTF-8 BOM 由调用方编码时带上；此处只管行结构） */
export function buildWorklogCsv(days: WorklogDayRow[], orders: WorklogOrderRow[]): string {
  const lines: string[] = []
  lines.push('【按日工时】')
  lines.push('日期,在画小时,其他小时,离开小时')
  for (const d of days) {
    lines.push([csvEscape(d.date), secsToHours(d.paint_secs), secsToHours(d.other_secs), secsToHours(d.idle_secs)].join(','))
  }
  lines.push('')
  lines.push('【按单工时】')
  lines.push('客户,内容,已画小时')
  for (const o of orders) {
    lines.push([csvEscape(o.client), csvEscape(o.title), secsToHours(o.total_secs)].join(','))
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}
