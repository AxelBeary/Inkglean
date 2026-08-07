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
 */
export const DESCRIPTION_MAX_LEN = 2000
export const QQ_MIN_LEN = 5
export const QQ_MAX_LEN = 15

// 金额线索：预算 200 元 / 200元 / 预算1000元（允许 1-2 位小数）
const AMOUNT_RE = /(?:预算\s*)?(\d{1,9}(?:\.\d{1,2})?)\s*元/g
// 日期线索：x号前 / x月x日（x 为 1-2 位）
const DEADLINE_DAY_RE = /(\d{1,2})\s*号\s*前/g
const DEADLINE_DATE_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g

/** 收集金额线索：数值 + 命中区间（区间用于排除「预算数字冒充 QQ」） */
function collectAmounts(text) {
  const hints = []
  AMOUNT_RE.lastIndex = 0
  let m
  while ((m = AMOUNT_RE.exec(text)) !== null) {
    const value = m[1]
    // 数值起点：匹配整体中扣除「预算」前缀与「元」后缀
    const numStart = m.index + m[0].indexOf(value)
    const numEnd = numStart + value.length
    hints.push({ value, numStart, numEnd })
  }
  return hints
}

/** 收集日期线索：规范化串（5号前 / 8月20日），未命中 null */
function collectDeadline(text) {
  DEADLINE_DAY_RE.lastIndex = 0
  let m = DEADLINE_DAY_RE.exec(text)
  if (m) return `${m[1]}号前`
  DEADLINE_DATE_RE.lastIndex = 0
  m = DEADLINE_DATE_RE.exec(text)
  if (m) return `${m[1]}月${m[2]}日`
  return null
}

/**
 * 找第一个「独立数字串」（前后均非数字），长度 [minLen, maxLen]。
 * 落在金额数值区间内的数字串跳过（预算 100000 元 不冒充 QQ）。
 * 用逐字符扫描而非 \b 正则：\b 只认 ASCII 词边界，中文/emoji 粘连时不可靠。
 */
function findFirstIndependentDigits(text, minLen, maxLen, excludeRanges) {
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

function emptyResult() {
  return { clientQq: '', description: '', hints: { amount: null, deadline: null } }
}

export function parseMessage(text) {
  if (typeof text !== 'string' || !text.trim()) return emptyResult()
  const source = text.trim()

  const amounts = collectAmounts(source)
  const amount = amounts.length > 0 ? amounts[0].value : null
  const deadline = collectDeadline(source)

  const clientQq = findFirstIndependentDigits(
    source,
    QQ_MIN_LEN,
    QQ_MAX_LEN,
    amounts.map(a => [a.numStart, a.numEnd])
  )

  return {
    clientQq,
    description: source.slice(0, DESCRIPTION_MAX_LEN),
    hints: { amount, deadline }
  }
}