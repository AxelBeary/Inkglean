/**
 * check-i18n — 源头防屎门禁（用户红线：禁止新硬编码中文）
 *
 * 职责：
 *   1. 扫描 web/src 下 .vue/.js/.ts 中「用户可见硬编码中文/英文」（template 文本节点、
 *      ElMessage/ElMessageBox/alert/confirm 参数、placeholder/title/label 等属性）。
 *   2. 扫描 .vue template 区插值外的全角标点：中文收进 $t 后往往把 `（` `：` 留在模板里，
 *      英文态会原样显示中文标点（issue #54 漏网；中文主检测只能拦住中文本身）。
 *   3. 存量违规写入 baseline（scripts/i18n-baseline.json）豁免，不修存量；
 *      新增违规直接 exit 1 拦截——「为了过验证而绕」和「新增屎山」在提交时被拦下。
 *
 * 用法：
 *   npx tsx scripts/check-i18n.ts            # 增量检查（CI/提交前跑，新增违规 exit 1）
 *   npx tsx scripts/check-i18n.ts --init     # 重建 baseline + 输出存量违规清单（不拦截）
 *   npx tsx scripts/check-i18n.ts --prune    # 仅移除 baseline 中已不存在的过期条目（不新增）
 *   npx tsx scripts/check-i18n.ts --migrate --from <旧路径> --to <新路径> --expect <命中条数>
 *                                            # 拆件/搬文件时把存量豁免整路径迁移（G2/N2 尾项）：
 *                                            # 命中数 ≠ expect 或迁移后条目总数变化 → 拒写 exit 1。
 *                                            # 不新增豁免、不改违规串，只换路径前缀。
 *
 * 设计取舍（启发式，可能有误报）：
 *   - 只扫「用户可见」位置，不扫普通字符串字面量（状态 key、日期格式等内部值不拦）
 *   - 排除：locales/ 文件、JS/HTML 注释、$t(...)/t(...) 参数、*.test.js / *.test.ts / __tests__、白名单词
 *   - 英文扫描仅覆盖模板文本节点/静态属性/提示参数，品牌名与语言自指走 WHITELIST 降噪
 *   - template 类规则仅作用于 .vue 模板区（避免把 JS 比较表达式误当文本节点）
 *   - baseline key = 相对路径 + 违规串原文；存量字符串未改即豁免，新增/修改即拦截
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, relative, sep } from 'path'
import { fileURLToPath } from 'url'

/** 目录/自身路径解析：被单测 import 时 vite 会改写 new URL(..., import.meta.url)，失败退回 cwd；
 *  门禁环境解析失败必须响——退回 cwd 会扫错目录假绿 */
function selfDir(): string {
  try {
    return fileURLToPath(new URL('.', import.meta.url))
  } catch (err) {
    if (process.env.VITEST) return process.cwd()
    throw err
  }
}

const ROOT = join(selfDir(), '..')
const SRC = join(ROOT, 'src')
const BASELINE_FILE = join(ROOT, 'scripts', 'i18n-baseline.json')
const INDEX_HTML = join(ROOT, 'index.html')

/** 单条违规记录 */
interface Violation {
  file: string
  line: number
  text: string
  rule: string
}

/** 扫描规则（templateOnly 规则仅作用于 .vue 模板区） */
interface I18nRule {
  label: string
  templateOnly?: boolean
  re: RegExp
}

/** baseline 文件结构 */
interface BaselineFile {
  version: number
  entries: string[]
}

/** 合法中文白名单（品牌名/专有名词等，命中即豁免整串） */
const WHITELIST = [
  '拾绘',
  '中',  // 语言切换自指字（国际惯例：语言名用自身文字显示，不翻译）
  '绘',  // 品牌印章字（ArtistLayout SealStamp 装饰，与 menu.logoSeal 同义）
  'EN',  // 语言切换自指
  'ADMIN', 'INKGLEAN', 'HUIYUE',  // 品牌/角标字（HUIYUE 为旧品牌遗留展示字）
  'Google Authenticator', 'Microsoft Authenticator', '2FAS'  // b4 裁决：真实验证器品牌名可保留
]

/**
 * 中文判定字符类：〇(U+3007) 々(U+3005) Ext-A 主区 兼容区 Ext-B~I（Ext-B 起需 u 标志）。
 * 全脚本只此一处口径——每条中文规则与预筛/复判都引用它，避免两套「算不算中文」。
 */
const CJK_CLASS = '\\u3007\\u3005\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF\\u{20000}-\\u{2A6DF}\\u{2A700}-\\u{2EBEF}\\u{30000}-\\u{3134F}'
/** 一段文本是否含中文（含扩展区） */
export const CJK_RE = new RegExp(`[${CJK_CLASS}]`, 'u')

/**
 * 插值外全角标点：CJK 标点 + 全角形式区。
 * 不含：全角字母数字/半角片假名；—(U+2014)…(U+2026)·(U+00B7) 这类占位符；
 * ＋(U+FF0B) 全角加号——本仓当图标字用（8 处「＋ 添加」按钮），不是标点，纳入会误报。
 * 「」『』(U+300C-300F) 属标点、会随语言变（英文态该出半角引号），故纳入；
 * 仓库内最后一处硬编码（OrderRevisionCard 的阶段路径）已同批收进 locale。
 */
export const FULLWIDTH_PUNCT_RE = /[\u3001-\u303F\uFF01-\uFF0A\uFF0C-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/

/** 模板/JS 中用户可见的文本位置（正则） */
const RULES: I18nRule[] = [
  // template 文本节点：>中文<
  { label: 'template-text', templateOnly: true, re: new RegExp(`>\\s*([^<>{}\\n]*[${CJK_CLASS}][^<>{}\\n]*)<`, 'gu') },
  // template 文本节点：>English<（b4 盲区；品牌名/语言自指走 WHITELIST）
  { label: 'template-text-en', templateOnly: true, re: />\s*((?!\/)[^<>{}\n]*[A-Za-z][^<>{}\n]*)</g },
  // {{ }} 插值里的中文串字面量（b4 盲区；$t/t 参数已在 maskTArgs 剔除）
  { label: 'template-interp', templateOnly: true, re: new RegExp(`\\{\\{([^{}]*?)(['"\`][^'"\`\\n]*[${CJK_CLASS}][^'"\`\\n]*['"\`])[^{}]*\\}\\}`, 'gu') },
  // 常见展示属性（直接写死的静态值）
  { label: 'attr', re: new RegExp(`(?<![\\w:@-])\\b(placeholder|title|label|aria-label|empty-text|append-text|confirm-button-text|cancel-button-text|alt|text|content|description|tooltip|aria-description|aria-placeholder)\\s*=\\s*"([^"]*[${CJK_CLASS}][^"]*)"`, 'gu') },
  // 静态英文展示属性（b4 盲区；绑定表达式 :attr= 不查）
  { label: 'attr-en', re: /(?<![\w:@-])\b(placeholder|title|label|aria-label|empty-text|append-text|confirm-button-text|cancel-button-text|alt|text|content|description|tooltip|aria-description|aria-placeholder)\s*=\s*"([^"]*[A-Za-z][^"]*)"/g },
  // 冒号绑定里直接写死的中文字符串字面量（:placeholder="'请输入'" 之类）
  { label: 'bound-literal', re: new RegExp(`:\\s*(placeholder|title|label|aria-label)\\s*=\\s*"'\\s*([^'"]*[${CJK_CLASS}][^'"]*)\\s*'"`, 'gu') },
  // 冒号绑定里反引号字面量（b4 盲区：:title="`中文`"）
  { label: 'bound-literal-ticks', re: new RegExp(`:\\s*(placeholder|title|label|aria-label|alt|text|tooltip|description|aria-description)\\s*=\\s*"\`([^"\`\\n]*[${CJK_CLASS}][^"\`\\n]*)\`"`, 'gu') },
  // ElMessage / ElMessageBox / alert / confirm 参数
  { label: 'message', re: new RegExp(`\\b(?:ElMessage\\.(?:success|error|warning|info)|ElMessageBox\\.(?:alert|confirm|prompt)|alert|confirm)\\s*\\(\\s*['"\`]([^'"\`\\n]*[${CJK_CLASS}][^'"\`\\n]*)['"\`]`, 'gu') },
  // 英文可见提示（b4 盲区）
  { label: 'message-en', re: /\b(?:ElMessage\.(?:success|error|warning|info)|ElMessageBox\.(?:alert|confirm|prompt)|alert|confirm)\s*\(\s*['"`]([^'"`\n]*[A-Za-z][^'"`\n]*)['"`]/g },
  // ElMessageBox 第二参（标题，b4 盲区；当前无实例）
  { label: 'message-2nd', re: new RegExp(`\\bElMessageBox\\.(?:alert|confirm|prompt)\\s*\\(\\s*[^,]+?,\\s*['"\`]([^'"\`\\n]*[${CJK_CLASS}][^'"\`\\n]*)['"\`]`, 'gu') },
  // 对象字面量错误消息（{ message: '中文' } / { error: '中文' }）
  { label: 'err-object', re: new RegExp(`\\b(?:message|error|title)\\s*:\\s*['"\`]([^'"\`\\n]*[${CJK_CLASS}][^'"\`\\n]*)['"\`]`, 'gu') },
  // new Error('中文') 构造参数（b4 盲区：可能经 err.message 上抛给用户）
  { label: 'err-ctor', re: new RegExp(`\\bnew\\s+Error\\s*\\(\\s*['"\`]([^'"\`\\n]*[${CJK_CLASS}][^'"\`\\n]*)['"\`]`, 'gu') }
]

/** web/index.html 静态 title/meta（b4 盲区；现有中文为已裁决的 SEO 兜底存量） */
const HTML_RULES: I18nRule[] = [
  { label: 'html-title', re: new RegExp(`<\\s*title\\s*>([^<]*[${CJK_CLASS}][^<]*)<\\s*\\/\\s*title\\s*>`, 'gu') },
  { label: 'html-meta', re: new RegExp(`\\b(?:content|name|property|site_name)\\s*=\\s*"([^"]*[${CJK_CLASS}][^"]*)"`, 'gu') }
]

/** 剥离 JS 行内注释（// 与块注释）——粗略但够用：注释里的中文不算违规 */
function stripComment(line: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < line.length) {
    const ch = line[i]
    if (quote) {
      out += ch
      if (ch === '\\') { out += line[i + 1] ?? ''; i += 2; continue }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; i++; continue }
    if (ch === '/' && line[i + 1] === '/') break
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      if (end === -1) break
      i = end + 2
      continue
    }
    out += ch
    i++
  }
  return out
}

/** 剥离 HTML 注释（vue 模板里 <!-- 中文注释 --> 不算用户可见） */
function stripHtmlComment(line: string): string {
  return line.replace(/<!--[\s\S]*?-->/g, '')
}

/** 过滤掉 $t(...)/t(...) 参数内的中文（key 不是用户可见文案；b4 盲区：t( 形式） */
function maskTArgs(text: string): string {
  return text.replace(/(?:\$t|\bt)\s*\(\s*['"`][^'"`]*['"`]/g, '')
}

/** 掩码用占位符：\u0000 打断节点（标签/HTML 注释），\u0001 留在节点内但不参与标点匹配（插值） */
const MASK_BREAK = '\u0000'
const MASK_INLINE = '\u0001'

/** 同长度掩码（保留换行，行号与偏移不漂移） */
function maskWith(chunk: string, ch: string): string {
  return chunk.replace(/[^\n]/g, ch)
}

/** 把模板标签整体掩码为 \u0000，留下文本节点；引号内的 > 不算标签结束（v-if="a > 0"） */
function maskTags(text: string): string {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] !== '<') {
      out += text[i]
      i++
      continue
    }
    let quote = ''
    let j = i + 1
    for (; j < text.length; j++) {
      const ch = text[j]
      if (quote) { if (ch === quote) quote = '' }
      else if (ch === '"' || ch === "'") quote = ch
      else if (ch === '>') { j++; break }
    }
    out += maskWith(text.slice(i, j), MASK_BREAK)
    i = j
  }
  return out
}

/** .vue 顶层 template 区偏移（跳过 <script>/<style> 块，避免把 JS 代码当模板文本扫） */
function templateRegionOf(raw: string): { start: number; end: number } | null {
  const blocks = [...raw.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g)]
    .map(m => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
  const inBlock = (i: number): boolean => blocks.some(b => i >= b.start && i < b.end)
  const open = [...raw.matchAll(/<template(\s[^>]*)?>/g)].find(m => !inBlock(m.index ?? 0))
  if (!open) return null
  const start = (open.index ?? 0) + open[0].length
  // 取最后一个闭合（嵌套 <template #header> 先闭合，不能取第一个）
  const close = [...raw.matchAll(/<\/template>/g)].filter(m => (m.index ?? 0) > start && !inBlock(m.index ?? 0)).pop()
  return { start, end: close?.index ?? raw.length }
}

/**
 * 规则 template-fullwidth-punct：template 文本节点与静态属性里插值外的全角标点。
 * 只看「剥掉注释/插值/标签后仍在文本位」的字符：`:attr`/`@event`/`v-*` 里的表达式是 JS，
 * 随标签整体掩码掉，天然不查；JS 注释也只可能出现在这两处，同样不必单独剥。
 */
export function collectTemplateFullwidth(rel: string, raw: string): Violation[] {
  const region = templateRegionOf(raw)
  if (!region) return []
  const body = raw.slice(region.start, region.end)
  const masked = body
    .replace(/<!--[\s\S]*?-->/g, m => maskWith(m, MASK_BREAK))
    .replace(/\{\{[\s\S]*?\}\}/g, m => maskWith(m, MASK_INLINE))
  const out: Violation[] = []
  const push = (index: number, text: string): void => {
    const norm = text.replace(/\s+/g, ' ').trim()
    if (!norm) return
    out.push({ file: rel, line: raw.slice(0, region.start + index).split('\n').length, text: norm, rule: 'template-fullwidth-punct' })
  }
  // 静态属性值：名字前不能是 : @ - 等（排除 :attr / v-bind:attr / @event），v-* 指令值同样是表达式
  const attrRe = /(?<![\w:@.-])([a-zA-Z][\w.-]*)\s*=\s*"([^"]*)"/g
  let am: RegExpExecArray | null
  while ((am = attrRe.exec(masked)) !== null) {
    if (/^v-/.test(am[1]) || !FULLWIDTH_PUNCT_RE.test(am[2])) continue
    const valStart = am.index + am[0].indexOf('"') + 1
    push(am.index, body.slice(valStart, valStart + am[2].length))
  }
  // 文本节点：标签整体掩码后逐处命中，命中点向两侧扩到节点边界，取原文整段（便于写进 baseline）
  const nodeText = maskTags(masked)
  const re = new RegExp(FULLWIDTH_PUNCT_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(nodeText)) !== null) {
    let s = m.index
    let e = m.index + m[0].length
    while (s > 0 && nodeText[s - 1] !== MASK_BREAK) s--
    while (e < nodeText.length && nodeText[e] !== MASK_BREAK) e++
    push(s, body.slice(s, e))
    re.lastIndex = e
  }
  return out
}

function walk(dir: string, acc: string[]): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === 'dist' || name.name === '.git') continue
    const p = join(dir, name.name)
    if (name.isDirectory()) {
      if (name.name === '__tests__') continue
      walk(p, acc)
    } else if (/\.(vue|js|ts)$/.test(name.name) && !/\.(test|spec)\.(js|ts)$/.test(name.name)) {
      acc.push(p)
    }
  }
  return acc
}

function collect(): Violation[] {
  const files = walk(SRC, [])
  const violations: Violation[] = [] // { file, line, text }
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/')
    if (rel.startsWith('src/locales/')) continue
    const raw = readFileSync(file, 'utf8')
    const lines = raw.split('\n')
    let inTemplate = false
    lines.forEach((line, idx) => {
      if (file.endsWith('.vue')) {
        const stateLine = stripHtmlComment(stripComment(line))
        if (/<template/.test(stateLine)) inTemplate = true
        if (/<\/template>/.test(stateLine)) inTemplate = false
      }
      const stripped = maskTArgs(stripComment(stripHtmlComment(line)))
      if (!CJK_RE.test(stripped) && !/[A-Za-z]/.test(stripped)) return
      for (const rule of RULES) {
        if (rule.templateOnly && (!file.endsWith('.vue') || !inTemplate)) continue
        const re = new RegExp(rule.re.source, rule.re.flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(stripped)) !== null) {
          let text = (m[2] ?? m[1] ?? '').trim()
          if (rule.label === 'template-interp') text = text.replace(/^['"`]|['"`]$/g, '')
          if (!text || !(CJK_RE.test(text) || /[A-Za-z]/.test(text))) continue
          if (WHITELIST.some(w => text === w)) continue
          violations.push({ file: rel, line: idx + 1, text, rule: rule.label })
        }
      }
    })
    if (file.endsWith('.vue')) violations.push(...collectTemplateFullwidth(rel, raw))
  }
  // index.html 静态 title/meta（b4 盲区；现有中文为已裁决的 SEO 兜底存量）
  if (existsSync(INDEX_HTML)) {
    const raw = readFileSync(INDEX_HTML, 'utf8')
    raw.split('\n').forEach((line, idx) => {
      const stripped = stripHtmlComment(stripComment(line))
      if (!CJK_RE.test(stripped)) return
      for (const rule of HTML_RULES) {
        const re = new RegExp(rule.re.source, rule.re.flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(stripped)) !== null) {
          const text = (m[1] ?? m[2] ?? '').trim()
          if (!text || !CJK_RE.test(text)) continue
          if (WHITELIST.some(w => text === w)) continue
          violations.push({ file: 'index.html', line: idx + 1, text, rule: rule.label })
        }
      }
    })
  }
  return violations
}

/** 递归扁平化 locale 消息对象为点路径键集合（{ a: { b: 'x' } } → 'a.b'） */
function flattenLocaleKeys(value: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return keys
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const sub of flattenLocaleKeys(v, path)) keys.add(sub)
    } else {
      keys.add(path)
    }
  }
  return keys
}

/**
 * L-14: 中英词条键集对齐检查（独立于硬编码扫描）。
 * locales/ 为 TS export default 对象，走动态 import 直取真实结构（零新依赖、免正则误判嵌套键）。
 * 返回缺失清单（空 = 对齐）：任一语言缺键即需拦截。
 */
async function checkLocaleKeyDiff(): Promise<string[]> {
  const zhMod = await import('../src/locales/zh-CN')
  const enMod = await import('../src/locales/en')
  const zhKeys = flattenLocaleKeys(zhMod.default)
  const enKeys = flattenLocaleKeys(enMod.default)
  const problems: string[] = []
  for (const k of zhKeys) if (!enKeys.has(k)) problems.push(`en 缺失 ${k}`)
  for (const k of enKeys) if (!zhKeys.has(k)) problems.push(`zh-CN 缺失 ${k}`)
  return problems.sort()
}

async function main(): Promise<void> {
  const initMode = process.argv.includes('--init')
  const pruneMode = process.argv.includes('--prune')
  const violations = collect()
  const keys = new Set(violations.map(v => `${v.file}\u0000${v.text}`))

  if (initMode) {
    const sorted = [...keys].sort()
    writeFileSync(BASELINE_FILE, JSON.stringify({ version: 1, entries: sorted }, null, 2) + '\n')
    console.log(`[check-i18n] baseline 已重建: ${sorted.length} 条存量违规 → scripts/i18n-baseline.json`)
    for (const v of violations) console.log(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`)
    if (violations.length) console.log(`[check-i18n] 存量违规 ${violations.length} 条（不修，交巡检修复批对照）`)
    return
  }

  if (pruneMode) {
    if (!existsSync(BASELINE_FILE)) {
      console.error('[check-i18n] 缺少 baseline，请先运行: npx tsx scripts/check-i18n.ts --init')
      process.exit(1)
    }
    const entries = (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as BaselineFile).entries
    const current = new Set(violations.map(v => `${v.file}\u0000${v.text}`))
    const kept = [...new Set(entries)].filter(e => current.has(e)).sort()
    writeFileSync(BASELINE_FILE, JSON.stringify({ version: 1, entries: kept }, null, 2) + '\n')
    console.log(`[check-i18n] baseline 已清理: ${entries.length} → ${kept.length} 条（过期条目已移除）`)
    return
  }

  // G2/N2 尾项机制化：拆件/搬文件时存量豁免随路径迁移（取代 9/20 手写一次性脚本）。
  // 安全断言：命中数必须等于 --expect，且迁移只换路径前缀、条目总数不变，否则拒写。
  if (process.argv.includes('--migrate')) {
    const argOf = (flag: string): string | null => {
      const i = process.argv.indexOf(flag)
      return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null
    }
    const from = argOf('--from')
    const to = argOf('--to')
    const expectRaw = argOf('--expect')
    if (!from || !to || expectRaw == null || !/^\d+$/.test(expectRaw)) {
      console.error('[check-i18n] --migrate 需要 --from <旧路径> --to <新路径> --expect <命中条数>')
      process.exit(1)
    }
    if (!existsSync(BASELINE_FILE)) {
      console.error('[check-i18n] 缺少 baseline，请先运行: npx tsx scripts/check-i18n.ts --init')
      process.exit(1)
    }
    const entries = (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as BaselineFile).entries
    const expectHits = Number(expectRaw)
    const SEP = '\u0000'
    let hits = 0
    const migrated = entries.map(e => {
      const idx = e.indexOf(SEP)
      const file = e.slice(0, idx)
      if (file !== from) return e
      hits += 1
      return to + e.slice(idx)
    })
    if (hits !== expectHits) {
      console.error(`[check-i18n] 迁移拒绝写入：旧路径 ${from} 命中 ${hits} 条 ≠ --expect ${expectHits}（baseline 可能已被别批改过，先人工核对）`)
      process.exit(1)
    }
    if (new Set(migrated).size !== entries.length) {
      console.error('[check-i18n] 迁移拒绝写入：迁移后出现重复条目（新路径已有同串豁免？）')
      process.exit(1)
    }
    // 迁移后新条目必须全部在当前扫描结果中真实存在（防把豁免迁到错路径变成死条目遮新违规）
    const current = new Set(violations.map(v => `${v.file}\u0000${v.text}`))
    const orphan = migrated.filter((e, i) => e !== entries[i] && !current.has(e))
    if (orphan.length > 0) {
      console.error(`[check-i18n] 迁移拒绝写入：${orphan.length} 条迁移后在新路径扫不到对应违规（路径写错或文案已改）:`)
      for (const o of orphan) console.error(`  ${o.replace(SEP, ' :: ')}`)
      process.exit(1)
    }
    writeFileSync(BASELINE_FILE, JSON.stringify({ version: 1, entries: [...migrated].sort() }, null, 2) + '\n')
    console.log(`[check-i18n] baseline 路径迁移完成: ${from} → ${to}（${hits} 条，总数 ${entries.length} 不变）`)
    return
  }

  if (!existsSync(BASELINE_FILE)) {
    console.error('[check-i18n] 缺少 baseline，请先运行: npx tsx scripts/check-i18n.ts --init')
    process.exit(1)
  }
  const baseline = new Set((JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as BaselineFile).entries)
  const fresh = violations.filter(v => !baseline.has(`${v.file}\u0000${v.text}`))
  // L-14: 中英词条键集对齐检查（独立于硬编码扫描；与存量/新增违规一并收口，任一缺失即拦截）
  const keyDiff = await checkLocaleKeyDiff()

  if (fresh.length === 0 && keyDiff.length === 0) {
    console.log(`[check-i18n] OK — 存量违规 ${baseline.size} 条豁免，无新增硬编码中文，中英词条键集一致`)
    return
  }
  if (fresh.length > 0) {
    console.error(`[check-i18n] 拦截 ${fresh.length} 处新增硬编码文案（存量已进 baseline，新增必须走 $t 或白名单）:`)
    for (const v of fresh) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`)
    if (fresh.some(v => v.rule === 'template-fullwidth-punct')) {
      console.error('[check-i18n] template-fullwidth-punct：这些全角标点在英文态会原样显示中文标点（中文已走 $t，标点漏在模板里）——把标点并入词条（如 xxxInParens）或移进插值。')
    }
  }
  if (keyDiff.length > 0) {
    console.error(`[check-i18n] 拦截 ${keyDiff.length} 处中英词条键缺失（zh-CN 与 en 必须一一对应）:`)
    for (const p of keyDiff) console.error(`  ${p}`)
  }
  process.exit(1)
}

// 被单测 import 时不执行扫描；门禁/CI/人工调用一律执行——按 argv 路径比对时
// 一旦形态不符（软链、8.3 短路径、包装器）就静默 exit 0，门禁会空跑成假绿
if (!process.env.VITEST) void main()
