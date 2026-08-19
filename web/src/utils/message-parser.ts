/**
 * message-parser.js — REQ-035 跨平台消息解析（MVP-1，纯前端纯函数）
 *
 * parseMessage(text) → { clientQq, description, hints: { amount, deadline } }
 *
 * 解析规则（派工 REQ-035 §五 MVP-1；解析不出不猜，绝不用假值凑）：
 *   - clientQq    : 消息中第一个「独立数字串」（5-15 位，前后均非数字），
 *                    对齐后端 schema ^[0-9]{5,15}$；金额线索内的数字串不作为 QQ 候选。
 *   - description : 全文（trim），截断到 2000（对齐后端 order create maxLength）。
 *   - hints.amount   : 「预算 x 元」/「x 元」识别为线索提示，不自动填；未识别为 null。
 *   - hints.deadline : 「x号前」/「x月x日」识别为线索提示，不自动填；未识别为 null。
 *                      月/日须合法（月 1-12、日按该月上限），非法值跳过不采纳。
 */
export const DESCRIPTION_MAX_LEN = 2000
export const QQ_MIN_LEN = 5
export const QQ_MAX_LEN = 15

// b4-10: 线索显示文案走 i18n（zh/en 各自日期格式；解析正则仍是中文形态，保持后端/输入口径不变）
import { i18n } from '../i18n/index.js'

// 金额线索：预算 200 元 / 200元 / 预算1000元（允许 1-2 位小数）
const AMOUNT_RE = /(?:预算\s*)?(\d{1,9}(?:\.\d{1,2})?)\s*元/g
// 日期线索：x号前 / x月x日（x 为 1-2 位）
const DEADLINE_DAY_RE = /(\d{1,2})\s*号\s*前/g
const DEADLINE_DATE_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g
// 817-D 体验12：各月最大日（2 月按 29 天宽松处理——粘贴文本无年份，闰年与否不可判，
// 只拦「22月31日」这类明显非法值；月 1-12、日按该月上限）
const MONTH_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** 月/日合法性：月 1-12，日 1 到该月上限；非法直接不采纳（解析不出不猜） */
function isValidMonthDay(month: string, day: string): boolean {
  const m = Number(month)
  const d = Number(day)
  return Number.isInteger(m) && m >= 1 && m <= 12 &&
    Number.isInteger(d) && d >= 1 && d <= MONTH_DAYS[m]
}

/** 金额线索命中（数值 + 命中区间，区间用于排除「预算数字冒充 QQ」） */
interface AmountHint {
  value: string
  numStart: number
  numEnd: number
}

/** 收集金额线索：数值 + 命中区间（区间用于排除「预算数字冒充 QQ」） */
function collectAmounts(text: string): AmountHint[] {
  const hints: AmountHint[] = []
  AMOUNT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const value = m[1]
    // 数值起点：匹配整体中扣除「预算」前缀与「元」后缀
    const numStart = m.index + m[0].indexOf(value)
    const numEnd = numStart + value.length
    hints.push({ value, numStart, numEnd })
  }
  return hints
}

/** 收集日期线索：按 locale 格式化（zh: 5号前 / 8月20日；en: before 5 / 8/20），未命中 null */
function collectDeadline(text: string): string | null {
  DEADLINE_DAY_RE.lastIndex = 0
  let m = DEADLINE_DAY_RE.exec(text)
  // 号前：先命中且合法的日（1-31）才采纳，非法跳过继续找
  while (m) {
    const day = Number(m[1])
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      return i18n.global.t('messageParser.deadlineDay', { day: m[1] })
    }
    m = DEADLINE_DAY_RE.exec(text)
  }
  DEADLINE_DATE_RE.lastIndex = 0
  m = DEADLINE_DATE_RE.exec(text)
  // 月日：先命中且合法的月/日才采纳（22月31日 → 跳过，继续找后续合法日期）
  while (m) {
    if (isValidMonthDay(m[1], m[2])) {
      return i18n.global.t('messageParser.deadlineDate', { month: m[1], day: m[2] })
    }
    m = DEADLINE_DATE_RE.exec(text)
  }
  return null
}

/**
 * 找第一个「独立数字串」（前后均非数字），长度 [minLen, maxLen]。
 * 落在金额数值区间内的数字串跳过（预算 100000 元 不冒充 QQ）。
 * 用逐字符扫描而非 \b 正则：\b 只认 ASCII 词边界，中文/emoji 粘连时不可靠。
 */
function findFirstIndependentDigits(text: string, minLen: number, maxLen: number, excludeRanges: Array<[number, number]>): string {
  const n = text.length
  let i = 0
  while (i < n) {
    if (!/\d/.test(text[i])) { i += 1; continue }
    let j = i
    while (j < n && /\d/.test(text[j])) j += 1
    const len = j - i
    const prevOk = i === 0 || !/\d/.test(text[i - 1])
    const nextOk = j === n || !/\d/.test(text[j])
    if (len >= minLen && len <= maxLen && prevOk && nextOk) {
      const excluded = excludeRanges.some(([s, e]) => i >= s && j <= e)
      if (!excluded) return text.slice(i, j)
    }
    i = j
  }
  return ''
}

function emptyResult(): { clientQq: string, description: string, hints: { amount: string | null, deadline: string | null } } {
  return { clientQq: '', description: '', hints: { amount: null, deadline: null } }
}

export function parseMessage(text: string): { clientQq: string, description: string, hints: { amount: string | null, deadline: string | null } } {
  if (typeof text !== 'string' || !text.trim()) return emptyResult()
  const source = text.trim()

  const amounts = collectAmounts(source)
  const amount = amounts.length > 0 ? amounts[0].value : null
  const deadline = collectDeadline(source)

  const clientQq = findFirstIndependentDigits(
    source,
    QQ_MIN_LEN,
    QQ_MAX_LEN,
    amounts.map((a): [number, number] => [a.numStart, a.numEnd])
  )

  return {
    clientQq,
    description: source.slice(0, DESCRIPTION_MAX_LEN),
    hints: { amount, deadline }
  }
}
