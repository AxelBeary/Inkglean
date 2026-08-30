/**
 * check-i18n — 源头防屎门禁（用户红线：禁止新硬编码中文）
 *
 * 职责：
 *   1. 扫描 web/src 下 .vue/.js/.ts 中「用户可见硬编码中文/英文」（template 文本节点、
 *      ElMessage/ElMessageBox/alert/confirm 参数、placeholder/title/label 等属性）。
 *   2. 存量违规写入 baseline（scripts/i18n-baseline.json）豁免，不修存量；
 *      新增违规直接 exit 1 拦截——「为了过验证而绕」和「新增屎山」在提交时被拦下。
 *
 * 用法：
 *   npx tsx scripts/check-i18n.ts            # 增量检查（CI/提交前跑，新增违规 exit 1）
 *   npx tsx scripts/check-i18n.ts --init     # 重建 baseline + 输出存量违规清单（不拦截）
 *   npx tsx scripts/check-i18n.ts --prune    # 仅移除 baseline 中已不存在的过期条目（不新增）
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

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
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

/** 模板/JS 中用户可见的文本位置（正则） */
const RULES: I18nRule[] = [
  // template 文本节点：>中文<
  { label: 'template-text', templateOnly: true, re: />\s*([^<>{}\n]*[\u4e00-\u9fff][^<>{}\n]*)</g },
  // template 文本节点：>English<（b4 盲区；品牌名/语言自指走 WHITELIST）
  { label: 'template-text-en', templateOnly: true, re: />\s*((?!\/)[^<>{}\n]*[A-Za-z][^<>{}\n]*)</g },
  // {{ }} 插值里的中文串字面量（b4 盲区；$t/t 参数已在 maskTArgs 剔除）
  { label: 'template-interp', templateOnly: true, re: /\{\{([^{}]*?)(['"`][^'"`\n]*[\u4e00-\u9fff][^'"`\n]*['"`])[^{}]*\}\}/g },
  // 常见展示属性（直接写死的静态值）
  { label: 'attr', re: /(?<![\w:@-])\b(placeholder|title|label|aria-label|empty-text|append-text|confirm-button-text|cancel-button-text|alt|text|content|description|tooltip|aria-description|aria-placeholder)\s*=\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g },
  // 静态英文展示属性（b4 盲区；绑定表达式 :attr= 不查）
  { label: 'attr-en', re: /(?<![\w:@-])\b(placeholder|title|label|aria-label|empty-text|append-text|confirm-button-text|cancel-button-text|alt|text|content|description|tooltip|aria-description|aria-placeholder)\s*=\s*"([^"]*[A-Za-z][^"]*)"/g },
  // 冒号绑定里直接写死的中文字符串字面量（:placeholder="'请输入'" 之类）
  { label: 'bound-literal', re: /:\s*(placeholder|title|label|aria-label)\s*=\s*"'\s*([^'"]*[\u4e00-\u9fff][^'"]*)\s*'"/g },
  // 冒号绑定里反引号字面量（b4 盲区：:title="`中文`"）
  { label: 'bound-literal-ticks', re: /:\s*(placeholder|title|label|aria-label|alt|text|tooltip|description|aria-description)\s*=\s*"`([^"`\n]*[\u4e00-\u9fff][^"`\n]*)`"/g },
  // ElMessage / ElMessageBox / alert / confirm 参数
  { label: 'message', re: /\b(?:ElMessage\.(?:success|error|warning|info)|ElMessageBox\.(?:alert|confirm|prompt)|alert|confirm)\s*\(\s*['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)['"`]/g },
  // 英文可见提示（b4 盲区）
  { label: 'message-en', re: /\b(?:ElMessage\.(?:success|error|warning|info)|ElMessageBox\.(?:alert|confirm|prompt)|alert|confirm)\s*\(\s*['"`]([^'"`\n]*[A-Za-z][^'"`\n]*)['"`]/g },
  // ElMessageBox 第二参（标题，b4 盲区；当前无实例）
  { label: 'message-2nd', re: /\bElMessageBox\.(?:alert|confirm|prompt)\s*\(\s*[^,]+?,\s*['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)['"`]/g },
  // 对象字面量错误消息（{ message: '中文' } / { error: '中文' }）
  { label: 'err-object', re: /\b(?:message|error|title)\s*:\s*['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)['"`]/g },
  // new Error('中文') 构造参数（b4 盲区：可能经 err.message 上抛给用户）
  { label: 'err-ctor', re: /\bnew\s+Error\s*\(\s*['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)['"`]/g }
]

/** web/index.html 静态 title/meta（b4 盲区；现有中文为已裁决的 SEO 兜底存量） */
const HTML_RULES: I18nRule[] = [
  { label: 'html-title', re: /<\s*title\s*>([^<]*[\u4e00-\u9fff][^<]*)<\s*\/\s*title\s*>/g },
  { label: 'html-meta', re: /\b(?:content|name|property|site_name)\s*=\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g }
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
      if (!/[\u4e00-\u9fff]/.test(stripped) && !/[A-Za-z]/.test(stripped)) return
      for (const rule of RULES) {
        if (rule.templateOnly && (!file.endsWith('.vue') || !inTemplate)) continue
        const re = new RegExp(rule.re.source, rule.re.flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(stripped)) !== null) {
          let text = (m[2] ?? m[1] ?? '').trim()
          if (rule.label === 'template-interp') text = text.replace(/^['"`]|['"`]$/g, '')
          if (!text || !(/[\u4e00-\u9fff]/.test(text) || /[A-Za-z]/.test(text))) continue
          if (WHITELIST.some(w => text === w)) continue
          violations.push({ file: rel, line: idx + 1, text, rule: rule.label })
        }
      }
    })
  }
  // index.html 静态 title/meta（b4 盲区；现有中文为已裁决的 SEO 兜底存量）
  if (existsSync(INDEX_HTML)) {
    const raw = readFileSync(INDEX_HTML, 'utf8')
    raw.split('\n').forEach((line, idx) => {
      const stripped = stripHtmlComment(stripComment(line))
      if (!/[\u4e00-\u9fff]/.test(stripped)) return
      for (const rule of HTML_RULES) {
        const re = new RegExp(rule.re.source, rule.re.flags)
        let m: RegExpExecArray | null
        while ((m = re.exec(stripped)) !== null) {
          const text = (m[1] ?? m[2] ?? '').trim()
          if (!text || !/[\u4e00-\u9fff]/.test(text)) continue
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
    console.error(`[check-i18n] 拦截 ${fresh.length} 处新增硬编码中文（存量已进 baseline，新增必须走 $t 或白名单）:`)
    for (const v of fresh) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`)
  }
  if (keyDiff.length > 0) {
    console.error(`[check-i18n] 拦截 ${keyDiff.length} 处中英词条键缺失（zh-CN 与 en 必须一一对应）:`)
    for (const p of keyDiff) console.error(`  ${p}`)
  }
  process.exit(1)
}

void main()
