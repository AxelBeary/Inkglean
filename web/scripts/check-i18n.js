#!/usr/bin/env node
/**
 * check-i18n — 源头防屎门禁（用户红线：禁止新硬编码中文）
 *
 * 职责：
 *   1. 扫描 web/src 下 .vue/.js 中「用户可见硬编码中文」（template 文本节点、
 *      ElMessage/ElMessageBox/alert/confirm 参数、placeholder/title/label 等属性）。
 *   2. 存量违规写入 baseline（scripts/i18n-baseline.json）豁免，不修存量；
 *      新增违规直接 exit 1 拦截——「为了过验证而绕」和「新增屎山」在提交时被拦下。
 *
 * 用法：
 *   node scripts/check-i18n.js            # 增量检查（CI/提交前跑，新增违规 exit 1）
 *   node scripts/check-i18n.js --init     # 重建 baseline + 输出存量违规清单（不拦截）
 *
 * 设计取舍（启发式，可能有误报）：
 *   - 只扫「用户可见」位置，不扫普通字符串字面量（状态 key、日期格式等内部值不拦）
 *   - 排除：locales/ 文件、JS/HTML 注释、$t(...) 参数、*.test.js / __tests__、白名单词
 *   - baseline key = 相对路径 + 违规串原文；存量字符串未改即豁免，新增/修改即拦截
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, relative, sep } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const BASELINE_FILE = join(ROOT, 'scripts', 'i18n-baseline.json')

/** 合法中文白名单（品牌名/专有名词等，命中即豁免整串） */
const WHITELIST = [
  '绘约',
  '中'  // 语言切换自指字（国际惯例：语言名用自身文字显示，不翻译）
]

/** 模板/JS 中用户可见的文本位置（正则） */
const RULES = [
  // template 文本节点：>中文<
  { label: 'template-text', re: />\s*([^<>{}\n]*[\u4e00-\u9fff][^<>{}\n]*)</g },
  // 常见展示属性（直接写死的静态值）
  { label: 'attr', re: /\b(placeholder|title|label|aria-label|empty-text|append-text|confirm-button-text|cancel-button-text)\s*=\s*"([^"]*[\u4e00-\u9fff][^"]*)"/g },
  // 冒号绑定里直接写死的中文字符串字面量（:placeholder="'请输入'" 之类）
  { label: 'bound-literal', re: /:\s*(placeholder|title|label|aria-label)\s*=\s*"'\s*([^'"]*[\u4e00-\u9fff][^'"]*)\s*'"/g },
  // ElMessage / ElMessageBox / alert / confirm 参数
  { label: 'message', re: /\b(?:ElMessage\.(?:success|error|warning|info)|ElMessageBox\.(?:alert|confirm|prompt)|alert|confirm)\s*\(\s*['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)['"`]/g },
  // 对象字面量错误消息（{ message: '中文' } / { error: '中文' }）
  { label: 'err-object', re: /\b(?:message|error|title)\s*:\s*['"`]([^'"`\n]*[\u4e00-\u9fff][^'"`\n]*)['"`]/g }
]

/** 剥离 JS 行内注释（// 与块注释）——粗略但够用：注释里的中文不算违规 */
function stripComment(line) {
  let out = ''
  let i = 0
  let quote = null
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
function stripHtmlComment(line) {
  return line.replace(/<!--[\s\S]*?-->/g, '')
}

/** 过滤掉 $t(...) 参数内的中文（key 不是用户可见文案） */
function maskTArgs(text) {
  return text.replace(/\$t\s*\(\s*['"`][^'"`]*['"`]/g, '')
}

function walk(dir, acc) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === 'dist' || name.name === '.git') continue
    const p = join(dir, name.name)
    if (name.isDirectory()) {
      if (name.name === '__tests__') continue
      walk(p, acc)
    } else if (/\.(vue|js)$/.test(name.name) && !name.name.endsWith('.test.js')) {
      acc.push(p)
    }
  }
  return acc
}

function collect() {
  const files = walk(SRC, [])
  const violations = [] // { file, line, text }
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/')
    if (rel.startsWith('src/locales/')) continue
    const raw = readFileSync(file, 'utf8')
    const lines = raw.split('\n')
    lines.forEach((line, idx) => {
      const stripped = maskTArgs(stripComment(stripHtmlComment(line)))
      if (!/[\u4e00-\u9fff]/.test(stripped)) return
      for (const rule of RULES) {
        const re = new RegExp(rule.re.source, rule.re.flags)
        let m
        while ((m = re.exec(stripped)) !== null) {
          const text = (m[2] ?? m[1] ?? '').trim()
          if (!text || !/[\u4e00-\u9fff]/.test(text)) continue
          if (WHITELIST.some(w => text === w)) continue
          violations.push({ file: rel, line: idx + 1, text, rule: rule.label })
        }
      }
    })
  }
  return violations
}

function main() {
  const initMode = process.argv.includes('--init')
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

  if (!existsSync(BASELINE_FILE)) {
    console.error('[check-i18n] 缺少 baseline，请先运行: node scripts/check-i18n.js --init')
    process.exit(1)
  }
  const baseline = new Set(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).entries)
  const fresh = violations.filter(v => !baseline.has(`${v.file}\u0000${v.text}`))
  if (fresh.length === 0) {
    console.log(`[check-i18n] OK — 存量违规 ${baseline.size} 条豁免，无新增硬编码中文`)
    return
  }
  console.error(`[check-i18n] 拦截 ${fresh.length} 处新增硬编码中文（存量已进 baseline，新增必须走 $t 或白名单）:`)
  for (const v of fresh) console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.text}`)
  process.exit(1)
}

main()