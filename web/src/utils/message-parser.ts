/**
 * message-parser.ts — REQ-035 跨平台消息解析（MVP-1 + 820 规则补全/描述清洗）
 *
 * parseMessage(text) → { clientQq, clientName, description, hints: { amount, deadline } }
 *
 * 解析规则（解析不出不猜，绝不用假值凑）：
 *   - clientQq    : 消息中第一个「独立数字串」（5-15 位，前后均非数字），
 *                    对齐后端 schema ^[0-9]{5,15}$；金额线索内的数字串不作为 QQ 候选。
 *   - clientName  : 「昵称：xx」类标签行（昵称/客户/金主/买家/老板）取标签后的值；未命中为空。
 *   - description : 清洗后的正文——去重复行、删垃圾行（纯时间戳/聊天系统占位）、
 *                    去掉已提取的「标签：值」声明行，截断到 2000（对齐后端 maxLength）。
 *   - hints.amount   : 金额线索（不自动填）——「x 元/块」「¥/￥x」「价格/总价/一共/报价 x」；
 *                       「定金/尾款 x」计入金额候选但排除出 QQ 候选区间。
 *   - hints.deadline : 截稿线索（不自动填），按文中出现位置取最早命中：
 *                       「x号前」「x月x日(前)」「x.x前」「x/x前」「YYYY-MM-DD(前)」「YYYY年M月D日(前)」；
 *                       月/日须合法（月 1-12、日按该月上限），非法值跳过不采纳。
 */
export const DESCRIPTION_MAX_LEN = 2000
export const QQ_MIN_LEN = 5
export const QQ_MAX_LEN = 15
/** 昵称值长度上限（超出部分截断，防止把整段话吃进昵称） */
const CLIENT_NAME_MAX_LEN = 30

// b4-10: 线索显示文案走 i18n（zh/en 各自日期格式；解析正则仍是中文形态，保持后端/输入口径不变）
import { i18n } from '../i18n/index'

// 金额线索：「x 元/块」「预算x元」「¥/￥x」「价格/总价/一共/报价 x」「定金/尾款 x」（允许 1-2 位小数）
const AMOUNT_RE = /(?:(?:预算|价格|总价|一共|报价|定金|尾款)\s*|[¥￥]\s*)(\d{1,9}(?:\.\d{1,2})?)(?!\d)|(\d{1,9}(?:\.\d{1,2})?)\s*[元块]/g
// 日期线索（820 扩充：月日前 / 点分前 / 斜线前 / ISO / 年月日，均以文中位置排序取最早）
const DEADLINE_DAY_RE = /(\d{1,2})\s*号\s*前/g
const DEADLINE_DATE_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g
const DEADLINE_DATE_BEFORE_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*前/g
const DEADLINE_SEP_BEFORE_RE = /(\d{1,2})\s*[./]\s*(\d{1,2})\s*前/g
const DEADLINE_ISO_RE = /(?<!\d)(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?\s*(?:前|截稿|交付|交稿|截止|死线|要)/g
// 817-D 体验12：各月最大日（2 月按 29 天宽松处理——粘贴文本无年份，闰年与否不可判，
// 只拦「22月31日」类的明显非法值；月 1-12、日按该月上限）
const MONTH_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// ── 820 描述清洗 ──
// 垃圾行分两类（拆开写，避免单个大正则的括号配对脆弱性）：
// ① 聊天系统占位：[图片]/【语音】等（括号显式转义：V8 对「] 打头的字符类」解析不合预期）；② 系统事件：撤回/新消息分隔/分隔线
const JUNK_PLACEHOLDER_RE = /^[[【](图片|表情|语音|视频|文件|动画表情|红包|转账|分享链接)[\]】]$/
const JUNK_EVENT_RE = /撤回了一条消息|^以下是新消息|^──|^---+$/
// 纯时间戳行：14:32 / 14:32:05 / 2026-08-20 14:32 / 2026年8月20日 14:32:05
const PURE_TIME_LINE_RE = /^(?:\d{2,4}[-/.年])?\d{1,2}[-/.月]\d{1,2}日?\s*\d{1,2}[:：]\d{2}(?::\d{2})?$|^\d{1,2}[:：]\d{2}(?::\d{2})?$/
// 行首时间前缀（QQ 聊天记录复制常见「2026-08-20 14:32:05 正文」）
const TIME_PREFIX_RE = /^(?:\d{2,4}[-/.年])?\d{1,2}[-/.月]\d{1,2}日?\s+\d{1,2}[:：]\d{2}(?::\d{2})?\s+|^\d{1,2}[:：]\d{2}(?::\d{2})?\s+/
// 已提取声明行：QQ/昵称/金额类「标签：短值」整行去掉（值已进表单，不再重复进描述；
// 标签必须显式命中，避免误删「需求：画一只猫」这类正常内容行）
const DECLARATION_LINE_RE = /^[\s\-·•]*(qq号?|昵称|客户|金主|买家|老板|预算|价格|总价|一共|金额|定金|尾款)\s*[:：]\s*[¥￥]?\s*[\d.\u4e00-\u9fa5A-Za-z]{1,20}[\s元块]*$/i

/** 昵称标签行：昵称/客户/金主/买家/老板（QQ昵称/客户昵称 等粘连形态同样命中） */
const NAME_LABEL_RE = /(?:昵称|客户|金主|买家|老板)\s*[:：]\s*/

/** 月/日合法性：月 1-12，日 1 到该月上限；非法直接不采纳（解析不出不猜） */
function isValidMonthDay(month: string, day: string): boolean {
  const m = Number(month)
  const d = Number(day)
  return Number.isInteger(m) && m >= 1 && m <= 12 &&
    Number.isInteger(d) && d >= 1 && d <= MONTH_DAYS[m]
}

/** 金额线索命中（数值 + 命中区间，区间用于排除「金额数字冒充 QQ」） */
interface AmountHint {
  value: string
  numStart: number
  numEnd: number
}

/** 用通用正则收集命中：数值取给定捕获组中首个非空值（兼容多分支正则），区间覆盖整段命中（含货币符号/后缀） */
function collectMatches(text: string, re: RegExp, valueGroups: number[]): AmountHint[] {
  const hints: AmountHint[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const value = valueGroups.map(g => m![g]).find(v => v !== undefined && v !== '')
    if (!value) continue
    hints.push({ value, numStart: m.index, numEnd: m.index + m[0].length })
  }
  return hints
}

/** 截稿候选：文中位置 + 显示文案（展示按 locale 格式化） */
interface DeadlineCandidate {
  index: number
  display: string
}

/**
 * 收集截稿线索候选，按文中出现位置取最早命中（820：替代旧「号前恒优先」口径——
 * 谁在前谁是作者真正强调的；同文本旧用例「3号前…8月20日」仍取 3号前，不受影响）。
 */
function collectDeadline(text: string): string | null {
  const cands: DeadlineCandidate[] = []

  DEADLINE_DAY_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DEADLINE_DAY_RE.exec(text)) !== null) {
    const day = Number(m[1])
    if (Number.isInteger(day) && day >= 1 && day <= 31) {
      cands.push({ index: m.index, display: i18n.global.t('messageParser.deadlineDay', { day: m[1] }) })
    }
  }

  // 「x月x日前」先于「x月x日」登记：带「前」的命中更完整，同一位置只保留前者
  DEADLINE_DATE_BEFORE_RE.lastIndex = 0
  while ((m = DEADLINE_DATE_BEFORE_RE.exec(text)) !== null) {
    if (isValidMonthDay(m[1], m[2])) {
      cands.push({ index: m.index, display: i18n.global.t('messageParser.deadlineDateBefore', { month: m[1], day: m[2] }) })
    }
  }
  DEADLINE_DATE_RE.lastIndex = 0
  while ((m = DEADLINE_DATE_RE.exec(text)) !== null) {
    if (isValidMonthDay(m[1], m[2]) && !cands.some(c => c.index === m!.index)) {
      cands.push({ index: m.index, display: i18n.global.t('messageParser.deadlineDate', { month: m[1], day: m[2] }) })
    }
  }

  // 「9.10前」「9/10前」：无「前」的点分/斜线日期歧义太大（版本/比例/日期难分），不采纳
  DEADLINE_SEP_BEFORE_RE.lastIndex = 0
  while ((m = DEADLINE_SEP_BEFORE_RE.exec(text)) !== null) {
    if (isValidMonthDay(m[1], m[2])) {
      cands.push({ index: m.index, display: i18n.global.t('messageParser.deadlineDateBefore', { month: m[1], day: m[2] }) })
    }
  }

  // ISO/年月日：年份须在 2000-2100（拦 1234-56-78 类乱码），月日须合法；
  // 且后文须带明确信号（前/截稿/交付等）——否则与聊天记录行首时间戳同形，不采纳
  DEADLINE_ISO_RE.lastIndex = 0
  while ((m = DEADLINE_ISO_RE.exec(text)) !== null) {
    const y = Number(m[1])
    if (y >= 2000 && y <= 2100 && isValidMonthDay(m[2], m[3]) && !cands.some(c => c.index === m!.index)) {
      cands.push({ index: m.index, display: i18n.global.t('messageParser.deadlineFullDate', { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }) })
    }
  }

  if (cands.length === 0) return null
  cands.sort((a, b) => a.index - b.index)
  return cands[0].display
}

/**
 * 找第一个「独立数字串」（前后均非数字），长度 [minLen, maxLen]。
 * 落在排除区间（金额/定金尾款数值段）内的数字串跳过（预算 100000 元 不冒充 QQ）。
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

/** 昵称提取：第一个「昵称/客户/金主/买家/老板：值」标签行，值截断 30 字 */
function extractClientName(text: string): string {
  const m = NAME_LABEL_RE.exec(text)
  if (!m) return ''
  const rest = text.slice(m.index + m[0].length)
  const value = rest.split(/\n/)[0].trim()
  if (!value) return ''
  return value.slice(0, CLIENT_NAME_MAX_LEN).trim()
}

/**
 * 820 描述清洗：去重复行、删垃圾行（纯时间戳/聊天系统占位/系统事件）、
 * 去掉已提取的「标签：值」声明行、行首时间前缀剥离、压缩多余空行。
 */
function cleanDescription(text: string): string {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim()
    if (!line) continue
    // 行首时间前缀剥离（可能叠加多段，循环剥到不再命中）
    let prev = ''
    while (line !== prev) {
      prev = line
      line = line.replace(TIME_PREFIX_RE, '').trim()
    }
    if (!line) continue
    if (PURE_TIME_LINE_RE.test(line)) continue        // 纯时间戳行
    if (JUNK_PLACEHOLDER_RE.test(line)) continue      // 聊天系统占位
    if (JUNK_EVENT_RE.test(line)) continue            // 系统事件行
    if (DECLARATION_LINE_RE.test(line)) continue      // 已提取的标签声明行
    if (seen.has(line)) continue                      // 重复行只留第一条
    seen.add(line)
    kept.push(line)
  }
  return kept.join('\n')
}

export interface ParseMessageResult {
  clientQq: string
  clientName: string
  description: string
  hints: { amount: string | null, deadline: string | null }
}

function emptyResult(): ParseMessageResult {
  return { clientQq: '', clientName: '', description: '', hints: { amount: null, deadline: null } }
}

export function parseMessage(text: string): ParseMessageResult {
  if (typeof text !== 'string' || !text.trim()) return emptyResult()
  const source = text.trim()

  const amounts = collectMatches(source, AMOUNT_RE, [1, 2])
  const amount = amounts.length > 0 ? amounts[0] : null
  const deadline = collectDeadline(source)

  // QQ 排除区间：全部金额命中段（含定金/尾款，均不得冒充 QQ）
  const excludeRanges: Array<[number, number]> = amounts.map(a => [a.numStart, a.numEnd])
  const clientQq = findFirstIndependentDigits(source, QQ_MIN_LEN, QQ_MAX_LEN, excludeRanges)

  return {
    clientQq,
    clientName: extractClientName(source),
    description: cleanDescription(source).slice(0, DESCRIPTION_MAX_LEN),
    hints: { amount: amount ? amount.value : null, deadline }
  }
}
